import { Request, Response } from "express";
import { HarnessConfigSchema } from "@workspace/protocol";
import { prisma } from "@workspace/database";

export class ConfigController {

    constructor() { }

    /** Returns the default config schema. */
    initialize = async (request: Request, response: Response) => {
        const defaultProvider = await prisma.providerCatalog.findFirst({
            where: { isDefault: true },
            orderBy: { updatedAt: "desc" },
            select: {
                providerId: true,
                modelCatalogs: {
                    where: { isDefault: true, active: true },
                    take: 1,
                    orderBy: { updatedAt: "desc" },
                    select: {
                        contextWindow: true,
                        maxOutputTokens: true,
                        modelId: true
                    }
                }
            },
        });
        const defaultModel = defaultProvider?.modelCatalogs[0];
        const defaultConfig = HarnessConfigSchema.parse(defaultProvider && defaultModel ? {
            provider: defaultProvider.providerId,
            model: defaultModel.modelId,
            maxContextTokens: defaultModel.contextWindow,
            maxOutputTokens: defaultModel.maxOutputTokens,
        } : {});
        return response.status(200).json({ config: defaultConfig })
    }

}
