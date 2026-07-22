import { ToolDefinition } from "@workspace/protocol";
import { ToolRegistry } from "./registry.js";
import { processTools } from "./tools/process.js";
import { fileReadTools } from "./tools/file-read.js";
import { fileUpdateTools } from "./tools/file-update.js";
import { userTools } from "./tools/user.js";
import { backendTools } from "./tools/backend.js";

export * from "./registry.js"

export const builtInTools: ToolDefinition[] = [
    ...fileReadTools,
    ...fileUpdateTools,
    ...processTools,
    ...userTools,
    ...backendTools
]

export function createToolRegistry(): ToolRegistry {
    return new ToolRegistry(builtInTools);
}