import fs from "fs-extra";
import axios from "axios";
import { HarnessConfigSchema, type HarnessConfig } from "@workspace/protocol";
import { Path } from "../utils/path.js";
import { AuthStore } from "./auth-store.js";
import path from "node:path";
import { access, constants } from "node:fs/promises";

export class ConfigStore {
    path: Path;
    filePath: string;

    constructor(public backendUrl: string) {
        this.path = new Path();
        this.filePath = this.path.getConfigFile();
    }

    /** Read and parse the config file. Returns null if it's missing or doesn't match the schema. */
    async get(): Promise<HarnessConfig | null> {
        if (!await this.path.checkConfigFileExists()) return null;

        const result = HarnessConfigSchema.safeParse(await fs.readJson(this.filePath));
        return result.success ? result.data : null;
    }

    /** Validate and persist a full configuration object. */
    async set(config: HarnessConfig): Promise<void> {
        const validated = HarnessConfigSchema.parse(config);
        await fs.ensureDir(this.path.getAgentDir());
        await fs.writeJson(this.filePath, validated, { spaces: 2 });
    }

    /** Check whether the config file exists and matches the expected schema. */
    async check(): Promise<boolean> {
        return (await this.get()) !== null;
    }

    /** Fetch the latest default config from the backend and persist it, falling back to schema defaults. Relative workspace roots (e.g. ".") are resolved against `cwd` so they refer to a fixed absolute path rather than being reinterpreted on every future invocation. */
    async setDefault(cwd: string = process.cwd()): Promise<void> {
        const config = await this.fetchDefaultConfig();
        await this.set({
            ...config,
            workspaceRoots: config.workspaceRoots.map((root) =>
                path.isAbsolute(root) ? root : path.resolve(cwd, root)
            ),
        });
    }

    /** Check whether every configured workspace root is readable and writable from `cwd`. */
    async checkWorkDirAccess() {
        const config = await this.get();
        if (!config) return false;
        return Promise.all(
            config.workspaceRoots.map(async (root: string) => {
                const absolute = path.resolve(this.path.getAgentDir(), root);
                try {
                    await access(absolute, constants.R_OK);

                    return { root: absolute, readable: true, };
                } catch {
                    return { root: absolute, readable: false, };
                }
            })
        );
    }

    /** Fetch the default config from the backend and validate it against the schema, falling back to schema defaults on any failure. */
    private async fetchDefaultConfig(): Promise<HarnessConfig> {
        try {
            const accessToken = await new AuthStore(this.backendUrl).getAccessToken();
            const response = await axios.get(`${this.backendUrl}/api/v1/config/init`, {
                headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
            });
            return HarnessConfigSchema.parse(response.data.config);
        } catch {
            return HarnessConfigSchema.parse({});
        }
    }

}
