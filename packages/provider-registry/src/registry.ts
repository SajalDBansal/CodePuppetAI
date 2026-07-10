import { ProviderAlreadyRegisteredError, ProviderNotRegisteredError, toProviderError } from "./error.js";
import { ProviderAdapter, ProviderCredentials, ProviderStreamEvent, ProviderStreamRequest } from "@workspace/protocol";

export class ProviderRegistry {
    private readonly adapters = new Map<string, ProviderAdapter>;

    constructor(adapters: ProviderAdapter[] = []) {
        for (const adapter of adapters) {
            this.register(adapter)
        }
    }

    register(adapter: ProviderAdapter) {
        if (this.adapters.has(adapter.id)) {
            throw new ProviderAlreadyRegisteredError(adapter.id);
        }
        this.adapters.set(adapter.id, adapter);
    }

    has(providerId: string) {
        return this.adapters.has(providerId);
    }

    get(providerId: string) {
        const adapter = this.adapters.get(providerId);
        if (!adapter) {
            throw new ProviderNotRegisteredError(providerId);
        }
        return adapter;
    }

    list(): string[] {
        return [...this.adapters.keys()]
    }

    async *stream(
        providerId: string,
        request: ProviderStreamRequest,
        credentials: ProviderCredentials,
        signal?: AbortSignal
    ): AsyncGenerator<ProviderStreamEvent, void, unknown> {
        const adapter = this.get(providerId);

        yield { type: "stream_started", providerId };

        if (signal?.aborted) {
            yield { type: "done", stopReason: "cancelled" }
            return;
        }

        try {
            yield* adapter.stream(request, credentials, signal)
        } catch (error) {
            const providerError = toProviderError(providerId, error);

            if (providerError.code === "request_cancelled") {
                yield { type: "done", stopReason: "cancelled" }
                return
            }

            yield {
                type: "error",
                providerId,
                code: providerError.code,
                message: providerError.message,
                retryable: providerError.retryable,
            }
            yield { type: "done", stopReason: "error" }

        }


    }


}