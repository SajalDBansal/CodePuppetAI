
import { ProviderToolDefinition, ThinkingLevel } from "@workspace/protocol";
import { ProviderAdapter, ProviderCredentials, ProviderStopReason, ProviderStreamEvent, ProviderStreamRequest } from "@workspace/protocol";
import OpenAI from "openai";
import { FunctionTool, Response, ResponseInputItem } from "openai/resources/responses/responses";
import { getSystemPrompt } from "../utils.js";
import { ReasoningEffort } from "openai/resources";

type OpenAIClientGenerator = (apiKey: string) => OpenAI

export class OpenaiProvider implements ProviderAdapter {
    readonly id = "openai" as const

    constructor(
        private readonly createClient: OpenAIClientGenerator = (apiKey) => new OpenAI({ apiKey })
    ) { }

    async *stream(
        request: ProviderStreamRequest,
        credentials: ProviderCredentials,
        signal?: AbortSignal
    ): AsyncGenerator<ProviderStreamEvent, void, unknown> {
        const client = this.createClient(credentials.apiKey);
        const stream = client.responses.stream({
            model: request.modelId,
            input: toResponsesInput(request),
            instructions: getSystemPrompt(request),
            tools: toResponsesTools(request.tools),
            temperature: request.temperature,
            max_output_tokens: request.maxOutputTokens,
            store: false,
            reasoning: {
                effort: toOpenaiThinkingConfig(request.thinkingLevel),
            },
        }, { signal });

        for await (const event of stream) {
            if (event.type === "response.output_text.delta") {
                yield { type: "text_delta", text: event.delta }
            }
        }

        const response = await stream.finalResponse();

        let hasToolCalls = false
        for (const item of response.output) {
            if (item.type !== "function_call") {
                continue;
            }
            hasToolCalls = true
            yield {
                type: "tool_call",
                id: item.call_id,
                name: item.name,
                arguments: parseToolArguments(item.arguments),
                providerMetadata: {},
            }
        }

        if (response.usage) {
            yield {
                type: "usage",
                inputTokens: response.usage.input_tokens ?? 0,
                outputTokens: response.usage.output_tokens ?? 0,
                cachedTokens: response.usage.input_tokens_details?.cached_tokens ?? 0,
                reasoningTokens: response.usage.output_tokens_details?.reasoning_tokens,
            }
        }

        yield {
            type: "done",
            responseId: response.id,
            stopReason: hasToolCalls ? "TOOL_USE" : mapResponsesStopReason(response)
        }
    }
}

function toResponsesInput(request: ProviderStreamRequest): ResponseInputItem[] {
    const input: ResponseInputItem[] = []

    for (const message of request.messages) {
        if (message.role === "system") {
            continue;
        }

        if (message.role === "user") {
            input.push({ role: "user", content: message.content })
            continue;
        }

        if (message.role === "tool") {
            input.push({
                type: "function_call_output",
                call_id: message.toolCallId,
                output: message.isError ? `Error: ${message.content}` : message.content,
            })
            continue;
        }

        if (message.role === "assistant") {
            if (message.content) {
                input.push({ role: "assistant", content: message.content })
            }
            for (const toolCall of message.toolCalls ?? []) {
                input.push({
                    type: "function_call",
                    call_id: toolCall.id,
                    name: toolCall.name,
                    arguments: JSON.stringify(toolCall.arguments),
                })
            }
        }
    }

    return input;
}

function toResponsesTools(tools?: ProviderToolDefinition[]): FunctionTool[] | undefined {
    if (!tools || tools.length === 0) {
        return undefined
    }

    return tools.map((tool) => ({
        type: "function",
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
        strict: false,
    }))
}

function parseToolArguments(rawArguments: string): Record<string, unknown> {
    if (!rawArguments) {
        return {}
    }

    try {
        return JSON.parse(rawArguments)
    } catch {
        return {}
    }
}

function mapResponsesStopReason(response: Response): ProviderStopReason {
    if (response.status === "completed") return "END_TURN"
    if (response.status === "incomplete") {
        return response.incomplete_details?.reason === "max_output_tokens" ? "MAX_TOKENS" : "UNKNOWN"
    }
    if (response.status === "cancelled") return "CANCELLED"
    if (response.status === "failed") return "ERROR"
    return "UNKNOWN"
}


function toOpenaiThinkingConfig(level?: ThinkingLevel): ReasoningEffort {
    if (!level) return null

    switch (level) {
        case "INSTANT":
            return "medium"

        case "MID":
            return "high"

        case "HIGH":
            return "xhigh"
        default:
            return "medium"
    }
}