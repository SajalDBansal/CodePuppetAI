import { ProviderToolDefinition, ThinkingLevel } from "@workspace/protocol";
import { ProviderAdapter, ProviderCredentials, ProviderStopReason, ProviderStreamEvent, ProviderStreamRequest } from "@workspace/protocol";
import { Content, FinishReason, GenerateContentResponseUsageMetadata, GoogleGenAI, Tool } from "@google/genai";
import { getSystemPrompt } from "../utils.js";

type GoogleClientGenerator = (apiKey: string) => GoogleGenAI

export class GoogleProvider implements ProviderAdapter {
    readonly id = "google" as const

    constructor(
        private readonly createClient: GoogleClientGenerator = (apiKey) => new GoogleGenAI({ apiKey })
    ) { }

    async *stream(
        request: ProviderStreamRequest,
        credentials: ProviderCredentials,
        signal?: AbortSignal
    ): AsyncGenerator<ProviderStreamEvent, void, unknown> {
        const client = this.createClient(credentials.apiKey);
        const stream = await client.models.generateContentStream({
            model: request.modelId,
            contents: toGoogleContents(request),
            config: {
                abortSignal: signal,
                systemInstruction: getSystemPrompt(request),
                temperature: request.temperature,
                maxOutputTokens: request.maxOutputTokens,
                tools: toGoogleTools(request.tools),
                thinkingConfig: toGeminiThinkingConfig(request.thinkingLevel),
            }
        });

        let responseId: string | undefined
        let usage: GenerateContentResponseUsageMetadata | undefined
        let finishReason: FinishReason | undefined
        let toolCallNumber = 0
        let hasToolCalls = false

        for await (const chunk of stream) {
            responseId = chunk.responseId ?? responseId
            usage = chunk.usageMetadata ?? usage
            finishReason = chunk.candidates?.[0]?.finishReason ?? finishReason
            for (const candidate of chunk.candidates ?? []) {
                for (const part of candidate.content?.parts ?? []) {
                    if (part.text && !part.thought) {
                        yield { type: "text_delta", text: part.text }
                    }

                    if (part.functionCall?.name) {
                        hasToolCalls = true
                        const id = part.functionCall.id ?? `google-tool-${responseId ?? "response"}-${toolCallNumber}`
                        toolCallNumber += 1;

                        yield {
                            type: "tool_call",
                            id,
                            name: part.functionCall.name,
                            arguments: part.functionCall.args ?? {},
                            providerMetadata: {
                                google: {
                                    thoughtSignature: part.thoughtSignature
                                }
                            }
                        }

                    }
                }
            }

        }

        if (usage) {
            yield {
                type: "usage",
                inputTokens: usage.promptTokenCount ?? 0,
                outputTokens: usage.candidatesTokenCount ?? 0,
                cachedTokens: usage.cachedContentTokenCount ?? 0,
                reasoningTokens: usage.thoughtsTokenCount
            }
        }

        yield {
            type: "done",
            responseId,
            stopReason: hasToolCalls ? "TOOL_USE" : mapGoogleStopReason(finishReason)
        }
    }
}

function toGoogleContents(request: ProviderStreamRequest): Content[] {
    const contents: Content[] = []

    for (const message of request.messages) {
        if (message.role === "system") {
            continue;
        }

        if (message.role === "user") {
            contents.push({ role: "user", parts: [{ text: message.content }] })
            continue;
        }

        if (message.role === "tool") {
            contents.push({
                role: "user",
                parts: [
                    {
                        functionResponse: {
                            id: message.toolCallId,
                            name: message.name,
                            response: message.isError ? { error: message.content } : { output: message.content }
                        }
                    }
                ]
            })
            continue;
        }

        if (message.role === "assistant") {
            const parts = [];
            if (message.content) {
                parts.push({ text: message.content })
            }
            for (const toolCall of message.toolCalls ?? []) {
                parts.push({
                    functionCall: {
                        id: toolCall.id,
                        name: toolCall.name,
                        args: toolCall.arguments,
                    },
                    thoughtSignature: (toolCall.providerMetadata?.google as { thoughtSignature?: string } | undefined)?.thoughtSignature
                })
            }
            contents.push({ role: "model", parts })
        }
    }

    return contents;
}

function toGoogleTools(tools?: ProviderToolDefinition[]): Tool[] | undefined {
    if (!tools || tools.length === 0) {
        return undefined
    }

    return [
        {
            functionDeclarations: tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                parametersJsonSchema: tool.inputSchema,
            }))
        }
    ]
}

function mapGoogleStopReason(finishReason: FinishReason | undefined): ProviderStopReason {
    if (finishReason === FinishReason.STOP) return "END_TURN"
    if (finishReason === FinishReason.MAX_TOKENS) return "MAX_TOKENS"
    return "UNKNOWN"
}

function toGeminiThinkingConfig(level?: ThinkingLevel) {
    if (!level) return undefined

    switch (level) {
        case "INSTANT":
            return {
                thinkingBudget: 1024,
            }

        case "MID":
            return {
                thinkingBudget: 4096,
            }

        case "HIGH":
            return {
                thinkingBudget: 8192,
            }
        default:
            return {
                thinkingBudget: 1024,
            }
    }
}