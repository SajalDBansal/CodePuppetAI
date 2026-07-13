import type { Request, Response } from "express";
import { prisma, type StopReason, type Prisma } from "@workspace/database";
import { StartSessionSchema, type ProviderMessage, type ProviderStreamEvent } from "@workspace/protocol";
import { requireUserId } from "../utils/request.js";
import { validate } from "../utils/validate.js";
import { NotFoundError } from "../utils/api-error.js";
import { decryptCredential } from "../service/credential-vault.js";
import { providerRegistry, toolRegistry } from "../utils/environment.js";
import { SYSTEM_PROMPTS } from "../utils/system-promt.js";

// writes one Server-Sent-Event frame to the client
function sendEvent(response: Response, event: ProviderStreamEvent): void {
    response.write(`data: ${JSON.stringify(event)}\n\n`);
}

export class AgentSessionController {
    listSessions = async (request: Request, response: Response): Promise<Response> => {
        return response.status(200).json({})
    }

    startSession = async (request: Request, response: Response): Promise<Response> => {
        const userId = requireUserId(request);
        const input = validate(StartSessionSchema, request.body);

        // the CLI tells us exactly which stored credential to use for this provider
        const credential = await prisma.providerCredential.findFirst({
            where: { userId, providerId: input.providerId, label: input.credentialLabel },
        });
        if (!credential) {
            throw new NotFoundError("No credential found for this provider and label.");
        }

        // create the session, its first interaction, and the seeded user message together
        const { session, interaction } = await prisma.$transaction(async (tx) => {
            const session = await tx.agentSession.create({
                data: {
                    userId,
                    providerId: input.providerId,
                    modelId: input.modelId,
                    title: input.title,
                    systemPrompt: input.systemPrompt,
                },
            });
            const interaction = await tx.agentInteraction.create({
                data: {
                    sessionId: session.id,
                    sequence: 1,
                    providerId: input.providerId,
                    modelId: input.modelId,
                    mode: input.mode,
                    thinkingLevel: input.thinkingLevel,
                    temperature: input.temperature,
                    maxOutputTokens: input.maxOutputTokens,
                    credentialId: credential.id,
                },
            });
            await tx.agentMessage.create({
                data: {
                    sessionId: session.id,
                    interactionId: interaction.id,
                    sequence: 1,
                    role: "USER",
                    content: input.message,
                },
            });
            return { session, interaction };
        });

        // everything below streams to the client, so open the SSE response now
        response.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        });

        // turn the stored, encrypted credential back into a usable API key
        const apiKey = decryptCredential(credential, {
            userId,
            providerId: input.providerId,
            label: input.credentialLabel,
        });

        // cancel the provider call if the client disconnects mid-stream
        const abortController = new AbortController();
        request.on("close", () => abortController.abort());

        const messages: ProviderMessage[] = [{ role: "user", content: input.message }];

        // local variables that collect the stream as it comes in - nothing is written
        // to the database until the stream is fully finished
        let textBuffer = "";
        const toolCalls: { id: string; name: string; arguments: Record<string, unknown> }[] = [];
        let usageInfo: { inputTokens: number; outputTokens: number; cachedTokens: number; reasoningTokens?: number } | undefined;
        let errorInfo: { code: string; message: string } | undefined;
        let stopReason: StopReason | undefined;
        let responseId: string | undefined;

        const stream = providerRegistry.stream(
            input.providerId,
            {
                modelId: input.modelId,
                messages,
                systemPrompt: (SYSTEM_PROMPTS[input.mode] + input.systemPrompt),
                tools: toolRegistry.getProviderTools(),
                temperature: input.temperature,
                maxOutputTokens: input.maxOutputTokens,
            },
            { apiKey },
            abortController.signal,
        );

        for await (const event of stream) {
            sendEvent(response, event);

            if (event.type === "text_delta") {
                textBuffer += event.text;
            } else if (event.type === "tool_call") {
                toolCalls.push({ id: event.id, name: event.name, arguments: event.arguments });
            } else if (event.type === "usage") {
                usageInfo = event;
            } else if (event.type === "error") {
                errorInfo = { code: event.code, message: event.message };
            } else if (event.type === "done") {
                stopReason = event.stopReason;
                responseId = event.responseId;
            }
        }

        const interactionStatus = errorInfo ? "ERROR" : stopReason === "TOOL_USE" ? "RUNNING" : "COMPLETED";

        await prisma.$transaction(async (tx) => {
            const turn = await tx.agentTurn.create({
                data: {
                    sessionId: session.id,
                    interactionId: interaction.id,
                    sequence: 1,
                    responseId,
                    stopReason,
                    inputTokens: usageInfo?.inputTokens ?? 0,
                    outputTokens: usageInfo?.outputTokens ?? 0,
                    cachedTokens: usageInfo?.cachedTokens ?? 0,
                    reasoningTokens: usageInfo?.reasoningTokens ?? 0,
                },
            });

            let nextSequence = 2; // sequence 1 was the seeded user message

            if (textBuffer) {
                await tx.agentMessage.create({
                    data: {
                        sessionId: session.id,
                        interactionId: interaction.id,
                        turnId: turn.id,
                        sequence: nextSequence++,
                        role: "ASSISTANT",
                        content: textBuffer,
                        isError: errorInfo ? true : undefined,
                    },
                });
            }

            if (toolCalls.length > 0) {
                await tx.agentMessage.create({
                    data: {
                        sessionId: session.id,
                        interactionId: interaction.id,
                        turnId: turn.id,
                        sequence: nextSequence++,
                        role: "ASSISTANT",
                        toolCalls: toolCalls as Prisma.InputJsonValue,
                        isError: errorInfo ? true : undefined,
                    },
                });
            }

            await tx.agentInteraction.update({
                where: { id: interaction.id },
                data: {
                    status: interactionStatus,
                    completedAt: interactionStatus === "RUNNING" ? undefined : new Date(),
                    inputTokens: usageInfo?.inputTokens,
                    outputTokens: usageInfo?.outputTokens,
                },
            });

            await tx.agentSession.update({
                where: { id: session.id },
                data: { lastMessageAt: new Date() },
            });
        });

        response.end();
        return response;
    }

    continueSession = async (request: Request, response: Response): Promise<Response> => {
        return response.status(200).json({})
    }

}
