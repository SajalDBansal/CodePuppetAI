import z from "zod";

interface BackendModelCatalogEntry {
    modelId: string;
    displayName: string;
    description?: string | null;
    supportsTools: boolean;
    contextWindow: number;
    maxOutputTokens: number;
    isDefault: boolean;
    inputCostPer1M: number | null;
    outputCostPer1M: number | null;
}

export interface BackendProviderCatalogEntry {
    providerId: string;
    displayName: string;
    docsUrl: string;
    isDefault: boolean;
    modelCatalogs: BackendModelCatalogEntry[];
}

export const CatalogModelSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    toolCall: z.boolean().default(false),
    contextWindow: z.number().int().positive(),
    maxOutputTokens: z.number().int().positive(),
    inputCostPer1M: z.number().nullable().default(null),
    outputCostPer1M: z.number().nullable().default(null),
    isDefault: z.boolean().default(false),
});

export const CatalogProviderSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    docs: z.url().optional(),
    isDefault: z.boolean().default(false),
    models: z.record(z.string(), CatalogModelSchema).default({}),
});

export const CatalogFileSchema = z.object({
    schemaVersion: z.literal(1).default(1),
    fetchedAt: z.iso.datetime(),
    providers: z.record(z.string(), CatalogProviderSchema).default({}),
});

export type CatalogModel = z.infer<typeof CatalogModelSchema>;
export type CatalogProvider = z.infer<typeof CatalogProviderSchema>;
export type CatalogFile = z.infer<typeof CatalogFileSchema>;

/** Alias kept for CLI call sites that import a `Provider` entry shape. */
export type Provider = CatalogProvider;
