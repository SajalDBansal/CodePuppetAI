import z from "zod"

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