import {
    readFile,
    unlink,
} from "node:fs/promises"
import fs from "fs-extra";
import { CredentialMetadata, HarnessConfig, HarnessConfigSchema } from "../types.js";
import { HarnessPath } from "./path.js";
import path from "node:path";

export class ConfigStore {
    readonly filePath: string

    constructor(paths = new HarnessPath()) {
        this.filePath = paths.configFile
    }

    async get(): Promise<HarnessConfig | null> {
        try {
            const content = await readFile(this.filePath, "utf8");
            const result = HarnessConfigSchema.safeParse(JSON.parse(content));
            return result.success ? result.data : null
        } catch {
            return null
        }
    }

    async set(value: HarnessConfig): Promise<void> {
        try {
            const parsed = HarnessConfigSchema.parse(value)
            const directory = path.dirname(this.filePath);
            await fs.ensureDir(directory);
            await fs.writeJSON(this.filePath, parsed, { spaces: 2 })
        } catch (error) {
            console.log(error);
        }
    }

    async clear(): Promise<void> {
        try {
            await unlink(this.filePath)
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
        }
    }

    async addWorkspaceRoot(workspaceRoot: string): Promise<void> {
        const config = await this.get()
        if (!config) throw new Error("Harness configuration does not exist.")
        const absoluteRoot = path.resolve(workspaceRoot)
        if (config.workspaceRoots.some((root) => path.resolve(root) === absoluteRoot)) {
            return
        }
        await this.set({
            ...config,
            workspaceRoots: [...config.workspaceRoots, absoluteRoot],
            updatedAt: new Date().toISOString(),
        })
    }

    async selectCredential(credential: CredentialMetadata): Promise<void> {
        const config = await this.get()
        if (!config) throw new Error("Harness configuration does not exist.")
        await this.set({
            ...config,
            selectedCredentials: {
                ...config.selectedCredentials,
                [credential.providerId]: credential,
            },
            updatedAt: new Date().toISOString(),
        })
    }

    async clearCredential(providerId: string): Promise<void> {
        const config = await this.get()
        if (!config) return
        const selectedCredentials = { ...config.selectedCredentials }
        delete selectedCredentials[providerId]
        await this.set({
            ...config,
            selectedCredentials,
            updatedAt: new Date().toISOString(),
        })
    }
}