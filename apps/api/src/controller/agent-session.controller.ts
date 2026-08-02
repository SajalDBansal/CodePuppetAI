import type { Request, Response } from "express";
import { prisma, type StopReason, type Prisma } from "@workspace/database";
import { StartSessionSchema, ContinueSessionSchema, SessionIdParamsSchema, type ProviderMessage, type ProviderStreamEvent, type ProviderToolCall, ThinkingLevel, emptyUsage, ModelUsage, ProviderUsage, SessionUsage, UsageStats, type AgentCallMode, type ProviderToolDefinition, type ToolCategory } from "@workspace/protocol";
import { requireUserId } from "../utils/request.js";
import { validate } from "../utils/validate.js";
import { NotFoundError, ConflictError } from "../utils/api-error.js";
import { decryptCredential } from "../service/credential-vault.js";
import { maybeCompactSession, loadSessionMessages } from "../service/compaction.js";
import { providerRegistry, toolRegistry } from "../utils/environment.js";
import { SYSTEM_PROMPTS } from "../utils/system-promt.js";

// writes one Server-Sent-Event frame to the client
function sendEvent(response: Response, event: ProviderStreamEvent): void {
    response.write(`data: ${JSON.stringify(event)}\n\n`);
}

type ProviderTurnCall = {
    request: Request
    response: Response
    userId: string
    credential: { apiKey: string, id: string }
    providerId: string
    modelId: string
    mode: AgentCallMode
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

const MODE_TOOL_CATEGORIES: Record<AgentCallMode, ToolCategory[]> = {
    ASK: [],
    PLAN: ["file-read", "backend"],
    CODE: ["file-read", "file-update", "process", "backend", "user"],
    AUTO: ["file-read", "file-update", "process", "backend", "user"],
}

function getToolsForMode(mode: AgentCallMode): ProviderToolDefinition[] {
    const allowedCategories = MODE_TOOL_CATEGORIES[mode];
    if (allowedCategories.length === 0) {
        return [];
    }
    return toolRegistry
        .list()
        .filter((tool) => allowedCategories.includes(tool.category))
        .map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
        }));
}

