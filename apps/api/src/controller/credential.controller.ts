import type { Request, Response } from "express";
import { requireUserId } from "../utils/request.js";
import { prisma } from "@workspace/database";
import { recordAuditEvent } from "../service/audit.js";
import { validate } from "../utils/validate.js";
import { CreateCredentialSchema, CredentialIdParametersSchema } from "@workspace/protocol";
import { EncryptCredential } from "../service/credential-vault.js";
import { NotFoundError } from "../utils/api-error.js";

const publicCredentialFields = {
    id: true,
    providerId: true,
    label: true,
    lastUsedAt: true,
    createdAt: true,
    updatedAt: true,
} as const

export class CredentialController {
    list = async (request: Request, response: Response): Promise<Response> => {
        const userId = requireUserId(request)
        const credentials = await prisma.providerCredential.findMany({
            where: { userId },
            select: publicCredentialFields,
            orderBy: { updatedAt: "desc" },
        })
        return response.status(200).json({ credentials })
    }

    save = async (request: Request, response: Response): Promise<Response> => {
        const userId = requireUserId(request)
        const input = validate(CreateCredentialSchema, request.body)
        const encrypted = EncryptCredential(input.apiKey, {
            userId,
            providerId: input.providerId,
            label: input.label,
        })

        const credential = await prisma.providerCredential.upsert({
            where: {
                userId_providerId_label: {
                    userId,
                    providerId: input.providerId,
                    label: input.label,
                },
            },
            create: {
                userId,
                providerId: input.providerId,
                label: input.label,
                ...encrypted,
            },
            update: encrypted,
            select: publicCredentialFields,
        })
        await recordAuditEvent(
            request, "credential.saved", "ProviderCredential", credential.id,
            { providerId: credential.providerId, label: credential.label, }
        )
        return response.status(201).json({ credential })
    }

    remove = async (request: Request, response: Response): Promise<Response> => {
        const userId = requireUserId(request)
        const { credentialId } = validate(CredentialIdParametersSchema, request.params)
        const result = await prisma.providerCredential.deleteMany({
            where: { id: credentialId, userId },
        })

        if (result.count === 0) {
            throw new NotFoundError("The credential was not found.")
        }

        await recordAuditEvent(request, "credential.deleted", "ProviderCredential", credentialId)
        return response.status(204).send()
    }

    removeAll = async (request: Request, response: Response): Promise<Response> => {
        const userId = requireUserId(request)
        const result = await prisma.providerCredential.deleteMany({
            where: { userId },
        })

        await recordAuditEvent(
            request, "credential.deleted_all", "ProviderCredential", undefined,
            { count: result.count, }
        )
        return response.status(200).json({ deletedCount: result.count })
    }
}