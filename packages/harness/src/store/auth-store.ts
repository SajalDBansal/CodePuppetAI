import {
    readFile,
    unlink,
} from "node:fs/promises"
import fs from "fs-extra";
import { AuthSession, AuthSessionSchema } from "../types.js";
import { HarnessPath } from "./path.js";
import path from "node:path";

export class AuthStore {
    readonly filePath: string

    constructor(paths = new HarnessPath()) {
        this.filePath = paths.authFile
    }

    async get(): Promise<AuthSession | null> {
        try {
            const content = await readFile(this.filePath, "utf8");
            const result = AuthSessionSchema.safeParse(JSON.parse(content));
            return result.success ? result.data : null
        } catch {
            return null
        }
    }

    async set(value: AuthSession): Promise<void> {
        const parsed = AuthSessionSchema.parse(value)
        const directory = path.dirname(this.filePath);
        await fs.ensureDir(directory);
        await fs.writeJSON(this.filePath, parsed, { spaces: 2 })
    }

    async clear(): Promise<void> {
        try {
            await unlink(this.filePath)
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
        }
    }

    async getAccessToken(): Promise<string | null> {
        const auth = await this.get()
        if (!auth || new Date(auth.expiresAt).getTime() <= Date.now()) return null
        return auth.accessToken
    }

    async isAuthenticated(): Promise<boolean> {
        return (await this.getAccessToken()) !== null
    }
}