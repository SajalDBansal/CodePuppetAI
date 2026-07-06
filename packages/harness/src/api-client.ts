import { HarnessApiError } from "./error.js";
import { BootstrapConfiguration, CatalogModelSchema, CatalogProviderSchema, CredentialMetadata, CredentialMetadataSchema, DeviceLoginStart, HarnessUser, HarnessUserSchema } from "./types.js";

export interface ApiClientOptions {
    baseUrl: string
    getAccessToken?: () => Promise<string | null>
}

export class APIClient {
    private readonly baseUrl: string;
    private readonly getAccessToken?: () => Promise<string | null>

    constructor(options: ApiClientOptions) {
        this.baseUrl = options.baseUrl.replace(/\$/, "");
        this.getAccessToken = options.getAccessToken;
    }

    async startDeviceLogin(deviceName: string): Promise<DeviceLoginStart> {
        return this.request("/device-login/start", {
            method: "POST",
            body: { deviceName },
            authenticated: false,
        });
    }

    async exchangeDeviceToken(deviceCode: string): Promise<{
        accessToken: string
        tokenType: string
        expiresIn: number
    }> {
        const result = await this.request<{
            accessToken: string
            tokenType: string
            expiresIn: number
        }>("/device-login/token", {
            method: "POST",
            body: { deviceCode },
            authenticated: false,
        })
        return result
    }

    async getCurrentUser(accessToken?: string): Promise<HarnessUser> {
        const response = await this.request<{ user: unknown }>("/user/me", { accessToken, })
        return HarnessUserSchema.parse(response.user)
    }

    async logout(): Promise<void> {
        await this.request("/user/logout", { method: "POST" })
    }

    async getBootstrapConfig(): Promise<BootstrapConfiguration> {
        return this.request("/configuration/bootstrap");
    }

    async listProviders() {
        const response = await this.request<{ providers: unknown[] }>("/catalog/providers", { authenticated: false })
        return response.providers.map((provider) => {
            const value = provider as Record<string, unknown>;
            return CatalogProviderSchema.parse({
                ...value,
                models: value.models ?? []
            })
        })
    }

    async listModels(providerId?: string) {
        const search = providerId ? `?providersId=${providerId}` : "";
        const response = await this.request<{ models: unknown[] }>(`/catalog/models${search}`, { authenticated: false });
        return response.models.map((model => CatalogModelSchema.parse(model)));
    }

    async listCredentials(): Promise<CredentialMetadata[]> {
        const response = await this.request<{ credentials: unknown[] }>("/credentials");
        return response.credentials.map((cred) => CredentialMetadataSchema.parse(cred));
    }

    async saveCredential(input: {
        providerId: string,
        label: string,
        apiKey: string
    }): Promise<CredentialMetadata> {
        const response = await this.request<{ credential: unknown }>("/credentials", { method: "POST", body: input });
        return CredentialMetadataSchema.parse(response.credential);
    }

    async removeCredential(credentialId: string): Promise<void> {
        await this.request(`/credentials/${credentialId}`, { method: "DELETE" })
    }

    async removeAllCredentials(): Promise<number> {
        const response = await this.request<{ deleteCount: number }>(`/credentials`, { method: "DELETE" });
        return response.deleteCount;
    }

    async listSessionHistory() { }

    async checkLive(): Promise<boolean> {
        try {
            const response = await this.request<{ status: string }>("/health/live", { authenticated: false })
            return response.status === "OK"
        } catch {
            return false
        }
    }

    async checkReady(): Promise<boolean> {
        try {
            const response = await this.request<{ status: string }>("/health/ready", { authenticated: false })
            return response.status === "ready"
        } catch {
            return false
        }
    }

    private async request<T = unknown>(
        path: string,
        options: {
            method?: "GET" | "POST" | "DELETE",
            body?: unknown,
            authenticated?: boolean,
            accessToken?: string
        } = {}
    ): Promise<T> {
        const headers = new Headers({ Accept: "application/json" })
        if (options.body !== undefined) {
            headers.set("Content-Type", "application/json")
        }
        if (options.authenticated !== false) {
            const token = options.accessToken ?? await this.getAccessToken?.()
            if (token) headers.set("Authorization", `Bearer ${token}`)
        }

        let response: Response
        try {
            response = await fetch(`${this.baseUrl}${path}`, {
                method: options.method ?? "GET",
                headers,
                body: options.body === undefined ? undefined : JSON.stringify(options.body)
            })
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new HarnessApiError(`Cannot reach the backend: ${message}`, 0);
        }

        if (!response.ok) {
            const failure = await parseError(response)
            throw new HarnessApiError(failure.message, response.status, failure.code)
        }
        return (await response.json()) as T
    }
}

async function parseError(response: Response): Promise<{
    message: string, code?: string
}> {
    const fallBackMessage = `Request failed (${response.status})`;

    try {
        const body = (await response.json()) as {
            error?: { message?: string, code?: string } | string,
            error_description?: string;
            code?: string,
            message?: string
        }

        // OAuth type of errors
        if (typeof body.error === "string") {
            return {
                code: body.code ?? body.error,
                message: body.error_description ?? body.message ?? body.error
            }
        }

        // Application backend type of error
        return {
            code: body.error?.code ?? body.code,
            message: body.error?.message ?? body.message ?? fallBackMessage
        }

    } catch (error) {
        return { message: fallBackMessage }
    }
}