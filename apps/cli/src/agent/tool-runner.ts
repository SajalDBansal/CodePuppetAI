import inquirer from "inquirer";
import { createToolRegistry } from "@workspace/tool-registry";
import type { ToolCategory, ToolExecutionContext, UserPrompt, UserPromptResult } from "@workspace/protocol";
import type { ContinueSessionToolResultInput } from "@workspace/harness";
import { logger } from "../utils/context.js";
import { resolveActiveWorkspaceRoot } from "../utils/workspace.js";
import type { StreamedToolCall } from "./streamer.js";

// The same built-in tool set the API server registers. "backend" tools are
// re-executed server-side regardless of what's sent here (see continueSession's
// tool-result branch in agent-session.controller.ts, which always re-derives the
// category from its own registry) - registering them here too is harmless and
// keeps `toolRegistry.get()` consistent for every tool name the model can call.
const toolRegistry = createToolRegistry();

const UNKNOWN_TOOL_CATEGORY: ToolCategory = "process";

export interface ToolRunnerContext {
    sessionId: string
    userId: string
}

export async function executeToolCalls(toolCalls: StreamedToolCall[], context: ToolRunnerContext): Promise<ContinueSessionToolResultInput[]> {
    const results: ContinueSessionToolResultInput[] = [];
    for (const call of toolCalls) {
        results.push(await executeToolCall(call, context));
    }
    return results;
}

async function executeToolCall(call: StreamedToolCall, context: ToolRunnerContext): Promise<ContinueSessionToolResultInput> {
    if (!toolRegistry.has(call.name)) {
        return {
            toolCallId: call.id,
            name: call.name,
            category: UNKNOWN_TOOL_CATEGORY,
            content: `No local tool is registered as "${call.name}".`,
            isError: true,
        };
    }

    const tool = toolRegistry.get(call.name);

    if (tool.category === "backend") {
        // nothing to run locally - the server executes this itself once the
        // toolResults reach continueSession
        return { toolCallId: call.id, name: call.name, category: "backend" };
    }

    logger.step(`${tool.name}(${JSON.stringify(call.arguments)})`);

    if (tool.requiresConfirmation) {
        const { approved } = await inquirer.prompt<{ approved: boolean }>([
            {
                type: "confirm",
                name: "approved",
                message: `Allow '${tool.name}' to run with ${JSON.stringify(call.arguments)}?`,
                default: false,
            },
        ]);

        if (!approved) {
            logger.warn(`Declined '${tool.name}'.`);
            return {
                toolCallId: call.id,
                name: call.name,
                category: tool.category,
                content: "The user declined to run this tool.",
                isError: true,
            };
        }
    }

    const executionContext: ToolExecutionContext = {
        workspaceRoot: await resolveActiveWorkspaceRoot(),
        session: { id: context.sessionId, userId: context.userId },
        promptUser,
    };

    try {
        const output = await tool.execute(call.arguments, executionContext);
        // print the outcome as soon as it's known, success or failure - a
        // multi-tool-call turn otherwise goes silent again the moment
        // execution starts (the "Calling X…" line only marks the start)
        if (output.isError) {
            logger.warn(output.message);
        } else {
            logger.success(output.message);
        }
        return {
            toolCallId: call.id,
            name: call.name,
            category: tool.category,
            content: output.content || output.message || "(no output)",
            isError: output.isError ?? false,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Tool execution failed unexpectedly.";
        logger.error(message);
        return { toolCallId: call.id, name: call.name, category: tool.category, content: message, isError: true };
    }
}


async function promptUser(prompt: UserPrompt): Promise<UserPromptResult> {
    if (prompt.kind === "confirmation") {
        const { approved } = await inquirer.prompt<{ approved: boolean }>([
            {
                type: "confirm",
                name: "approved",
                message: prompt.detail ? `${prompt.prompt} (${prompt.detail})` : prompt.prompt,
                default: false,
            },
        ]);
        return { kind: "confirmation", approved };
    }

    if (prompt.options && prompt.options.length > 0) {
        const { answer } = await inquirer.prompt<{ answer: string }>([
            { type: "select", name: "answer", message: prompt.question, choices: prompt.options },
        ]);
        return { kind: "question", answer };
    }

    const { answer } = await inquirer.prompt<{ answer: string }>([
        { type: "input", name: "answer", message: prompt.question },
    ]);
    return { kind: "question", answer };
}
