import keytar from "keytar";
import axios from "axios";
import { CredentialMetadataSchema, type CredentialMetadata } from "../types/credential.js";
import { AuthStore } from "./auth-store.js";

/** Single source of truth for reading/writing secrets in the OS keychain via keytar, and provider credentials on the backend. */
export class VaultStore {
    private readonly tokenService: string;

    constructor(public backendUrl: string, public service: string = "deepmind",) {
        this.tokenService = `${service}:token`;
    }

    /** Get the auth headers for a backend request, if a session is available. */
    private async authHeaders(): Promise<Record<string, string> | undefined> {
        const accessToken = await new AuthStore(this.backendUrl).getAccessToken();
        return accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined;
    }

    // ---- Access token ----

    /** Get the stored access token, or null if it isn't set. */
    async getToken(account: string): Promise<string | null> {
        return keytar.getPassword(this.tokenService, account);
    }

    /** Store the access token, overwriting any existing value. */
    async setToken(account: string, value: string): Promise<void> {
        await keytar.setPassword(this.tokenService, account, value);
    }

    /** Delete the stored access token. Returns true if a value was removed. */
    async deleteToken(account: string): Promise<boolean> {
        return keytar.deletePassword(this.tokenService, account);
    }

    /** Check whether an access token exists, without exposing it. */
    async checkToken(account: string): Promise<boolean> {
        return (await this.getToken(account)) !== null;
    }

    // ---- Provider credentials ----

    /** Store a credential for a provider/tag on the backend, overwriting any existing value for that pair. */
    async setCredential(providerId: string, tag: string, apiKey: string): Promise<CredentialMetadata> {
        const response = await axios.post(
            `${this.backendUrl}/api/v1/credential`,
            { providerId, tag, apiKey },
            { headers: await this.authHeaders() },
        );
        return CredentialMetadataSchema.parse(response.data.credential);
    }

    /** Delete a stored credential by id. */
    async deleteCredential(id: string): Promise<void> {
        await axios.delete(`${this.backendUrl}/api/v1/credential/${id}`, {
            headers: await this.authHeaders(),
        });
    }

    /** Get every stored credential's metadata (the encrypted key is never returned). */
    async getAllCredentialsMetadata(): Promise<CredentialMetadata[]> {
        const response = await axios.get(`${this.backendUrl}/api/v1/credential`, {
            headers: await this.authHeaders(),
        });
        return CredentialMetadataSchema.array().parse(response.data.credentials);
    }

    /** Delete every stored credential. */
    async deleteAllCredentials(): Promise<number> {
        const response = await axios.delete(`${this.backendUrl}/api/v1/credential`, {
            headers: await this.authHeaders(),
        });
        return response.data.count;
    }

}