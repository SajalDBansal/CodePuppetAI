import z from "zod";

/** Metadata for a stored provider credential - the encrypted key itself never leaves the backend. */
export const CredentialMetadataSchema = z.object({
    id: z.string().min(1),
    providerId: z.string().min(1),
    tag: z.string().min(1),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
});

export type CredentialMetadata = z.infer<typeof CredentialMetadataSchema>;
