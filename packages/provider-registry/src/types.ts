import { ProviderToolCall, ProviderToolDefinition } from "@workspace/tool-registry";

export type ProviderErrorCode =
    | "authentication_failed"
    | "permission_denied"
    | "rate_limited"
    | "invalid_request"
    | "model_not_found"
    | "context_length_exceeded"
    | "provider_unavailable"
    | "request_cancelled"
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
    | "end_turn"
    | "tool_use"
    | "max_tokens"
    | "stop_sequence"
    | "cancelled"
    | "error"
    | "unknown"

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

export type ProviderStreamRequest = {
    modelId: string
    messages: ProviderMessage[]
    systemPrompt?: string
    tools?: ProviderToolDefinition[]
    temperature?: number
    maxOutputTokens?: number
}

export interface ProviderAdapter {
    readonly id: string

    stream(
        request: ProviderStreamRequest,
        credentials: ProviderCredentials,
        signal?: AbortSignal
    ): AsyncGenerator<ProviderStreamEvent, void, unknown>
}