import { ToolDefinition } from "@workspace/protocol";
import { ToolRegistry } from "./registry.js";
import { processTools } from "./tools/process.js";

export * from "./registry.js"

export const builtInTools: ToolDefinition[] = [
    ...processTools,
]

export function createToolRegistry(): ToolRegistry {
    return new ToolRegistry(builtInTools);
}