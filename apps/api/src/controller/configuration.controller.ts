import { Prisma, prisma } from "@workspace/database";
import type { Request, Response } from "express";
import { requireUserId } from "../utils/request.js";
import { validate } from "../utils/validate.js";
import { ConfigurationKeyParametersSchema, SaveConfigurationSchema } from "@workspace/protocol";
import { recordAuditEvent } from "../service/audit.js";
import { NotFoundError } from "../utils/api-error.js";

export class ConfigurationController {
    bootstrap = async (request: Request, response: Response): Promise<Response> => {
        const [defaultProvider, settings] = await Promise.all([
            prisma.providerCatalog.findFirst({
                where: { enabled: true, isDefault: true },
                orderBy: { updatedAt: "desc" },
                select: {
                    providerId: true,
                    models: {
                        where: { enabled: true, isDefault: true },
                        orderBy: { updatedAt: "desc" },
                        select: {
                            modelId: true,
                            contextWindow: true,
                            maxOutputTokens: true
                        }
                    }
                }
            }),
            prisma.applicationSetting.findMany({
                where: { isPublic: true },
                select: { key: true, value: true },
                orderBy: { key: "asc" }
            })
        ])

        const defaultModel = defaultProvider?.models[0];
        return response.status(200).json({
            defauls: {
                providerId: defaultProvider?.providerId ?? null,
                modelId: defaultModel?.modelId ?? null,
                contextWindow: defaultModel?.contextWindow ?? null,
                maxOutputTokens: defaultModel?.maxOutputTokens ?? null,
            },
            settings: Object.fromEntries(
                settings.map((setting) => [setting.key, setting.value])
            )
        });
    }

    list = async (request: Request, response: Response): Promise<Response> => {
        const settings = await prisma.applicationSetting.findMany({
            orderBy: { key: "asc" },
        })
        return response.status(200).json({ settings })
    }

    save = async (request: Request, response: Response): Promise<Response> => {
        const userId = requireUserId(request);
        const { key } = validate(ConfigurationKeyParametersSchema, request.params);
        const input = validate(SaveConfigurationSchema, request.body);
        const value = input.value === null ? Prisma.JsonNull : (input.value as Prisma.InputJsonValue);
        const setting = await prisma.applicationSetting.upsert({
            where: { key },
            create: { key, ...input, value, updatedById: userId },
            update: { ...input, value, updatedById: userId }
        });
        await recordAuditEvent(request, "configuration.saved", "ApplicationSetting", key)
        return response.status(200).json({ setting })
    }

    remove = async (request: Request, response: Response): Promise<Response> => {
        const { key } = validate(ConfigurationKeyParametersSchema, request.params)
        const result = await prisma.applicationSetting.deleteMany({
            where: { key },
        })
        if (result.count === 0) {
            throw new NotFoundError("The configuration setting was not found.")
        }
        await recordAuditEvent(request, "configuration.deleted", "ApplicationSetting", key)
        return response.status(204).send()
    }

}