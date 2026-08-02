import type { Request, Response } from "express";
import { Prisma, prisma } from "@workspace/database";
import { validate } from "../utils/validate.js";
import { ModelListQuerySchema, CreateProviderSchema, ProviderIdParametersSchema, UpdateProviderSchema, CreateModelSchema, ModelParametersSchema, UpdateModelSchema } from "@workspace/protocol"
import { recordAuditEvent } from "../service/audit.js";
import { NotFoundError } from "../utils/api-error.js";

export class CatalogController {
    listProviders = async (request: Request, response: Response): Promise<Response> => {
        const providers = await prisma.providerCatalog.findMany({
            where: { enabled: true },
            include: {
                models: {
                    where: { enabled: true },
                    orderBy: [{ isDefault: "desc" }, { displayName: "asc" }]
                },
            },
            orderBy: [{ isDefault: "desc" }, { displayName: "asc" }]
        })
        return response.status(200).json({ providers })
    }

    listModels = async (request: Request, response: Response): Promise<Response> => {
        const query = validate(ModelListQuerySchema, request.query);
        const models = await prisma.modelCatalog.findMany({
            where: {
                providerId: query.providerId,
                enabled: query.includeDisabled ? undefined : true
            },
            orderBy: [
                { providerId: "asc" },
                { isDefault: "desc" },
                { displayName: "asc" },
            ]
        })
        return response.status(200).json({ models })
    }

    createProvider = async (request: Request, response: Response): Promise<Response> => {
        const input = validate(CreateProviderSchema, request.body);
        const provider = await prisma.$transaction(async (tx) => {
            if (input.isDefault) {
                await tx.providerCatalog.updateMany({
                    data: { isDefault: false }
                });
            }
            return tx.providerCatalog.create({ data: input });
        })
        await recordAuditEvent(request, "provider.created", "ProviderCatalog", provider.id);
        return response.status(201).json({ provider })
    }

    updateProvider = async (request: Request, response: Response): Promise<Response> => {
        const { providerId } = validate(ProviderIdParametersSchema, request.params);
        const input = validate(UpdateProviderSchema, request.body);
        const provider = await prisma.$transaction(async (tx) => {
            if (input.isDefault) {
                await tx.providerCatalog.updateMany({
                    data: { isDefault: false }
                });
            }
            return tx.providerCatalog.update({
                where: { providerId },
                data: input
            })
        })
        await recordAuditEvent(request, "provider.updated", "ProviderCatalog", provider.id);
        return response.status(200).json({ provider })
    }

    deleteProvider = async (request: Request, response: Response): Promise<Response> => {
        const { providerId } = validate(ProviderIdParametersSchema, request.params);
        const result = await prisma.providerCatalog.deleteMany({
            where: { providerId }
        });
        if (result.count === 0) {
            throw new NotFoundError("The provider was not found.");
        }
        await recordAuditEvent(request, "provider.deleted", "ProviderCatalog", providerId)
        return response.status(204).send()
    }

    createModel = async (request: Request, response: Response): Promise<Response> => {
        const input = validate(CreateModelSchema, request.body);
        const model = await prisma.$transaction(async (tx) => {
            if (input.isDefault) {
                await tx.modelCatalog.updateMany({
                    where: { providerId: input.providerId },
                    data: { isDefault: false },
                })
            }
            return tx.modelCatalog.create({
                data: {
                    ...input,
                    metadata: input.metadata as Prisma.InputJsonValue | undefined,
                },
            })
        })
        await recordAuditEvent(request, "model.created", "ModelCatalog", model.id)
        return response.status(201).json({ model })
    }

    updateModel = async (request: Request, response: Response): Promise<Response> => {
        const identifier = validate(ModelParametersSchema, request.params);
        const input = validate(UpdateModelSchema, request.body);
        const model = await prisma.$transaction(async (tx) => {
            if (input.isDefault) {
                await tx.modelCatalog.updateMany({
                    where: { providerId: identifier.providerId },
                    data: { isDefault: false },
                })
            }
            return tx.modelCatalog.update({
                where: { providerId_modelId: identifier },
                data: {
                    ...input,
                    metadata: input.metadata as Prisma.InputJsonValue | undefined,
                },
            })
        });
        await recordAuditEvent(request, "model-updated", "ModelCatalog", model.id);
        return response.status(200).json({ model })
    }

    deleteModel = async (request: Request, response: Response): Promise<Response> => {
        const identifier = validate(ModelParametersSchema, request.params);
        const result = await prisma.modelCatalog.deleteMany({ where: identifier });
        if (result.count === 0) {
            throw new NotFoundError("The model was not found.")
        }
        await recordAuditEvent(request, "model.deleted", "ModelCatalog", identifier.modelId, { providerId: identifier.providerId, });
        return response.status(204).send()
    }
}