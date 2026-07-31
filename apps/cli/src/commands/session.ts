import { Command, Option } from "commander";
import inquirer from "inquirer";
import { harness, logger } from "../utils/context.js";
import { CliUsageError } from "../utils/error.js";
import { formatDate, shortId } from "../utils/format.js";
import { resolveCredential } from "../utils/credential.js";
import type { AgentCallMode, SessionDetail, SessionMessage, SessionSummary, ThinkingLevel } from "@workspace/harness";
import { runAgentLoopContinue } from "../agent/agent-loop.js";

interface ShowOptions {
    json?: boolean
}

interface ContinueOptions {
    credential?: string
    mode: "ask" | "plan" | "code" | "auto"
    thinking: "instant" | "mid" | "high"
    temperature?: string
    maxTokens?: string
    json?: boolean
}

export function sessionCommand(program: Command) {
    const session = program
        .command("session")
        .description("Manage agent sessions")

    session
        .command("list")
        .description("List your agent sessions")
        .action(async () => {
            const sessions = await harness.api.listSessions();
            if (sessions.length === 0) {
                logger.info("No sessions yet. Run 'code-puppet ask <message>' to start one.");
                return;
            }
            logger.heading("Sessions");
            logger.table(
                ["Id", "Provider", "Model", "Title", "Status", "Last message"],
                sessions.map((entry) => [
                    shortId(entry.id),
                    entry.providerId,
                    entry.modelId,
                    entry.title ?? "—",
                    logger.status(entry.status.toLowerCase()),
                    formatDate(entry.lastMessageAt),
                ])
            );
        });

    session
        .command("show")
        .description("Show a session's full interaction history")
        .option("--json", "print the raw session JSON instead of a summary")
        .action(async (options: ShowOptions) => {
            const sessions = await harness.api.listSessions();
            if (sessions.length === 0) {
                logger.info("No sessions yet. Run 'code-puppet ask <message>' to start one.");
                return;
            }

            const sessionId = await pickSession(sessions);
            const detail = await harness.api.getSession(sessionId);

            if (options.json) {
                logger.plain(JSON.stringify(detail, null, 2));
                return;
            }

            logger.heading(`Session ${shortId(detail.id)}`);
            logger.keyValue("Title", detail.title ?? "—");
            logger.keyValue("Provider", `${detail.providerId} / ${detail.modelId}`);
            logger.keyValue("Status", detail.status);
            logger.keyValue("Interactions", String(detail.interactions.length));
            logger.keyValue("Tokens (in/out)", `${detail.usage.total.inputTokens} / ${detail.usage.total.outputTokens}`);
            logger.keyValue("Cost", `$${detail.usage.total.totalCost.toFixed(4)}`);
            logger.plain();

            await stepThroughTranscript(detail);
        });

    session
        .command("continue")
        .description("Continue an existing session with a new message")
        .argument("<sessionId>", "the session id")
        .argument("<message>", "the message to send")
        .option("-c, --credential <label>", "credential label to use (defaults to the provider's selected credential)")
        .addOption(new Option("--mode <mode>", "agent mode").choices(["ask", "plan", "code", "auto"]).default("auto"))
        .addOption(new Option("--thinking <level>", "thinking level").choices(["instant", "mid", "high"]).default("mid"))
        .option("--temperature <value>", "sampling temperature (0-2)")
        .option("--max-tokens <value>", "max output tokens for the response")
        .option("--json", "print raw stream events instead of formatted output")
        .action(async (sessionId: string, message: string, options: ContinueOptions) => {
            const existing = await harness.api.getSession(sessionId);
            if (existing.status !== "ACTIVE") {
                throw new CliUsageError(`Session ${shortId(sessionId)} is ${existing.status.toLowerCase()} and cannot be continued.`);
            }

            const credential = await resolveCredential(existing.providerId, options.credential);
            const auth = await harness.auth.get();
            if (!auth) {
                throw new CliUsageError("Run 'code-puppet login' first.");
            }

            await runAgentLoopContinue({
                userId: auth.user.id,
                sessionId,
                credentialLabel: credential.label,
                message,
                mode: options.mode.toUpperCase() as AgentCallMode,
                thinkingLevel: options.thinking.toUpperCase() as ThinkingLevel,
                temperature: options.temperature ? Number(options.temperature) : undefined,
                maxOutputTokens: options.maxTokens ? Number(options.maxTokens) : undefined,
                json: options.json,
            });
        });
}

async function pickSession(sessions: SessionSummary[]): Promise<string> {
    const { sessionId } = await inquirer.prompt<{ sessionId: string }>([
        {
            type: "select",
            name: "sessionId",
            message: "Session",
            choices: sessions.map((entry) => ({
                name: `${entry.title ?? shortId(entry.id)} — ${entry.providerId}/${entry.modelId} (${entry.status.toLowerCase()}, last message ${formatDate(entry.lastMessageAt)})`,
                value: entry.id,
            })),
        },
    ]);
    return sessionId;
}

async function stepThroughTranscript(detail: SessionDetail): Promise<void> {
    const lines = buildTranscriptLines(detail);

    if (lines.length === 0) {
        logger.info("This session has no messages yet.");
        return;
    }

    logger.info(`${lines.length} lines · press Enter to step through, or type 'q' to stop.`);

    for (const [index, line] of lines.entries()) {
        logger.plain(line);

        const isLastLine = index === lines.length - 1;
        if (isLastLine) break;

        const { action } = await inquirer.prompt<{ action: string }>([
            { type: "input", name: "action", message: "↵ next (q to quit)" },
        ]);

        if (action.trim().toLowerCase().startsWith("q")) {
            break;
        }
    }
}

function buildTranscriptLines(detail: SessionDetail): string[] {
    const lines: string[] = [];

    for (const interaction of detail.interactions) {
        lines.push(`── Interaction ${interaction.sequence} · ${interaction.providerId}/${interaction.modelId} · ${interaction.status.toLowerCase()} ──`);
        for (const message of interaction.messages) {
            lines.push(...formatMessageLines(message));
        }
    }

    return lines;
}

function formatMessageLines(message: SessionMessage): string[] {
    const time = formatDate(message.createdAt);
    const speaker = speakerLabel(message);
    const lines: string[] = [];

    if (message.content) {
        lines.push(`[${time}] ${speaker}: ${message.content}`);
    }

    if (message.role === "ASSISTANT" && message.toolCalls) {
        const toolCalls = message.toolCalls as { id: string; name: string; arguments: Record<string, unknown> }[];
        for (const call of toolCalls) {
            lines.push(`[${time}] ${speaker} → calling '${call.name}' with ${JSON.stringify(call.arguments)}`);
        }
    }

    if (lines.length === 0) {
        lines.push(`[${time}] ${speaker}: (empty)`);
    }

    return lines;
}

function speakerLabel(message: SessionMessage): string {
    switch (message.role) {
        case "USER":
            return "You";
        case "ASSISTANT":
            return "Assistant";
        case "TOOL":
            return `Tool (${message.name ?? "unknown"})${message.isError ? " [error]" : ""}`;
        case "SYSTEM":
            return "System";
        default:
            return message.role;
    }
}
