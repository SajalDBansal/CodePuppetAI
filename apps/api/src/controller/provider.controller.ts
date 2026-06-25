import { Request, Response } from "express";
import { prisma } from "@workspace/database";
import { CreateModelCatalogSchema, CreateProviderCatalogShema, GetModelCatalogSchema } from "@workspace/protocol";
import { ValidationError } from "../utils/error.js";

export class providerController {

    constructor() { }

    getDefaultModel = async (request: Request, response: Response) => {
        const providers = await prisma.providerCatalog.findMany({
            select: {
                id: true,
                providerId: true,
                displayName: true,
                description: true,
                docsUrl: true,
                isDefault: true,
                modelCatalogs: {
                    where: {
                        active: true,
                        isDefault: true,
                    },
                    take: 1,
                    orderBy: { updatedAt: "desc" },
                    select: {
                        id: true,
                        modelId: true,
                        displayName: true,
                        description: true,
                        supportsTools: true,
                        contextWindow: true,
                        maxOutputTokens: true,
                        inputCostPer1M: true,
                        outputCostPer1M: true,
                        isDefault: true
                    },
                },
            },
            where: {
                modelCatalogs: { some: { active: true, isDefault: true } },
            },
            orderBy: {
                displayName: "asc",
            },
        });
        return response.status(200).json({ providers });
    }

    /** Get the list of all the providers. */
    getProvidersList = async (request: Request, response: Response) => {
        const providers = await prisma.providerCatalog.findMany({
            select: {
                id: true,
                providerId: true,
                displayName: true,
                description: true,
                docsUrl: true,
                isDefault: true,
                modelCatalogs: {
                    where: { active: true },
                    select: {
                        id: true,
                        displayName: true,
                        description: true,
                        isDefault: true,
                        modelId: true,
                        supportsTools: true,
                        contextWindow: true,
                        maxOutputTokens: true,
                        inputCostPer1M: true,
                        outputCostPer1M: true,
                    }
                }
            },
            orderBy: {
                displayName: "asc",
            },
        });

        return response.status(200).json({ providers });
    }

    /** create a new provider in the database. */
    setProvider = async (request: Request, response: Response) => {
        const body = request.body;
        const validate = CreateProviderCatalogShema.safeParse(body);
        if (!validate.success) {
            throw new ValidationError(validate.error.issues.map(issue => issue.message).join(", "));
        }
        const data = validate.data;
        await prisma.$transaction(async transaction => {
            if (data.isDefault) {
                await transaction.providerCatalog.updateMany({
                    where: { isDefault: true },
                    data: { isDefault: false },
                });
            }
            await transaction.providerCatalog.create({ data });
        });
        return response.status(200).json({ success: true });
    }

    /** Get the list of all the model in the database or with provider filter. */
    getModelList = async (request: Request, response: Response) => {
        const query = request.query;
        const validate = GetModelCatalogSchema.safeParse(query);
        if (!validate.success) {
            throw new ValidationError(validate.error.issues.map(issue => issue.message).join(", "));
        }
        const { providerId } = validate.data;
        const modelList = await prisma.modelCatalog.findMany({
            where: { providerId, active: true },
            select: {
                id: true,
                modelId: true,
                displayName: true,
                description: true,
                supportsTools: true,
                contextWindow: true,
                maxOutputTokens: true,
                inputCostPer1M: true,
                outputCostPer1M: true,
                isDefault: true
            }
        });

        return response.status(200).json({ modelList });
    }

    /** Set a new model for the provider */
    setModel = async (request: Request, response: Response) => {
        const body = request.body;
        const validate = CreateModelCatalogSchema.safeParse(body);
        if (!validate.success) {
            throw new ValidationError(validate.error.issues.map(issue => issue.message).join(", "));
        }
        const data = validate.data;
        await prisma.$transaction(async transaction => {
            if (data.isDefault) {
                await transaction.modelCatalog.updateMany({
                    where: { providerId: data.providerId, isDefault: true },
                    data: { isDefault: false },
                });
            }
            await transaction.modelCatalog.create({ data });
        });
        return response.status(200).json({ success: true });
    }
}
