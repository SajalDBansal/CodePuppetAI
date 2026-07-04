import fs from "fs-extra";
import { access, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface HarnessPathStatus {
    agentDirectory: boolean;
    authFile: boolean;
    configFile: boolean;
    catalogFile: boolean;
    sessionDirectory: boolean;
}

export class HarnessPath {

    constructor(
        public readonly homeDir: string = os.homedir(),
        public readonly directoryName = ".code-puppet"
    ) { }

    /** Get the global agent directory path */
    get agentDir(): string {
        return path.join(this.homeDir, this.directoryName);
    }

    /** Get the authentication file path. */
    get authFile(): string {
        return path.join(this.agentDir, `auth.json`);
    }

    /** Get the configuration file path. */
    get configFile(): string {
        return path.join(this.agentDir, `config.json`);
    }

    /** Get the model catalog file path. */
    get catalogFile(): string {
        return path.join(this.agentDir, `model.json`);
    }

    /** Get the session folder path. */
    get sessionDir(): string {
        return path.join(this.agentDir, `session`);
    }

    /** Ensure every directory present. */
    async ensureAllDirExists(): Promise<void> {
        await fs.ensureDir(this.agentDir);
        await fs.ensureDir(this.sessionDir);
    }

    async status(): Promise<HarnessPathStatus> {
        const [agentDirectory, authFile, configFile, catalogFile, sessionDirectory] =
            await Promise.all([
                isType(this.agentDir, "directory"),
                isType(this.authFile, "file"),
                isType(this.configFile, "file"),
                isType(this.catalogFile, "file"),
                isType(this.sessionDir, "directory"),
            ])
        return {
            agentDirectory,
            authFile,
            configFile,
            catalogFile,
            sessionDirectory,
        }
    }

    async canRead(target: string): Promise<boolean> {
        try {
            await access(target)
            return true
        } catch {
            return false
        }
    }
}

async function isType(target: string, expected: "file" | "directory"): Promise<boolean> {
    try {
        const details = await stat(target)
        return expected === "file" ? details.isFile() : details.isDirectory()
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT" || code === "ENOTDIR") return false;
        throw error;
    }
}
