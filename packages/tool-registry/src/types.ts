import z from "zod"

export type JsonObject = Record<string, unknown>

export type ToolInputJson = {
    type: "object",
    properties?: Record<string, unknown>,
    required?: string[],
    additionalProperties: boolean
}

// the actual tool call submitted by the provider to be called (with the filled arguments)
export type ProviderToolCall = {
    id: string
    name: string
    arguments: JsonObject
    providerMetadata?: Record<string, unknown>
}

// the tool definition to be send to the provider to know the tool structure
export type ProviderToolDefinition = {
    name: string
    description: string
    inputSchema: ToolInputJson
}

export const ToolCategorySchema = z.enum(["file", "process", "git", "backend", "user"])
export type ToolCategory = z.infer<typeof ToolCategorySchema>;

export type ToolDefinition = {
    name: string;
    category: ToolCategory
}