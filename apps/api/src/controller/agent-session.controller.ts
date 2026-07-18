import type { Request, Response } from "express";
import { prisma, type StopReason, type Prisma } from "@workspace/database";
import { StartSessionSchema, ContinueSessionSchema, SessionIdParamsSchema, type ProviderMessage, type ProviderStreamEvent, type ProviderToolCall, ThinkingLevel, ListSessionHistoryParamsSchema } from "@workspace/protocol";
import { requireUserId } from "../utils/request.js";
import { validate } from "../utils/validate.js";
import { NotFoundError, ConflictError } from "../utils/api-error.js";
import { decryptCredential } from "../service/credential-vault.js";
import { providerRegistry, toolRegistry } from "../utils/environment.js";
import { SYSTEM_PROMPTS } from "../utils/system-promt.js";

// writes one Server-Sent-Event frame to the client
function sendEvent(response: Response, event: ProviderStreamEvent): void {
    response.write(`data: ${JSON.stringify(event)}\n\n`);
}

type ProviderTurnCall = {
    request: Request
    response: Response
    credential: { apiKey: string, id: string }
    providerId: string
    modelId: string
    systemPrompt: string
    messages: ProviderMessage[]
    sessionId: string
    interactionId: string
    turnSequence: number
    nextMessageSequence: number
    temperature?: number
    maxOutputTokens?: number
    thinkingLevel?: ThinkingLevel
}

async function runTurn(params: ProviderTurnCall): Promise<void> {
    const { request, response, sessionId, interactionId, turnSequence } = params;

    const isProviderAvailable = providerRegistry.has(params.providerId);

    if (!isProviderAvailable) {
        throw new NotFoundError("The selected provider is not available");
    }

    response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
    });

    const abortController = new AbortController();
    request.on("close", () => abortController.abort());

    // local variables that collect the stream as it comes in - nothing is written
    // to the database until the stream is fully finished
    let textBuffer = "";
    const toolCalls: { id: string; name: string; arguments: Record<string, unknown> }[] = [];
    let usageInfo: { inputTokens: number; outputTokens: number; cachedTokens: number; reasoningTokens?: number } | undefined;
    let errorInfo: { code: string; message: string } | undefined;
    let stopReason: StopReason | undefined;
    let responseId: string | undefined;

    const stream = providerRegistry.stream(
        params.providerId,
        {
            modelId: params.modelId,
            messages: params.messages,
            systemPrompt: params.systemPrompt,
            tools: toolRegistry.getProviderTools(),
            temperature: params.temperature,
            maxOutputTokens: params.maxOutputTokens,
            thinkingLevel: params.thinkingLevel
        },
        { apiKey: params.credential.apiKey },
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
                sessionId,
                interactionId,
                sequence: turnSequence,
                responseId,
                stopReason,
                inputTokens: usageInfo?.inputTokens ?? 0,
                outputTokens: usageInfo?.outputTokens ?? 0,
                cachedTokens: usageInfo?.cachedTokens ?? 0,
                reasoningTokens: usageInfo?.reasoningTokens ?? 0,
            },
        });

        let nextSequence = params.nextMessageSequence;

        if (textBuffer) {
            await tx.agentMessage.create({
                data: {
                    sessionId,
                    interactionId,
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
                    sessionId,
                    interactionId,
                    turnId: turn.id,
                    sequence: nextSequence++,
                    role: "ASSISTANT",
                    toolCalls: toolCalls as Prisma.InputJsonValue,
                    isError: errorInfo ? true : undefined,
                },
            });
        }

        await tx.agentInteraction.update({
            where: { id: interactionId },
            data: {
                status: interactionStatus,
                completedAt: interactionStatus === "RUNNING" ? undefined : new Date(),
                inputTokens: { increment: usageInfo?.inputTokens ?? 0 },
                outputTokens: { increment: usageInfo?.outputTokens ?? 0 },
            },
        });

        await tx.agentSession.update({
            where: { id: sessionId },
            data: { lastMessageAt: new Date() },
        });

        await tx.providerCredential.update({
            where: { id: params.credential.id },
            data: { lastUsedAt: new Date() }
        })


    });

    response.end();
}

export class AgentSessionController {
    getSessionMetadata = async (request: Request, response: Response): Promise<Response> => {
        const userId = requireUserId(request);
        const data = await prisma.agentSession.findFirst({
            where: { userId },
            select: {
                id: true,
                providerId: true,
                modelId: true,
                title: true,
                status: true,
                createdAt: true,
                updatedAt: true,
                lastMessageAt: true,
            }
        })

        if (!data) {
            throw new NotFoundError("Session not found.");
        }

        return response.status(200).json(data)
    }

