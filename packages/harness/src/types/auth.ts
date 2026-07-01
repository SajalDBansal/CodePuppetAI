import z from "zod";
import { CredentialMetadataSchema } from "./credential.js";

export const AuthUserSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    email: z.email(),
});

/** The currently selected credential's metadata for each provider, keyed by provider id. */
export const AuthCredentialMetadataSchema = z.record(z.string(), CredentialMetadataSchema);

export const AuthFileSchema = z.object({
    apiUrl: z.url(),
    tokenAccount: z.string().min(1),
    user: AuthUserSchema,
    expiresAt: z.iso.datetime(),
    credentialMetadata: AuthCredentialMetadataSchema.default({}),
});

/** Shape returned by POST /cli/login/token once a device login is approved. */
export const LoginResultSchema = z.object({
    accessToken: z.string().min(1),
    expiresAt: z.iso.datetime(),
    user: AuthUserSchema,
});

export type AuthUser = z.infer<typeof AuthUserSchema>;
export type AuthCredentialMetadata = z.infer<typeof AuthCredentialMetadataSchema>;
export type AuthFile = z.infer<typeof AuthFileSchema>;
export type LoginResult = z.infer<typeof LoginResultSchema>;
