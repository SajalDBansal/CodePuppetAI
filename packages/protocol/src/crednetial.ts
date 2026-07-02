import { z } from "zod"

export const CreateCredentialSchema = z.object({
    providerId: z.string().trim().min(1).max(120),
    label: z.string().trim().min(1).max(120),
    apiKey: z.string().trim().min(1).max(20_000),
})

export const CredentialIdParametersSchema = z.object({
    credentialId: z.uuid(),
})
