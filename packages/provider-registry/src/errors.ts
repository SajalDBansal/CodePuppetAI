import type { ProviderId } from "@workspace/protocol";

export type ProviderErrorCode =
    | "auth_error"
    | "rate_limited"
    | "invalid_request"
    | "context_length_exceeded"
    | "unknown";

/** What an adapter throws to normalize a vendor SDK error before it crosses out of the adapter. */
export class ProviderError extends Error {
    readonly providerId: ProviderId;
    readonly code: ProviderErrorCode;
    readonly retryable: boolean;

    constructor(
        message: string,
        options: { providerId: ProviderId; code: ProviderErrorCode; retryable?: boolean; cause?: unknown },
    ) {
        super(message, { cause: options.cause });
        this.name = "ProviderError";
        this.providerId = options.providerId;
        this.code = options.code;
        this.retryable = options.retryable ?? false;
    }
}

export class ProviderNotRegisteredError extends Error {
    constructor(providerId: string) {
        super(`No provider adapter registered for "${providerId}"`);
        this.name = "ProviderNotRegisteredError";
    }
}
