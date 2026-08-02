import { ProviderToolCall, ProviderToolDefinition, ThinkingLevel } from "@workspace/protocol";

export type ProviderErrorCode =
    | "authentication_failed"
    | "permission_denied"
    | "rate_limited"
    | "invalid_request"
    | "model_not_found"
    | "context_length_exceeded"
    | "provider_unavailable"
    | "request_cancelled"
    | "database_persistence_failed"
    | "unknown"

export type SystemMessage = {
    role: "system"
    content: string
}

export type UserMessage = {
    role: "user"
    content: string
}

export type AssistantMessage = {
    role: "assistant"
    content?: string
    toolCalls?: ProviderToolCall[]
}

export type ToolMessage = {
    role: "tool"
    toolCallId: string
    name: string
    content: string
    isError?: boolean
}

export type ProviderMessage = SystemMessage | UserMessage | AssistantMessage | ToolMessage

export type ProviderCredentials = { apiKey: string }

export type ProviderStopReason =
    | "END_TURN"
    | "TOOL_USE"
    | "MAX_TOKENS"
    | "STOP_SEQUENCE"
    | "CANCELLED"
    | "ERROR"
    | "UNKNOWN"

export type JsonObject = Record<string, unknown>

export type ProviderStreamEvent =
    | {
        type: "stream_started"
        providerId: string
        responseId?: string
    }
    | {
        type: "text_delta"
        text: string
    }
    | {
        type: "tool_call_start"
        id: string
        name: string
    }
    | {
        type: "tool_call_delta"
        id: string
        argumentsDelta: string
    }
    | {
        type: "tool_call"
        id: string
        name: string
        arguments: JsonObject
        providerMetadata: Record<string, unknown>
    }
    | {
        type: "usage"
        inputTokens: number
        outputTokens: number
        cachedTokens: number
        reasoningTokens?: number
    }
    | {
        type: "error"
        providerId: string
        code: ProviderErrorCode
        message: string
        retryable: boolean
    }
    | {
        type: "done"
        stopReason: ProviderStopReason
        responseId?: string
    }
    | {
        // the model's reasoning/thinking text, when requested via thinkingLevel -
        // separate from text_delta so a client can render it distinctly from the
        // actual reply instead of the two being mixed into one stream
        type: "reasoning_delta"
        text: string
    }
    | {
        type: "compaction_started"
    }
    | {
        type: "compaction_delta"
        text: string
    }
    | {
        type: "compaction_completed"
        coversFromSequence: number
        coversToSequence: number
    }

export type ProviderStreamRequest = {
    modelId: string
    messages: ProviderMessage[]
    systemPrompt?: string
    tools?: ProviderToolDefinition[]
    temperature?: number
    maxOutputTokens?: number
    thinkingLevel?: ThinkingLevel
}

export interface ProviderAdapter {
    readonly id: string

    stream(
        request: ProviderStreamRequest,
        credentials: ProviderCredentials,
        signal?: AbortSignal
    ): AsyncGenerator<ProviderStreamEvent, void, unknown>
}