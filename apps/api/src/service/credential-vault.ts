import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { environment } from "../utils/environment.js";
import { ValidationError } from "../utils/api-error.js";

const algorithm = "aes-256-gcm";
const initializationVectorLength = 12;
const authenticationTagLength = 16;
const derivedKeyLength = 32;
const currentKeyVersion = 1;

export type CredentialContext = {
    userId: string;
    providerId: string;
    label: string;
}

export type EncryptedCredential = {
    ciphertext: string;
    iv: string;
    authTag: string;
    keyVersion: number;
}

function deriveUserKey(userId: string, keyVersion: number): Buffer {
    const masterKey = Buffer.from(environment.VAULT_MASTER_KEY, "base64");
    const information = Buffer.from(`credential:v${keyVersion}:user:${userId}`, "utf-8");

    return Buffer.from(hkdfSync("sha256", masterKey, Buffer.alloc(0), information, derivedKeyLength));
}

function buildAdditionalData(context: CredentialContext): Buffer {
    return Buffer.from(`${context.userId}:${context.providerId}:${context.label}`, "utf-8");
}

export function EncryptCredential(apiKey: string, context: CredentialContext): EncryptedCredential {
    const key = deriveUserKey(context.userId, currentKeyVersion);
    const iv = randomBytes(initializationVectorLength);
    const cipher = createCipheriv(algorithm, key, iv, {
        authTagLength: authenticationTagLength
    });
    cipher.setAAD(buildAdditionalData(context));

    const ciphertext = Buffer.concat([
        cipher.update(apiKey, "utf-8"),
        cipher.final()
    ])

    return {
        ciphertext: ciphertext.toString("base64"),
        iv: iv.toString("base64"),
        authTag: cipher.getAuthTag().toString("base64"),
        keyVersion: currentKeyVersion,
    }
}

export function decryptCredential(credential: EncryptedCredential, context: CredentialContext): string {
    const key = deriveUserKey(context.userId, credential.keyVersion);
    const decipher = createDecipheriv(algorithm, key, Buffer.from(credential.iv, "base64"), {
        authTagLength: authenticationTagLength
    })
    decipher.setAAD(buildAdditionalData(context));
    decipher.setAuthTag(Buffer.from(credential.authTag, "base64"));
    try {
        return Buffer.concat([
            decipher.update(Buffer.from(credential.ciphertext, "base64")),
            decipher.final()
        ]).toString();
    } catch {
        throw new ValidationError("The stored credential could not be decrypted.");
    }
}