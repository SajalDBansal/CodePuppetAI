import type { ProviderId, ProviderStreamRequest, ProviderStreamEvent } from "@workspace/protocol";

export interface ProviderCredentials {
    apiKey: string;
    baseUrl?: string;
}

export interface ProviderAdapter {
    readonly id: ProviderId;
    stream(
        request: ProviderStreamRequest,
        credentials: ProviderCredentials,
        signal?: AbortSignal,
    ): AsyncGenerator<ProviderStreamEvent, void, unknown>;
}
