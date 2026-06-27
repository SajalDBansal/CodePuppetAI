import fs from "fs-extra";
import axios from "axios";
import { Path } from "../utils/path.js";
import { VaultStore } from "./vault-store.js";
import { AuthFileSchema, type AuthFile, type LoginResult } from "../types/auth.js";

export class AuthStore {
    path: Path;
    filePath: string;
    vaultStore: VaultStore;

    constructor(public backendUrl: string) {
        this.path = new Path();
        this.filePath = this.path.getAuthFile();
        this.vaultStore = new VaultStore(backendUrl);
    }

    /** Persist the API url, vault token reference and user details, and save the access token in the vault. */
    async save(login: LoginResult): Promise<void> {
        const auth: AuthFile = {
            apiUrl: this.backendUrl,
            tokenAccount: login.accessToken,
            user: login.user,
            expiresAt: login.expiresAt,
        };

        await fs.ensureDir(this.path.getAgentDir());
        await fs.writeJson(this.filePath, auth, { spaces: 2 });
        await this.vaultStore.setToken(auth.user.id, login.accessToken);
    }

    /** Read and parse the auth file. Returns null if it's missing or doesn't match the schema. */
    async get(): Promise<AuthFile | null> {
        if (!await this.path.checkAuthFileExists()) return null;

        const result = AuthFileSchema.safeParse(await fs.readJson(this.filePath));
        return result.success ? result.data : null;
    }

    /** Get the access token from the vault referenced by the auth file. */
    async getAccessToken(): Promise<string | null> {
        const auth = await this.get();
        if (!auth) return null;

        return this.vaultStore.getToken(auth.user.id);
    }

    /** Check whether the auth file exists and matches the expected schema. */
    async check(): Promise<boolean> {
        return (await this.get()) !== null;
    }

    /** Remove the auth file and the vaulted access token. */
    async clear(): Promise<void> {
        const auth = await this.get();
        if (auth) await this.vaultStore.deleteToken(auth.tokenAccount);
        await fs.remove(this.filePath);
    }

    /**
     * Check whether the current session is expired, i.e. the user needs to log in again.
     * Confirms the local expiry first, then verifies the access token against the backend.
     */
    async isSessionExpired(): Promise<boolean> {
        const auth = await this.get();
        if (!auth) return true;

        if (new Date(auth.expiresAt).getTime() <= Date.now()) return true;

        const accessToken = await this.getAccessToken();
        if (!accessToken) return true;

        try {
            await axios.post(`${auth.apiUrl}/api/v1/me`, undefined, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            return false;
        } catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 403) {
                return true;
            }
            throw error;
        }
    }

}
