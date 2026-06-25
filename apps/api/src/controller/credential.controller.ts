import { Request, Response } from "express";
import { prisma } from "@workspace/database";
import { CreateProviderCredentialSchema } from "@workspace/protocol";
import { ValidationError } from "../utils/error.js";
import { encryptApiKey } from "../service/vault.js";
import { requireUserId } from "../utils/auth.js";

const CREDENTIAL_METADATA_SELECT = {
    id: true,
    providerId: true,
    tag: true,
    createdAt: true,
    updatedAt: true,
} as const;

export class CredentialController {

    constructor() { }

    /** Lists the current user's provider credentials, never the decrypted key. */
    getAllCrdentialsMetadata = async (request: Request, response: Response) => {
        const userId = requireUserId(request);
        const credentials = await prisma.providerCredential.findMany({
            where: { userId },
            select: CREDENTIAL_METADATA_SELECT,
            orderBy: { createdAt: "desc" },
        });
        return response.status(200).json({ credentials })
    }

    deleteAllCrdential = async (request: Request, response: Response) => {
        const userId = requireUserId(request);
        const result = await prisma.providerCredential.deleteMany({ where: { userId } });
        return response.status(200).json({ success: true, count: result.count })
    }

    /** Encrypts and stores an API key for a provider/tag, replacing any existing one for that pair. */
    addCrdential = async (request: Request, response: Response) => {
        const validate = CreateProviderCredentialSchema.safeParse(request.body);
        if (!validate.success) {
            throw new ValidationError(validate.error.issues.map(issue => issue.message).join(", "));
        }
        const userId = requireUserId(request);
        const { providerId, tag, apiKey } = validate.data;
        const secret = encryptApiKey(apiKey, { userId, providerId, tag });

        const credential = await prisma.providerCredential.upsert({
            where: { userId_providerId_tag: { userId, providerId, tag } },
            create: { userId, providerId, tag, ...secret },
            update: { ...secret },
            select: CREDENTIAL_METADATA_SELECT,
        });
        return response.status(200).json({ credential })
    }

    deleteCrdentialById = async (request: Request, response: Response) => {
        const userId = requireUserId(request);
        const { id } = request.params;
        await prisma.providerCredential.deleteMany({ where: { id, userId } });
        return response.status(200).json({ success: true })
    }

}