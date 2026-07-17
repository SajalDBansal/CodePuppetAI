import { ToolDefinition } from "@workspace/protocol";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export const processTools: ToolDefinition[] = [
    {
        name: "bash",
        category: "process",
        description: "Runs a shell command and returns its combined stdout/stderr output.",
        inputSchema: {
            type: "object",
            properties: {
                command: { type: "string", description: "The shell command to run." }
            },
            required: ["command"],
            additionalProperties: false,
        },
        execute: async (args) => {
            const command = args.command;
            if (typeof command !== "string" || !command.trim()) {
                throw new Error("The \"command\" argument must be a non-empty string.");
            }

            const { stdout, stderr } = await execAsync(command, { timeout: 10_000 });
            return [stdout, stderr].filter(Boolean).join("\n").trim() || "(no output)";
        }
    }
]
