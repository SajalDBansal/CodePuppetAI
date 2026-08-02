import { ToolDefinition } from "@workspace/protocol";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import z from "zod";

const execAsync = promisify(exec);

const bashSchema = z.object({
    command: z.string().trim().min(1),
    timeout: z.number().min(1).optional()
});

export const processTools: ToolDefinition[] = [
    {
        name: "bash",
        category: "process",
        description: "Runs a shell command and returns its combined stdout/stderr output.",
        inputSchema: {
            type: "object",
            properties: {
                command: { type: "string", description: "The shell command to run." },
                timeout: { type: "number", description: "Add the command timeout timer optionally, default is 10_000" }
            },
            required: ["command"],
            additionalProperties: false,
        },
        zodSchema: bashSchema,
        requiresConfirmation: true,
        execute: async (args, context) => {
            const parsed = bashSchema.safeParse(args);
            if (!parsed.success) {
                return { content: "", isError: true, message: "The \"command\" argument must be a non-empty string." };
            }

            try {
                const { stdout, stderr } = await execAsync(parsed.data.command, {
                    timeout: parsed.data.timeout ?? 10_000,
                    cwd: context.workspaceRoot,
                });
                const content = [stdout, stderr].filter(Boolean).join("\n").trim() || "(no output)";
                return { content, isError: false, message: "Command completed." };
            } catch (error) {
                const message = error instanceof Error ? error.message : "The command failed unexpectedly.";
                return { content: message, isError: true, message };
            }
        }
    }
]
