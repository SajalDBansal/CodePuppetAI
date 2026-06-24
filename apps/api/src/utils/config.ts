function requiredEnvironmentVariable(name: string) {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is required to start the API`);
    return value;
}

function parsePort(value: string | undefined): number {
    const port = Number(value ?? 3001);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
        throw new Error("PORT must be an integer between 1 and 65535");
    }
    return port;
}

function parseVaultMasterKey(name: string): string {
    const raw = requiredEnvironmentVariable(name);
    let decoded: Buffer;
    try {
        decoded = Buffer.from(raw, "base64");
    } catch {
        throw new Error(`${name} must be valid base64`);
    }
    if (decoded.length < 32) {
        throw new Error(`${name} must decode to at least 32 bytes (256 bits); generate one with: openssl rand -base64 32`);
    }
    return raw;
}

export const envConfig = {
    PORT: parsePort(process.env.PORT),
    BETTER_AUTH_URL: requiredEnvironmentVariable("BETTER_AUTH_URL"),
    BETTER_AUTH_SECRET: requiredEnvironmentVariable("BETTER_AUTH_SECRET"),
    WEB_ORIGIN: requiredEnvironmentVariable("WEB_ORIGIN"),
    APP_NAME: requiredEnvironmentVariable("APP_NAME"),
    VAULT_MASTER_KEY: parseVaultMasterKey("VAULT_MASTER_KEY"),
}
