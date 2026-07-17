import z from "zod"

export type ToolInputJson = {
    type: "object",
    properties?: Record<string, unknown>,
    required?: string[],
    additionalProperties: boolean
}

// the tool definition to be send to the provider to know the tool structure
export type ProviderToolDefinition = {
    name: string
    description: string
    inputSchema: ToolInputJson
}

type JsonObject = Record<string, unknown>

// the actual tool call submitted by the provider to be called (with the filled arguments)
export type ProviderToolCall = {
    id: string
    name: string
    arguments: JsonObject
    providerMetadata?: Record<string, unknown>
}

export const ToolCategorySchema = z.enum(["file", "process", "git", "backend", "user"])
export type ToolCategory = z.infer<typeof ToolCategorySchema>;

export type ToolDefinition = {
    name: string;
    category: ToolCategory
    description: string
    inputSchema: ToolInputJson
    execute: (args: JsonObject) => Promise<string>
}

export const ThinkingLevelSchema = z.enum(["INSTANT", "MID", "HIGH"]);
export type ThinkingLevel = z.infer<typeof ThinkingLevelSchema>;