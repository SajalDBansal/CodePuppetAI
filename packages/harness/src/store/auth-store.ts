import fs from "fs-extra";
import axios from "axios";
import { Path } from "../utils/path.js";
import { VaultStore } from "./vault-store.js";
import { AuthFileSchema, type AuthFile, type LoginResult } from "../types/auth.js";
import type { CredentialMetadata } from "../types/credential.js";

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
        const existing = await this.get();
        const auth: AuthFile = {
            apiUrl: this.backendUrl,
            tokenAccount: login.accessToken,
            user: login.user,
            expiresAt: login.expiresAt,
            credentialMetadata: existing?.credentialMetadata ?? {},
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

    /** Select a provider's credential to use for future calls, persisting its metadata in the auth file. */
    async setCredentialMetaData(providerId: string, credential: CredentialMetadata): Promise<void> {
        const auth = await this.get();
        if (!auth) throw new Error("Not authenticated. Run 'agent login' first.");

        auth.credentialMetadata[providerId] = credential;
        await fs.writeJson(this.filePath, auth, { spaces: 2 });
    }

    /** Get the selected credential metadata for a provider, or null if none is selected. */
    async getCredentialMetadata(providerId: string): Promise<CredentialMetadata | null> {
        const auth = await this.get();
        return auth?.credentialMetadata[providerId] ?? null;
    }

    /** Get the selected credential metadata for every provider, keyed by provider id. */
    async getAllCredentialMetadata(): Promise<Record<string, CredentialMetadata>> {
        const auth = await this.get();
        return auth?.credentialMetadata ?? {};
    }

    /** Clear the selected credential metadata for a single provider. */
    async clearCredentialMetadata(providerId: string): Promise<void> {
        const auth = await this.get();
        if (!auth) return;

        delete auth.credentialMetadata[providerId];
        await fs.writeJson(this.filePath, auth, { spaces: 2 });
    }

    /** Clear the selected credential metadata for every provider. */
    async clearAllCredentialMetadata(): Promise<void> {
        const auth = await this.get();
        if (!auth) return;

        auth.credentialMetadata = {};
        await fs.writeJson(this.filePath, auth, { spaces: 2 });
    }

}
