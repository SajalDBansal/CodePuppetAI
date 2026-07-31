import { Command, Option } from "commander";
import { harness } from "../utils/context.js";
import { CliUsageError } from "../utils/error.js";
import { resolveCredential } from "../utils/credential.js";
import { runAgentLoopFromStart } from "../agent/agent-loop.js";
import type { AgentCallMode, ThinkingLevel } from "@workspace/harness";

interface AskOptions {
    provider?: string
    model?: string
    credential?: string
    mode: "ask" | "plan" | "code" | "auto"
    thinking: "instant" | "mid" | "high"
    system?: string
    title?: string
    temperature?: string
    maxTokens?: string
    json?: boolean
}

export function askCommand(program: Command) {
    program
        .command("ask")
        .description("Start a new agent session with a one-shot message")
        .argument("<message>", "the message to send to the agent")
        .option("-p, --provider <providerId>", "provider to use (defaults to the configured provider)")
        .option("-m, --model <modelId>", "model to use (defaults to the configured model)")
        .option("-c, --credential <label>", "credential label to use (defaults to the provider's selected credential)")
        .addOption(new Option("--mode <mode>", "agent mode").choices(["ask", "plan", "code", "auto"]).default("auto"))
        .addOption(new Option("--thinking <level>", "thinking level").choices(["instant", "mid", "high"]).default("mid"))
        .option("-s, --system <prompt>", "extra system prompt appended for this session")
        .option("-t, --title <title>", "title for the session")
        .option("--temperature <value>", "sampling temperature (0-2)")
        .option("--max-tokens <value>", "max output tokens for the response")
        .option("--json", "print raw stream events instead of formatted output")
        .action(async (message: string, options: AskOptions) => {
            const config = await harness.config.get();
            if (!config) {
                throw new CliUsageError("Run 'code-puppet init' first.");
            }
            const auth = await harness.auth.get();
            if (!auth) {
                throw new CliUsageError("Run 'code-puppet login' first.");
            }

            const providerId = options.provider ?? config.providerId;
            const modelId = options.model ?? config.modelId;
            const credential = await resolveCredential(providerId, options.credential);

            await runAgentLoopFromStart({
                userId: auth.user.id,
                providerId,
                modelId,
                credentialLabel: credential.label,
                message,
                mode: options.mode.toUpperCase() as AgentCallMode,
                thinkingLevel: options.thinking.toUpperCase() as ThinkingLevel,
                title: options.title,
                systemPrompt: options.system,
                temperature: options.temperature ? Number(options.temperature) : undefined,
                maxOutputTokens: options.maxTokens ? Number(options.maxTokens) : undefined,
                json: options.json,
            });
        });
}
