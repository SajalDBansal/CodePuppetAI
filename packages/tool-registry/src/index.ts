import { ToolRegistry } from "./registry.js";
import { ToolDefinition } from "./types.js";

export * from "./types.js"
export * from "./registry.js"

export const builtInTools: ToolDefinition[] = []

export function createToolRegistry(): ToolRegistry {
    return new ToolRegistry(builtInTools);
}