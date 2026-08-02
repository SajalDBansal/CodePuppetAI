import { HarnessApiError } from "./error.js";
import { BootstrapConfiguration, CatalogModelSchema, CatalogProviderSchema, ContinueSessionInput, CredentialMetadata, CredentialMetadataSchema, DeviceLoginStart, HarnessUser, HarnessUserSchema, ProviderStreamEvent, SessionDetail, SessionSummary, SessionSummarySchema, StartSessionInput, StreamHandle } from "./types.js";

export interface ApiClientOptions {
    baseUrl: string
    getAccessToken?: () => Promise<string | null>
}

export class APIClient {
    private readonly baseUrl: string;
    private readonly getAccessToken?: () => Promise<string | null>

    constructor(options: ApiClientOptions) {
        this.baseUrl = options.baseUrl.replace(/\/$/, "");
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
        const search = providerId ? `?providerId=${providerId}` : "";
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
        const response = await this.request<{ deletedCount: number }>(`/credentials`, { method: "DELETE" });
        return response.deletedCount;
    }

    async listSessions(): Promise<SessionSummary[]> {
        const response = await this.request<unknown[]>("/agent-session");
        return response.map((session) => SessionSummarySchema.parse(session));
    }

    async getSession(sessionId: string): Promise<SessionDetail> {
        return this.request<SessionDetail>(`/agent-session/${sessionId}`);
    }

    async startSession(input: StartSessionInput, signal?: AbortSignal): Promise<StreamHandle> {
        const response = await this.streamRequest("/agent-session", { body: input, signal });
        return { sessionId: response.headers.get("x-session-id"), events: parseEventStream(response) };
    }

    async continueSession(sessionId: string, input: ContinueSessionInput, signal?: AbortSignal): Promise<StreamHandle> {
        const response = await this.streamRequest(`/agent-session/${sessionId}/interactions`, { body: input, signal });
        return { sessionId: response.headers.get("x-session-id") ?? sessionId, events: parseEventStream(response) };
    }

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

    private async streamRequest(path: string, options: { body?: unknown, signal?: AbortSignal } = {}): Promise<Response> {
        const headers = new Headers({ Accept: "text/event-stream", "Content-Type": "application/json" })
        const token = await this.getAccessToken?.()
        if (token) headers.set("Authorization", `Bearer ${token}`)

        let response: Response
        try {
            response = await fetch(`${this.baseUrl}${path}`, {
                method: "POST",
                headers,
                body: JSON.stringify(options.body ?? {}),
                signal: options.signal,
            })
        } catch (error) {
            if (error instanceof Error && error.name === "AbortError") throw error;
            const message = error instanceof Error ? error.message : String(error);
            throw new HarnessApiError(`Cannot reach the backend: ${message}`, 0);
        }

        if (!response.ok) {
            const failure = await parseError(response)
            throw new HarnessApiError(failure.message, response.status, failure.code)
        }
        return response
    }
}

async function* parseEventStream(response: Response): AsyncGenerator<ProviderStreamEvent> {
    if (!response.body) {
        throw new HarnessApiError("The backend did not return a streamable response body.", response.status);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            let separatorIndex: number;
            while ((separatorIndex = buffer.indexOf("\n\n")) !== -1) {
                const frame = buffer.slice(0, separatorIndex);
                buffer = buffer.slice(separatorIndex + 2);

                const payload = frame
                    .split("\n")
                    .filter((line) => line.startsWith("data:"))
                    .map((line) => line.slice(5).trimStart())
                    .join("\n");

                if (!payload) continue;

                try {
                    yield JSON.parse(payload) as ProviderStreamEvent;
                } catch {
                    // malformed frame - skip it rather than aborting the whole stream
                }
            }
        }
    } finally {
        reader.releaseLock();
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