    getSessionByIdData = async (request: Request, response: Response): Promise<Response> => {
        const userId = requireUserId(request);
        const query = validate(ListSessionHistoryParamsSchema, request.query);
        const data = await prisma.agentSession.findFirst({
            where: {
                id: query.sessionId,
                userId
            },
            select: {
                id: true,
                userId: true,
                providerId: true,
                modelId: true,
                title: true,
                systemPrompt: true,
                status: true,
                createdAt: true,
                updatedAt: true,
                lastMessageAt: true,

                interactions: {
                    orderBy: {
                        sequence: "asc",
                    },
                    select: {
                        id: true,
                        sequence: true,
                        providerId: true,
                        modelId: true,
                        mode: true,
                        thinkingLevel: true,
                        temperature: true,
                        maxOutputTokens: true,
                        inputTokens: true,
                        outputTokens: true,
                        status: true,
                        startedAt: true,
                        completedAt: true,

                        turns: {
                            orderBy: {
                                sequence: "asc",
                            },
                            select: {
                                id: true,
                                sequence: true,
                                responseId: true,
                                stopReason: true,
                                inputTokens: true,
                                outputTokens: true,
                                cachedTokens: true,
                                reasoningTokens: true,
                                createdAt: true,
                            },
                        },

                        messages: {
                            orderBy: {
                                sequence: "asc",
                            },
                            select: {
                                id: true,
                                sequence: true,
                                turnId: true,
                                role: true,
                                content: true,
                                toolCalls: true,
                                toolCallId: true,
                                name: true,
                                isError: true,
                                providerMetadata: true,
                                createdAt: true,
                            },
                        },
                    },
                },

                // Optional: useful if compactions are part of your UI/history.
                compactions: {
                    orderBy: {
                        createdAt: "asc",
                    },
                },
            },
        });

        if (!data) {
            throw new NotFoundError("Session not found.");
        }

        return response.status(200).json(data)
    }

    usage = async (request: Request, response: Response): Promise<Response> => {
        // we will implement the cost usage and other details here will not store these data directly in the database
        return response.status(200).json({});
    }

    startSession = async (request: Request, response: Response): Promise<Response> => {
        const userId = requireUserId(request);
        const input = validate(StartSessionSchema, request.body);

        // check if the provider and model is supported by us in the database
        const [provider, model] = await Promise.all([
            prisma.providerCatalog.findFirst({ where: { providerId: input.providerId }, select: { displayName: true } }),
            prisma.modelCatalog.findFirst({
                where: { providerId: input.providerId, modelId: input.modelId },
                select: { displayName: true, maxOutputTokens: true }
            }),
        ])

        if (!provider || !model) {
            throw new NotFoundError("The selected provider or model is not supported by the program")
        }

        if (input.maxOutputTokens && model.maxOutputTokens < input.maxOutputTokens) {
            throw new ConflictError("The model do not support the max output token as the user served");
        }

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

        const apiKey = decryptCredential(credential, {
            userId,
            providerId: input.providerId,
            label: input.credentialLabel,
        });

        await runTurn({
            request,
            response,
            credential: { apiKey, id: credential.id },
            providerId: input.providerId,
            modelId: input.modelId,
            systemPrompt: `${SYSTEM_PROMPTS[input.mode]}\n\n${input.systemPrompt ?? ""}`.trim(),
            messages: [{ role: "user", content: input.message }],
            sessionId: session.id,
            interactionId: interaction.id,
            turnSequence: 1,
            nextMessageSequence: 2, // sequence 1 was the seeded user message
            temperature: input.temperature,
            maxOutputTokens: input.maxOutputTokens,
            thinkingLevel: input.thinkingLevel
        });

        return response;
    }

