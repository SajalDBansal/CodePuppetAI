import z from "zod";

export const DeviceLoginStartSchema = z.object({
    deviceName: z.string().trim().min(1).max(120).default("CodeAI CLI"),
});

export const DeviceLoginTokenSchema = z.object({
    deviceCode: z.string().trim().min(1),
});

export const VerifyUserCodeSchema = z.object({
    userCode: z.string().trim().min(1),
});

export const DeviceDecisionSchema = z.object({
    userCode: z.string().min(1),
    decision: z.enum(["approve", "deny"]),
})

export const CreateProviderCatalogShema = z.object({
    displayName: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1_000).optional(),
    providerId: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    docsUrl: z.url(),
    isDefault: z.boolean().optional(),
});

export const GetModelCatalogSchema = z.object({
    providerId: z.string().optional(),
});

export const CreateProviderCredentialSchema = z.object({
    providerId: z.string().trim().min(1).max(120),
    tag: z.string().trim().min(1).max(120),
    apiKey: z.string().trim().min(1),
});

export const CreateModelCatalogSchema = z.object({
    providerId: z.string().min(1),
    modelId: z.string().min(1),
    displayName: z.string().min(1),
    description: z.string().optional(),
    supportsTools: z.boolean().optional(),
    contextWindow: z.number().int().positive(),
    maxOutputTokens: z.number().int().positive(),
    inputCostPer1M: z.number().nullable().default(null),
    outputCostPer1M: z.number().nullable().default(null),
    active: z.boolean().optional(),
    isDefault: z.boolean().optional(),
});
