import fs from "fs-extra";
import axios from "axios";
import { Path } from "../utils/path.js";
import { BackendProviderCatalogEntry, CatalogFileSchema, type CatalogFile, type CatalogModel, type CatalogProvider } from "../types/catalog.js";

export class CatalogStore {
    path: Path;
    filePath: string;

    constructor(public backendUrl: string) {
        this.path = new Path();
        this.filePath = this.path.getCatalogFile();
    }

    /** Read and parse the catalog file. Returns null if it's missing or doesn't match the schema. */
    async get(): Promise<CatalogFile | null> {
        if (!await this.path.checkCatalogFileExists()) return null;

        const result = CatalogFileSchema.safeParse(await fs.readJson(this.filePath));
        return result.success ? result.data : null;
    }

    /** Validate and persist a full catalog object. */
    async set(catalog: CatalogFile): Promise<void> {
        const validated = CatalogFileSchema.parse(catalog);
        await fs.ensureDir(this.path.getAgentDir());
        await fs.writeJson(this.filePath, validated, { spaces: 2 });
    }

    /** Check whether the catalog file exists and matches the expected schema. */
    async check(): Promise<boolean> {
        return (await this.get()) !== null;
    }

    /** Fetch the providers catalog (with nested models) from the backend and persist it. */
    async setDefault(): Promise<void> {
        const response = await axios.get<{ providers: BackendProviderCatalogEntry[] }>(
            `${this.backendUrl}/api/v1/provider`,
        );

        const providers: Record<string, CatalogProvider> = {};

        for (const provider of response.data.providers) {
            const models: Record<string, CatalogModel> = {};
            for (const model of provider.modelCatalogs) {
                models[model.modelId] = {
                    id: model.modelId,
                    name: model.displayName,
                    description: model.description ?? undefined,
                    toolCall: model.supportsTools,
                    contextWindow: model.contextWindow,
                    maxOutputTokens: model.maxOutputTokens,
                    isDefault: model.isDefault,
                    inputCostPer1M: model.inputCostPer1M,
                    outputCostPer1M: model.outputCostPer1M,
                };
            }

            providers[provider.providerId] = {
                id: provider.providerId,
                name: provider.displayName,
                docs: provider.docsUrl,
                isDefault: provider.isDefault,
                models,
            };
        }

        await this.set({ schemaVersion: 1, fetchedAt: new Date().toISOString(), providers });
    }

    /** Get every provider in the cached catalog. */
    async getProvidersList(): Promise<CatalogProvider[]> {
        const catalog = await this.get();
        return catalog ? Object.values(catalog.providers) : [];
    }

    /** Get the models available for a provider, keyed by model id. */
    async getModelList(providerId: string): Promise<Record<string, CatalogModel>> {
        const catalog = await this.get();
        return catalog?.providers[providerId]?.models ?? {};
    }

    /** Get the default model for a provider, falling back to the first available model. */
    async getDefaultModelPerProvider(providerId: string): Promise<CatalogModel | undefined> {
        const models = Object.values(await this.getModelList(providerId));
        return models.find((model) => model.isDefault) ?? models[0];
    }

}
