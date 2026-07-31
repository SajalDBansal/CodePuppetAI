import type { AgentCallMode, ProviderStreamEvent, ThinkingLevel } from "@workspace/harness";
import { harness, logger } from "../utils/context.js";
import { CliUsageError } from "../utils/error.js";
import { shortId } from "../utils/format.js";
import { streamTurn } from "./streamer.js";
import { executeToolCalls } from "./tool-runner.js";

interface AgentLoopSharedOptions {
    userId: string
    credentialLabel: string
    mode: AgentCallMode
    thinkingLevel: ThinkingLevel
    temperature?: number
    maxOutputTokens?: number
    json?: boolean
}

export interface AgentLoopStartOptions extends AgentLoopSharedOptions {
    providerId: string
    modelId: string
    message: string
    title?: string
    systemPrompt?: string
}

export interface AgentLoopContinueOptions extends AgentLoopSharedOptions {
    sessionId: string
    message: string
}

export async function runAgentLoopFromStart(options: AgentLoopStartOptions): Promise<void> {
    const controller = new AbortController();
    await withAbortHandling(controller, async () => {
        const started = await harness.api.startSession(
            {
                providerId: options.providerId,
                modelId: options.modelId,
                credentialLabel: options.credentialLabel,
                message: options.message,
                mode: options.mode,
                thinkingLevel: options.thinkingLevel,
                title: options.title,
                systemPrompt: options.systemPrompt,
                temperature: options.temperature,
                maxOutputTokens: options.maxOutputTokens,
            },
            controller.signal,
        );

        if (!started.sessionId) {
            throw new CliUsageError("The backend did not report a session id for this stream.");
        }

        logger.info(`Session ${shortId(started.sessionId)} started.`);
        await drive(started.sessionId, started.events, options, controller);
    });
}

export async function runAgentLoopContinue(options: AgentLoopContinueOptions): Promise<void> {
    const controller = new AbortController();
    await withAbortHandling(controller, async () => {
        const next = await harness.api.continueSession(
            options.sessionId,
            {
                credentialLabel: options.credentialLabel,
                message: options.message,
                mode: options.mode,
                thinkingLevel: options.thinkingLevel,
                temperature: options.temperature,
                maxOutputTokens: options.maxOutputTokens,
            },
            controller.signal,
        );

        await drive(options.sessionId, next.events, options, controller);
    });
}

async function drive(
    sessionId: string,
    events: AsyncGenerator<ProviderStreamEvent>,
    options: AgentLoopSharedOptions,
    controller: AbortController,
): Promise<void> {
    let currentEvents = events;

    while (true) {
        const turn = await streamTurn(currentEvents, { json: options.json });

        if (turn.error) {
            logger.error(`Turn failed: ${turn.error.message} (${turn.error.code})`);
            return;
        }

        if (turn.stopReason !== "TOOL_USE") {
            logger.success(turn.stopReason ? `Turn finished (${turn.stopReason.toLowerCase()}).` : "Turn finished.");
            return;
        }

        const toolResults = await executeToolCalls(turn.toolCalls, { sessionId, userId: options.userId });

        if (controller.signal.aborted) return;

        const next = await harness.api.continueSession(
            sessionId,
            {
                credentialLabel: options.credentialLabel,
                toolResults,
                mode: options.mode,
                thinkingLevel: options.thinkingLevel,
                temperature: options.temperature,
                maxOutputTokens: options.maxOutputTokens,
            },
            controller.signal,
        );

        currentEvents = next.events;
    }
}

async function withAbortHandling(controller: AbortController, run: () => Promise<void>): Promise<void> {
    const onSigint = () => {
        logger.warn("Cancelling…");
        controller.abort();
    };
    process.on("SIGINT", onSigint);

    try {
        await run();
    } catch (error) {
        if (isAbortError(error)) {
            logger.warn("Session cancelled.");
            return;
        }
        throw error;
    } finally {
        process.off("SIGINT", onSigint);
    }
}

function isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === "AbortError";
}
