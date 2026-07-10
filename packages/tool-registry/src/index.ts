import { ToolDefinition } from "@workspace/protocol";
import { ToolRegistry } from "./registry.js";

export * from "./registry.js"

export const builtInTools: ToolDefinition[] = []

export function createToolRegistry(): ToolRegistry {
    return new ToolRegistry(builtInTools);
}