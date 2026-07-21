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

// git operations run through the "process" category's bash tool - a dedicated "git"
// category was considered and dropped, since every git operation (status/diff/log/
// worktree/commit/etc.) is just a shell command bash already runs.
export const ToolCategorySchema = z.enum(["file-read", "file-update", "process", "backend", "user"])
export type ToolCategory = z.infer<typeof ToolCategorySchema>;

export type UserPrompt =
    | { kind: "confirmation"; prompt: string; detail?: string }
    | { kind: "question"; question: string; options?: string[] }

export type UserPromptResult =
    | { kind: "confirmation"; approved: boolean; reason?: string }
    | { kind: "question"; answer: string }

export type SessionMessageRecord = {
    sequence: number
    role: string
    content: string | null
}

export type ToolExecutionContext = {
    workspaceRoot?: string
    session?: {
        id: string
        userId: string
        // backend only: reads raw AgentMessage rows for this session directly from the
        // database, bypassing whatever a compaction summary trimmed out. Supplied by the
        // API (which owns the Prisma client) - packages/tool-registry never imports
        // @workspace/database itself, so this stays a plain callback, same pattern as
        // promptUser below.
        getMessages?: (range: { fromSequence: number, toSequence: number }) => Promise<SessionMessageRecord[]>
    }
    promptUser?: (prompt: UserPrompt) => Promise<UserPromptResult>
}

export type ToolResult = {
    content: string
    isError?: boolean
    message: string
}

export type ToolDefinition = {
    name: string;
    category: ToolCategory
    description: string
    inputSchema: ToolInputJson
    zodSchema: z.ZodTypeAny
    requiresConfirmation?: boolean
    execute: (args: JsonObject, context: ToolExecutionContext) => Promise<ToolResult>
}

export const ThinkingLevelSchema = z.enum(["INSTANT", "MID", "HIGH"]);
export type ThinkingLevel = z.infer<typeof ThinkingLevelSchema>;
