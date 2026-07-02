import z from "zod";

const ProviderIdSchema = z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

export const ModelListQuerySchema = z.object({
    providerId: ProviderIdSchema.optional(),
    includeDisabled: z.stringbool().default(false),
})

export const CreateProviderSchema = z.object({
    providerId: ProviderIdSchema,
    displayName: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1_000).optional(),
    documentationUrl: z.url().optional(),
    enabled: z.boolean().default(true),
    isDefault: z.boolean().default(false),
})

export const ProviderIdParametersSchema = z.object({
    providerId: ProviderIdSchema,
})

export const UpdateProviderSchema = CreateProviderSchema.omit({
    providerId: true,
})
    .partial()
    .refine(
        (value) => Object.keys(value).length > 0,
        "At least one field is required."
    )

export const CreateModelSchema = z.object({
    providerId: ProviderIdSchema,
    modelId: z.string().trim().min(1).max(160),
    displayName: z.string().trim().min(1).max(160),
    description: z.string().trim().max(1_000).optional(),
    supportsTools: z.boolean().default(false),
    supportsImages: z.boolean().default(false),
    contextWindow: z.number().int().positive(),
    maxOutputTokens: z.number().int().positive(),
    inputCostPer1M: z.number().nonnegative().nullable().default(null),
    outputCostPer1M: z.number().nonnegative().nullable().default(null),
    enabled: z.boolean().default(true),
    isDefault: z.boolean().default(false),
    metadata: z.record(z.string(), z.unknown()).optional(),
})

export const ModelParametersSchema = z.object({
    providerId: ProviderIdSchema,
    modelId: z.string().trim().min(1).max(160),
})

export const UpdateModelSchema = CreateModelSchema.omit({
    providerId: true,
    modelId: true,
})
    .partial()
    .refine(
        (value) => Object.keys(value).length > 0,
        "At least one field is required."
    )