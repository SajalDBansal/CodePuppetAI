import type { ProviderId, ProviderStreamRequest, ProviderStreamEvent } from "@workspace/protocol";
import type { ProviderAdapter, ProviderCredentials } from "./types.js";
import { ProviderNotRegisteredError } from "./errors.js";

export class ProviderRegistry {
    private readonly adapters = new Map<ProviderId, ProviderAdapter>();

    register(adapter: ProviderAdapter): void {
        this.adapters.set(adapter.id, adapter);
    }

    has(providerId: ProviderId): boolean {
        return this.adapters.has(providerId);
    }

    get(providerId: ProviderId): ProviderAdapter {
        const adapter = this.adapters.get(providerId);
        if (!adapter) {
            throw new ProviderNotRegisteredError(providerId);
        }
        return adapter;
    }

    stream(
        providerId: ProviderId,
        request: ProviderStreamRequest,
        credentials: ProviderCredentials,
        signal?: AbortSignal,
    ): AsyncGenerator<ProviderStreamEvent, void, unknown> {
        return this.get(providerId).stream(request, credentials, signal);
    }
}

export const providerRegistry = new ProviderRegistry();
