import { createHash, createPublicKey } from "node:crypto"

export function publicKeyFingerprint(publicKetPem: string): string {
    const publicKey = createPublicKey(publicKetPem);
    const der = publicKey.export({ type: "spki", format: "der" });
    return createHash("sha256").update(der).digest("hex")
}

export function hashDeviceCode(deviceCode: string): string {
    return createHash("sha256").update(deviceCode).digest("hex")
}