    continueSession = async (request: Request, response: Response): Promise<Response> => {
        const userId = requireUserId(request);
        const { sessionId } = validate(SessionIdParamsSchema, request.params);
        const input = validate(ContinueSessionSchema, request.body);

        const session = await prisma.agentSession.findFirst({ where: { id: sessionId, userId } });
        if (!session) {
            throw new NotFoundError("Session not found.");
        }
        if (session.status !== "ACTIVE") {
            throw new ConflictError("This session is archived and cannot be continued.");
        }

        const latestInteraction = await prisma.agentInteraction.findFirst({
            where: { sessionId },
            orderBy: { sequence: "desc" },
        });

        const credential = await prisma.providerCredential.findFirst({
            where: { userId, providerId: session.providerId, label: input.credentialLabel },
        });
        if (!credential) {
            throw new NotFoundError("No credential found for this provider and label.");
        }

        // sequence numbers are session-wide for messages, per-interaction for turns -
        // work out where each counter currently stands before writing anything
        const lastMessage = await prisma.agentMessage.findFirst({ where: { sessionId }, orderBy: { sequence: "desc" } });
        let nextMessageSequence = (lastMessage?.sequence ?? 0) + 1;

        // assigned by whichever branch below runs
        let interaction: NonNullable<typeof latestInteraction>;
        let turnSequence: number;

        if (input.toolResults) {
            // branch 1: answering pending tool calls - there must be an open
            // interaction to answer. No interaction at all is the same failure as a closed one.
            if (!latestInteraction || latestInteraction.status !== "RUNNING") {
                throw new ConflictError("This session has no pending tool calls to answer.");
            }
            interaction = latestInteraction;

            const lastTurn = await prisma.agentTurn.findFirst({
                where: { interactionId: interaction.id },
                orderBy: { sequence: "desc" },
            });
            turnSequence = (lastTurn?.sequence ?? 0) + 1;

            // the assistant message that ended the previous turn carries the
            // original tool_call arguments - needed to execute a "backend" tool below
            const toolCallMessages = await prisma.agentMessage.findMany({
                where: { interactionId: interaction.id, turnId: lastTurn?.id, role: "ASSISTANT" },
            });
            const toolCallArguments = toolCallMessages
                .flatMap((message) => (message.toolCalls as ProviderToolCall[] | null) ?? [])
                .reduce<Record<string, Record<string, unknown>>>((byId, call) => {
                    byId[call.id] = call.arguments;
                    return byId;
                }, {});

            // "backend" tools are executed by the API itself, not the CLI - everything
            // else (file/process/git/user) was already run locally, so its content is
            // trusted as-is. A failed or unavailable backend tool becomes a normal
            // isError result, never a thrown exception - the interaction must not crash.
            const resolvedToolResults = await Promise.all(input.toolResults.map(async (result) => {
                const tool = toolRegistry.get(result.name);
                if (tool.category !== "backend") {
                    return result;
                }

                try {
                    const tool = toolRegistry.get(result.name); // throws ToolNotRegisteredError if unknown
                    const args = toolCallArguments[result.toolCallId];
                    if (!args) {
                        throw new Error("No matching pending tool call found for this result.");
                    }
                    const output = await tool.execute(args);
                    return { ...result, content: output, isError: false };
                } catch (error) {
                    return {
                        ...result,
                        content: error instanceof Error ? error.message : "Backend tool execution failed.",
                        isError: true,
                    };
                }
            }));

            await prisma.$transaction(
                resolvedToolResults.map((result) =>
                    prisma.agentMessage.create({
                        data: {
                            sessionId,
                            interactionId: interaction.id,
                            sequence: nextMessageSequence++,
                            role: "TOOL",
                            toolCallId: result.toolCallId,
                            name: result.name,
                            content: result.content ?? "",
                            isError: result.isError,
                        },
                    }),
                ),
            );
        } else {
            // branch 2: fresh message - fine whether the previous interaction is
            // closed OR there was never one at all; only an open interaction blocks this
            if (latestInteraction?.status === "RUNNING") {
                throw new ConflictError("This session is waiting on tool results - send toolResults instead of message.");
            }

            const [provider, model] = await Promise.all([
                prisma.providerCatalog.findFirst({ where: { providerId: input.providerId }, select: { displayName: true } }),
                prisma.modelCatalog.findFirst({
                    where: { providerId: input.providerId, modelId: input.modelId },
                    select: { displayName: true, maxOutputTokens: true }
                }),
            ])

            if (!provider || !model) {
                throw new NotFoundError("The selected provider or model is not supported by the program")
            }

            if (input.maxOutputTokens && model.maxOutputTokens < input.maxOutputTokens) {
                throw new ConflictError("The model do not support the max output token as the user served");
            }

            interaction = await prisma.agentInteraction.create({
                data: {
                    sessionId,
                    sequence: (latestInteraction?.sequence ?? 0) + 1,
                    providerId: input.providerId ?? session.providerId,
                    modelId: input.modelId ?? session.modelId,
                    mode: input.mode,
                    thinkingLevel: input.thinkingLevel,
                    temperature: input.temperature,
                    maxOutputTokens: input.maxOutputTokens,
                    credentialId: credential.id,
                },
            });
            await prisma.agentMessage.create({
                data: {
                    sessionId,
                    interactionId: interaction.id,
                    sequence: nextMessageSequence++,
                    role: "USER",
                    content: input.message!,
                },
            });
            turnSequence = 1;
        }

        // hydrate the full conversation so far - the provider is stateless, so every
        // turn (including this one) resends the whole history, not just the new part
        const rows = await prisma.agentMessage.findMany({ where: { sessionId }, orderBy: { sequence: "asc" } });
        const messages: ProviderMessage[] = rows.map((row) => {
            if (row.role === "USER") return { role: "user", content: row.content ?? "" };
            if (row.role === "TOOL") return { role: "tool", toolCallId: row.toolCallId!, name: row.name!, content: row.content ?? "", isError: row.isError ?? undefined };
            if (row.role === "SYSTEM") return { role: "system", content: row.content ?? "" };
            return { role: "assistant", content: row.content ?? undefined, toolCalls: (row.toolCalls as ProviderToolCall[]) ?? undefined };
        });

        const apiKey = decryptCredential(credential, {
            userId,
            providerId: session.providerId,
            label: input.credentialLabel,
        });

        await runTurn({
            request,
            response,
            credential: { apiKey, id: credential.id },
            providerId: interaction.providerId,
            modelId: interaction.modelId,
            systemPrompt: `${SYSTEM_PROMPTS[interaction.mode]}\n\n${session.systemPrompt ?? ""}`.trim(),
            messages,
            sessionId: session.id,
            interactionId: interaction.id,
            turnSequence,
            nextMessageSequence,
            temperature: interaction.temperature ?? undefined,
            maxOutputTokens: interaction.maxOutputTokens ?? undefined,
            thinkingLevel: interaction.thinkingLevel
        });

        return response;
    }

}
