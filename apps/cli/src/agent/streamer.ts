import type { ProviderStopReason, ProviderStreamEvent } from "@workspace/harness";
import { logger } from "../utils/context.js";

export interface StreamedToolCall {
    id: string
    name: string
    arguments: Record<string, unknown>
}

export interface StreamedTurn {
    text: string
    toolCalls: StreamedToolCall[]
    usage?: { inputTokens: number; outputTokens: number; cachedTokens: number; reasoningTokens?: number }
    error?: { code: string; message: string; retryable: boolean }
    stopReason?: ProviderStopReason
}

export interface StreamOptions {
    json?: boolean
}

// Consumes one turn's worth of the backend's SSE events, printing them to the
// terminal as they arrive, and returns the same summary the backend's own
// runTurn collects (apps/api/src/controller/agent-session.controller.ts) - text,
// tool calls, usage, error, stopReason - so the agent loop can make the same
// TOOL_USE/terminal decision the backend already made, without re-deriving it.
export async function streamTurn(events: AsyncGenerator<ProviderStreamEvent>, options: StreamOptions = {}): Promise<StreamedTurn> {
    const turn: StreamedTurn = { text: "", toolCalls: [] };
    let atLineStart = true;

    const breakLine = () => {
        if (!atLineStart) {
            logger.stream("\n");
            atLineStart = true;
        }
    };

    for await (const event of events) {
        if (options.json) {
            logger.plain(JSON.stringify(event));
            continue;
        }

        switch (event.type) {
            case "stream_started":
                // fires immediately, before any model output exists yet - without
                // this the terminal shows nothing at all during the model's
                // reasoning phase, which is the part most likely to look "hung"
                logger.step("Thinking…");
                break;

            case "text_delta":
                if (atLineStart) {
                    logger.stream("Assistant: ");
                    atLineStart = false;
                }
                logger.stream(event.text);
                turn.text += event.text;
                break;

            case "tool_call_start":
                breakLine();
                logger.step(`Calling ${event.name}…`);
                break;

            case "tool_call_delta":
                // arguments stream in as raw JSON fragments - nothing readable to
                // show until the full "tool_call" event below carries the parsed result
                break;

            case "tool_call":
                turn.toolCalls.push({ id: event.id, name: event.name, arguments: event.arguments });
                break;

            case "usage":
                turn.usage = event;
                break;

            case "error":
                breakLine();
                turn.error = { code: event.code, message: event.message, retryable: event.retryable };
                logger.error(`${event.message} (${event.code})`);
                break;

            case "done":
                turn.stopReason = event.stopReason;
                break;
        }
    }

    breakLine();
    return turn;
}
