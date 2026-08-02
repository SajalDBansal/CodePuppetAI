import z from "zod"
import {
    AgentCallModeSchema,
    ThinkingLevelSchema,
    type AgentCallMode,
    type ThinkingLevel,
    type ProviderStopReason,
    type ProviderErrorCode,
    type ProviderStreamEvent,
} from "@workspace/protocol"

export { AgentCallModeSchema, ThinkingLevelSchema }
export type { AgentCallMode, ThinkingLevel, ProviderStopReason, ProviderErrorCode, ProviderStreamEvent }

export const HarnessUserSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    email: z.email(),
    role: z.string().default("user"),
})

export const AuthSessionSchema = z.object({
    schemaVersion: z.literal(1).default(1),
    apiUrl: z.url(),
    accessToken: z.string().min(1),
    tokenType: z.string().min(1).default("Bearer"),
    expiresAt: z.iso.datetime(),
    user: HarnessUserSchema,
})

export const CredentialMetadataSchema = z.object({
    id: z.string().min(1),
    providerId: z.string().min(1),
    label: z.string().min(1),
    lastUsedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
})

export const HarnessConfigSchema = z.object({
    schemaVersion: z.number().default(1),
    apiUrl: z.url().default(""),
    providerId: z.string().min(1).default("openai"),
    modelId: z.string().min(1).default("gpt-5"),
    workspaceRoots: z.array(z.string().min(1)).min(1).default([]),
    selectedCredentials: z.record(z.string().min(1), CredentialMetadataSchema).default({}),
    initializedAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
})

export interface BootstrapConfiguration {
    defaults: {
        providerId: string | null
        modelId: string | null
        contextWindow: number | null
        maxOutputTokens: number | null
    }
    settings: {
        apiUrl: string,
        schemaVersion: number
    }
}

export const CatalogModelSchema = z.object({
    id: z.string().min(1),
    providerId: z.string().min(1),
    modelId: z.string().min(1),
    displayName: z.string().min(1),
    description: z.string().nullable().optional(),
    supportsTools: z.boolean(),
    supportsImages: z.boolean(),
    contextWindow: z.number().int().positive(),
    maxOutputTokens: z.number().int().positive(),
    inputCostPer1M: z.coerce.number().nullable(),
    outputCostPer1M: z.coerce.number().nullable(),
    isDefault: z.boolean(),
})

export const CatalogProviderSchema = z.object({
    id: z.string().min(1),
    providerId: z.string().min(1),
    displayName: z.string().min(1),
    description: z.string().nullable().optional(),
    documentationUrl: z.string().nullable().optional(),
    isDefault: z.boolean(),
    models: z.array(CatalogModelSchema),
})

export const CatalogSnapshotSchema = z.object({
    schemaVersion: z.literal(1).default(1),
    fetchedAt: z.iso.datetime(),
    providers: z.array(CatalogProviderSchema),
})


export const SessionSummarySchema = z.object({
    id: z.string().min(1),
    providerId: z.string().min(1),
    modelId: z.string().min(1),
    title: z.string().nullable(),
    status: z.string().min(1),
    createdAt: z.string(),
    updatedAt: z.string(),
    lastMessageAt: z.string().nullable(),
})
export type SessionSummary = z.infer<typeof SessionSummarySchema>

export interface SessionTurn {
    id: string
    sequence: number
    responseId: string | null
    stopReason: string | null
    inputTokens: number
    outputTokens: number
    cachedTokens: number
    reasoningTokens: number
    createdAt: string
}

export interface SessionMessage {
    id: string
    sequence: number
    turnId: string | null
    role: string
    content: string | null
    toolCalls: unknown
    toolCallId: string | null
    name: string | null
    isError: boolean | null
    providerMetadata: unknown
    createdAt: string
}

export interface SessionInteraction {
    id: string
    sequence: number
    providerId: string
    modelId: string
    mode: string
    thinkingLevel: string
    temperature: number | null
    maxOutputTokens: number | null
    inputTokens: number
    outputTokens: number
    status: string
    startedAt: string
    completedAt: string | null
    turns: SessionTurn[]
    messages: SessionMessage[]
}

export interface UsageStats {
    inputTokens: number
    outputTokens: number
    cachedTokens: number
    reasoningTokens: number
    totalTokens: number
    inputCost: number
    outputCost: number
    totalCost: number
}

export interface ModelUsage extends UsageStats {
    providerId: string
    modelId: string
}

export interface ProviderUsage extends UsageStats {
    providerId: string
}

export interface SessionUsageSummary {
    total: UsageStats
    byModels: Record<string, ModelUsage>
    byProviders: Record<string, ProviderUsage>
}

export interface SessionDetail extends SessionSummary {
    userId: string
    systemPrompt: string | null
    interactions: SessionInteraction[]
    compactions: unknown[]
    usage: SessionUsageSummary
}

export interface StreamHandle {
    sessionId: string | null
    events: AsyncGenerator<ProviderStreamEvent>
}

export interface StartSessionInput {
    providerId: string
    modelId: string
    credentialLabel: string
    message: string
    mode?: AgentCallMode
    thinkingLevel?: ThinkingLevel
    title?: string
    systemPrompt?: string
    temperature?: number
    maxOutputTokens?: number
}

export interface ContinueSessionToolResultInput {
    toolCallId: string
    name: string
    category: string
    content?: string
    isError?: boolean
}

export interface ContinueSessionInput {
    credentialLabel: string
    message?: string
    toolResults?: ContinueSessionToolResultInput[]
    providerId?: string
    modelId?: string
    mode?: AgentCallMode
    thinkingLevel?: ThinkingLevel
    temperature?: number
    maxOutputTokens?: number
}

export type AuthSession = z.infer<typeof AuthSessionSchema>
export type HarnessUser = z.infer<typeof HarnessUserSchema>
export type HarnessConfig = z.infer<typeof HarnessConfigSchema>
export type CatalogModel = z.infer<typeof CatalogModelSchema>
export type CatalogProvider = z.infer<typeof CatalogProviderSchema>
export type CatalogSnapshot = z.infer<typeof CatalogSnapshotSchema>
export type CredentialMetadata = z.infer<typeof CredentialMetadataSchema>
// export type SessionHistoryItem = z.infer<typeof SessionHistoryItemSchema>


export interface DeviceLoginStart {
    deviceCode: string
    userCode: string
    verificationUri: string
    verificationUriComplete: string
    expiresIn: number
    interval: number
}