import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { envConfig } from "../utils/config.js";
import { ValidationError } from "../utils/error.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const DERIVED_KEY_LENGTH = 32;

const KEY_VERSION = 1;

export interface VaultContext {
    userId: string;
    providerId: string;
    tag: string;
}

export interface EncryptedSecret {
    ciphertext: string;
    iv: string;
    authTag: string;
    keyVersion: number;
}

function getMasterKey(): Buffer {
    return Buffer.from(envConfig.VAULT_MASTER_KEY, "base64");
}

function deriveUserKey(userId: string, keyVersion: number): Buffer {
    const masterKey = getMasterKey();
    const info = Buffer.from(`vault:v${keyVersion}:user:${userId}`, "utf8");
    return Buffer.from(hkdfSync("sha256", masterKey, Buffer.alloc(0), info, DERIVED_KEY_LENGTH));
}

function buildAad(context: VaultContext): Buffer {
    return Buffer.from(`${context.userId}:${context.providerId}:${context.tag}`, "utf8");
}

export function encryptApiKey(apiKey: string, context: VaultContext): EncryptedSecret {
    if (!apiKey) {
        throw new ValidationError("apiKey is required for encryption");
    }

    const key = deriveUserKey(context.userId, KEY_VERSION);
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    cipher.setAAD(buildAad(context));

    const ciphertext = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
        ciphertext: ciphertext.toString("base64"),
        iv: iv.toString("base64"),
        authTag: authTag.toString("base64"),
        keyVersion: KEY_VERSION,
    };
}

export function decryptApiKey(secret: EncryptedSecret, context: VaultContext): string {
    const key = deriveUserKey(context.userId, secret.keyVersion);
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(secret.iv, "base64"), { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAAD(buildAad(context));
    decipher.setAuthTag(Buffer.from(secret.authTag, "base64"));

    try {
        const plaintext = Buffer.concat([
            decipher.update(Buffer.from(secret.ciphertext, "base64")),
            decipher.final(),
        ]);
        return plaintext.toString("utf8");
    } catch {
        throw new ValidationError("Failed to decrypt secret: wrong context, corrupted data, or tampering detected");
    }
}
