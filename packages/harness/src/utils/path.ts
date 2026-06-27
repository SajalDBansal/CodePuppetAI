import fs from "fs-extra";
import os from "node:os";
import path from "node:path";

export interface AgentPathStatus {
    agentDir: boolean;
    configFile: boolean;
    authFile: boolean;
    modelFile: boolean;
    sessionDir: boolean;
    skillsDir: boolean;
}

export class Path {

    constructor(public readonly homeDir: string = os.homedir()) { }

    /** Get the global agent directory path (for example, ~/.deepmind). */
    getAgentDir(agentName: string = "deepmind") {
        return path.join(this.homeDir, `.${agentName}`);
    }

    /** Get the configuration file path. */
    getConfigFile() {
        return path.join(this.getAgentDir(), `config.json`);
    }

    /** Get the authentication file path. */
    getAuthFile() {
        return path.join(this.getAgentDir(), `auth.json`);
    }

    /** Get the model catalog file path. */
    getCatalogFile() {
        return path.join(this.getAgentDir(), `model.json`);
    }

    /** Get the session folder path. */
    getSessionDir() {
        return path.join(this.getAgentDir(), `session`);
    }

    /** Get the skills folder path. */
    getSkillsDir() {
        return path.join(this.getAgentDir(), `skills`);
    }

    /** Check if the global agent directory exists. */
    async checkAgentDirExists(): Promise<boolean> {
        return this.checkPathType(this.getAgentDir(), "directory");
    }

    /** Check if config file Exists or not. */
    async checkConfigFileExists(): Promise<boolean> {
        return this.checkPathType(this.getConfigFile(), "file");
    }

    /** Check if auth file exists or not. */
    async checkAuthFileExists(): Promise<boolean> {
        return this.checkPathType(this.getAuthFile(), "file");
    }

    /** Check if model file exists or not. */
    async checkCatalogFileExists(): Promise<boolean> {
        return this.checkPathType(this.getCatalogFile(), "file");
    }

    /** Check if the session directory exists or not. */
    async checkSessionDirExists(): Promise<boolean> {
        return this.checkPathType(this.getSessionDir(), "directory");
    }

    /** Check if the skills directory exists or not. */
    async checkSkillsDirExists(): Promise<boolean> {
        return this.checkPathType(this.getSkillsDir(), "directory");
    }

    /** Return the existence status of every path in the global agent directory. */
    async checkAllPaths(): Promise<AgentPathStatus> {
        const [agentDir, configFile, authFile, modelFile, sessionDir, skillsDir] = await Promise.all([
            this.checkAgentDirExists(),
            this.checkConfigFileExists(),
            this.checkAuthFileExists(),
            this.checkCatalogFileExists(),
            this.checkSessionDirExists(),
            this.checkSkillsDirExists(),
        ]);

        return { agentDir, configFile, authFile, modelFile, sessionDir, skillsDir };
    }

    /** Ensure every directory present. */
    async ensureAllDirExists(): Promise<void> {
        await fs.ensureDir(this.getAgentDir());
        await fs.ensureDir(this.getSessionDir());
        await fs.ensureDir(this.getSkillsDir());
    }

    private async checkPathType(targetPath: string, expectedType: "file" | "directory"): Promise<boolean> {
        try {
            const stats = await fs.stat(targetPath);
            return expectedType === "file" ? stats.isFile() : stats.isDirectory();
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code === "ENOENT" || code === "ENOTDIR") return false;
            throw error;
        }
    }

}