async function runTurn(params: ProviderTurnCall): Promise<void> {
    const { request, response, sessionId, interactionId, turnSequence } = params;

    const isProviderAvailable = providerRegistry.has(params.providerId);

    if (!isProviderAvailable) {
        throw new NotFoundError("The selected provider is not available");
    }

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
            tools: getToolsForMode(params.mode),
            temperature: params.temperature,
            maxOutputTokens: params.maxOutputTokens,
            thinkingLevel: params.thinkingLevel
        },
        { apiKey: params.credential.apiKey },
        abortController.signal,
    );

    try {
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
    } catch (error) {
        console.log(error);
        if (!errorInfo) {
            errorInfo = { code: "stream_failed", message: "The provider stream ended unexpectedly." };
        }
    }

    const interactionStatus = errorInfo ? "ERROR" :
        stopReason === "TOOL_USE" ? "RUNNING" :
            stopReason === "CANCELLED" ? "CANCELLED" :
                "COMPLETED";

    try {
        await prisma.$transaction(async (tx) => {
            const turn = await tx.agentTurn.create({
                data: {
                    sessionId,
                    interactionId,
                    sequence: turnSequence,
                    responseId,
                    stopReason,
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

            if (usageInfo) {
                const modelPricing = await tx.modelCatalog.findUnique({
                    where: {
                        providerId_modelId: {
                            providerId: params.providerId,
                            modelId: params.modelId
                        }
                    },
                    select: {
                        inputCostPer1M: true,
                        outputCostPer1M: true
                    },
                });

                const inputCost = modelPricing?.inputCostPer1M
                    ? (usageInfo.inputTokens / 1_000_000) * Number(modelPricing.inputCostPer1M)
                    : 0;
                const outputCost = modelPricing?.outputCostPer1M
                    ? (usageInfo.outputTokens / 1_000_000) * Number(modelPricing.outputCostPer1M)
                    : 0;

                await tx.agentUsage.create({
                    data: {
                        userId: params.userId,
                        sessionId,
                        interactionId,
                        turnId: turn.id,
                        providerId: params.providerId,
                        modelId: params.modelId,
                        inputTokens: usageInfo.inputTokens,
                        outputTokens: usageInfo.outputTokens,
                        cachedTokens: usageInfo.cachedTokens,
                        reasoningTokens: usageInfo.reasoningTokens ?? 0,
                        inputCost,
                        outputCost,
                        totalCost: inputCost + outputCost,
                    },
                });
            }
        });
    } catch (error) {
        console.log(error);
        if (!response.writableEnded) {
            sendEvent(response, {
                type: "error",
                message: "Error in storing the interaction details in the database",
                retryable: false,
                providerId: params.providerId,
                code: "database_persistence_failed"
            })
        }
    } finally {
        response.end();
    }
}

function toUsageStats(usage: {
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    reasoningTokens: number;
    inputCost: unknown;
    outputCost: unknown;
    totalCost: unknown;
}): UsageStats {
    const inputTokens = usage.inputTokens;
    const outputTokens = usage.outputTokens;

    return {
        inputTokens,
        outputTokens,
        cachedTokens: usage.cachedTokens,
        reasoningTokens: usage.reasoningTokens,

        totalTokens: inputTokens + outputTokens,

        inputCost: Number(usage.inputCost),
        outputCost: Number(usage.outputCost),
        totalCost: Number(usage.totalCost),
    };
}

function addUsage(target: UsageStats, source: UsageStats) {
    target.inputTokens += source.inputTokens;
    target.outputTokens += source.outputTokens;
    target.cachedTokens += source.cachedTokens;
    target.reasoningTokens += source.reasoningTokens;

    target.totalTokens = target.inputTokens + target.outputTokens;

    target.inputCost += source.inputCost;
    target.outputCost += source.outputCost;
    target.totalCost += source.totalCost;
}

export class AgentSessionController {
    getSessionMetadata = async (request: Request, response: Response): Promise<Response> => {
        const userId = requireUserId(request);
        const data = await prisma.agentSession.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
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

        return response.status(200).json(data)
    }

    getSessionByIdData = async (request: Request, response: Response): Promise<Response> => {
        const userId = requireUserId(request);
        const query = validate(SessionIdParamsSchema, request.params);
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

        const usageRows = await prisma.agentUsage.findMany({
            where: { sessionId: query.sessionId, userId },
            select: {
                providerId: true,
                modelId: true,
                inputTokens: true,
                outputTokens: true,
                cachedTokens: true,
                reasoningTokens: true,
                inputCost: true,
                outputCost: true,
                totalCost: true,
            },
        });

        const usageTotal = emptyUsage();
        const usageByModels: Record<string, ModelUsage> = {};
        const usageByProviders: Record<string, ProviderUsage> = {};

        for (const row of usageRows) {
            const rowUsage = toUsageStats(row);
            addUsage(usageTotal, rowUsage);

            const modelKey = `${row.providerId}:${row.modelId}`;
            const modelUsage = usageByModels[modelKey] ??= { providerId: row.providerId, modelId: row.modelId, ...emptyUsage() };
            addUsage(modelUsage, rowUsage);

            const providerUsage = usageByProviders[row.providerId] ??= { providerId: row.providerId, ...emptyUsage() };
            addUsage(providerUsage, rowUsage);
        }

        return response.status(200).json({
            ...data,
            usage: {
                total: usageTotal,
                byModels: usageByModels,
                byProviders: usageByProviders,
            },
        })
    }

    usage = async (request: Request, response: Response): Promise<Response> => {
        const userId = requireUserId(request);

        const usageRows = await prisma.agentUsage.findMany({
            where: { userId },
            select: {
                id: true,
                sessionId: true,
                interactionId: true,
                turnId: true,
                providerId: true,
                modelId: true,
                inputTokens: true,
                outputTokens: true,
                cachedTokens: true,
                reasoningTokens: true,
                inputCost: true,
                outputCost: true,
                totalCost: true,
                createdAt: true,

                session: {
                    select: {
                        id: true,
                        title: true,
                        status: true,
                        createdAt: true,
                        lastMessageAt: true,
                    },
                },
            },
            orderBy: { createdAt: "asc" }
        });

        const total = emptyUsage();
        const byModels: Record<string, ModelUsage> = {}
        const byProviders: Record<string, ProviderUsage> = {}
        const sessions = new Map<string, SessionUsage>();

        for (const row of usageRows) {
            const usage = toUsageStats(row);
            // Overall usage
            addUsage(total, usage);

            // Model usage
            const modelKey = `${row.providerId}:${row.modelId}`;

            const modelUsage =
                byModels[modelKey] ??= {
                    providerId: row.providerId,
                    modelId: row.modelId,
                    ...emptyUsage(),
                };

            addUsage(modelUsage, usage);

            // Provider usage
            const providerUsage =
                byProviders[row.providerId] ??= {
                    providerId: row.providerId,
                    ...emptyUsage(),
                };

            addUsage(providerUsage, usage);

            let session = sessions.get(row.sessionId);
            if (!session) {
                session = {
                    sessionId: row.session.id,
                    title: row.session.title,
                    status: row.session.status,
                    createdAt: row.session.createdAt,
                    lastMessageAt: row.session.lastMessageAt,
                    total: emptyUsage(),
                    byModels: {},
                    byProviders: {},
                }
                sessions.set(row.sessionId, session);
            }

            addUsage(session.total, usage);

            // Session → model usage
            const sessionModelUsage =
                session.byModels[modelKey] ??= {
                    providerId: row.providerId,
                    modelId: row.modelId,
                    ...emptyUsage(),
                };

            addUsage(sessionModelUsage, usage);

            // Session → provider usage
            const sessionProviderUsage =
                session.byProviders[row.providerId] ??= {
                    providerId: row.providerId,
                    ...emptyUsage(),
                };

            addUsage(sessionProviderUsage, usage);

        }

        return response.status(200).json({
            userId,
            total,
            byModels,
            byProviders,
            sessions: Array.from(sessions.values()),
        });
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

        response.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Session-Id": session.id,
        });

        await runTurn({
            request,
            response,
            userId,
            credential: { apiKey, id: credential.id },
            providerId: input.providerId,
            modelId: input.modelId,
            mode: input.mode,
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

        const [session, latestInteraction, lastMessage] = await Promise.all([
            prisma.agentSession.findFirst({ where: { id: sessionId, userId } }),
            prisma.agentInteraction.findFirst({ where: { sessionId }, orderBy: { sequence: "desc" } }),
            prisma.agentMessage.findFirst({ where: { sessionId }, orderBy: { sequence: "desc" } }),
        ]);
        if (!session) {
            throw new NotFoundError("Session not found.");
        }
        if (session.status !== "ACTIVE") {
            throw new ConflictError("This session is archived and cannot be continued.");
        }

        const credential = await prisma.providerCredential.findFirst({
            where: { userId, providerId: session.providerId, label: input.credentialLabel },
        });
        if (!credential) {
            throw new NotFoundError("No credential found for this provider and label.");
        }

        let nextMessageSequence = (lastMessage?.sequence ?? 0) + 1;

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

            const toolCallMessages = await prisma.agentMessage.findMany({
                where: { interactionId: interaction.id, turnId: lastTurn?.id, role: "ASSISTANT" },
            });

            const toolCallArguments = toolCallMessages
                .flatMap((message) => (message.toolCalls as ProviderToolCall[] | null) ?? [])
                .reduce<Record<string, Record<string, unknown>>>((byId, call) => {
                    byId[call.id] = call.arguments;
                    return byId;
                }, {});

            const resolvedToolResults = await Promise.all(input.toolResults.map(async (result) => {
                try {
                    const tool = toolRegistry.get(result.name);
                    if (tool.category !== "backend") {
                        return result;
                    }

                    const args = toolCallArguments[result.toolCallId];
                    if (!args) {
                        throw new Error("No matching pending tool call found for this result.");
                    }
                    const output = await tool.execute(args, {
                        session: {
                            id: sessionId,
                            userId,
                            getMessages: async ({ fromSequence, toSequence }) => {
                                const messages = await prisma.agentMessage.findMany({
                                    where: { sessionId, sequence: { gte: fromSequence, lte: toSequence } },
                                    orderBy: { sequence: "asc" },
                                    select: { sequence: true, role: true, content: true },
                                    take: 500,
                                });
                                return messages;
                            },
                        },
                    });
                    return { ...result, content: output.content, isError: output.isError ?? false };
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

            const newInteraction = await prisma.$transaction(async (tx) => {
                const newInteraction = await tx.agentInteraction.create({
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

                await tx.agentMessage.create({
                    data: {
                        sessionId,
                        interactionId: newInteraction.id,
                        sequence: nextMessageSequence++,
                        role: "USER",
                        content: input.message!,
                    },
                });

                return newInteraction;
            })

            interaction = newInteraction;

            turnSequence = 1;
        }

        const apiKey = decryptCredential(credential, {
            userId,
            providerId: session.providerId,
            label: input.credentialLabel,
        });

        response.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Session-Id": sessionId,
        });

        if (!input.toolResults) {
            await maybeCompactSession({
                sessionId,
                providerId: session.providerId,
                modelId: session.modelId,
                apiKey,
                lastInteractionInputTokens: latestInteraction?.inputTokens ?? 0,
                onEvent: (event) => sendEvent(response, event),
            });
        }

        const messages = await loadSessionMessages(sessionId);

        await runTurn({
            request,
            response,
            userId,
            credential: { apiKey, id: credential.id },
            providerId: interaction.providerId,
            modelId: interaction.modelId,
            mode: interaction.mode,
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
