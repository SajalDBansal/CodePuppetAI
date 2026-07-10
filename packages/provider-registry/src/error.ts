import { ProviderErrorCode } from "@workspace/protocol";

export class ProviderError extends Error {
    constructor(
        public readonly providerId: string,
        public readonly code: ProviderErrorCode,
        public readonly retryable: boolean,
        message: string,
    ) {
        super(message);
        this.name = "providerError"
    }
}

export class ProviderNotRegisteredError extends Error {
    constructor(providerId: string) {
        super(`No provider adapter is registered for "${providerId}".`)
        this.name = "ProviderNotRegisteredError"
    }
}

export class ProviderAlreadyRegisteredError extends Error {
    constructor(providerId: string) {
        super(`A provider adapter is already registered for "${providerId}".`)
        this.name = "ProviderAlreadyRegisteredError"
    }
}

export function toProviderError(providerId: string, error: unknown): ProviderError {
    if (error instanceof ProviderError) {
        return error
    }

    if (isAbortError(error)) {
        return new ProviderError(
            providerId,
            "request_cancelled",
            false,
            "The provider request was cancelled."
        )
    }

    return new ProviderError(
        providerId,
        "unknown",
        false,
        getErrorMessage(error),
    )

    // const status = getProperty<number>(error, "status")
    // const providerCode = getProperty<string>(error, "code")
    // const message = getErrorMessage(error)
    // let code: ProviderErrorCode = "unknown"
    // let retryable = false

    // if (status === 401 || providerCode === "invalid_api_key") {
    //     code = "authentication_failed"
    // } else if (status === 403) {
    //     code = "permission_denied"
    // } else if (status === 429 || providerCode === "rate_limit_exceeded") {
    //     code = "rate_limited"
    //     retryable = true
    // } else if (status === 404 || providerCode === "model_not_found") {
    //     code = "model_not_found"
    // } else if (
    //     providerCode === "context_length_exceeded" ||
    //     providerCode === "prompt_too_long"
    // ) {
    //     code = "context_length_exceeded"
    // } else if (status !== undefined && status >= 500) {
    //     code = "provider_unavailable"
    //     retryable = true
    // } else if (status !== undefined && status >= 400) {
    //     code = "invalid_request"
    // }

    // return new ProviderError(
    //     providerId,
    //     code,
    //     retryable,
    //     message,
    // )

}

function isAbortError(error: unknown): boolean {
    return (
        error instanceof Error &&
        (error.name === "AbortError" ||
            error.message.toLowerCase().includes("abort"))
    )
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
        return error.message
    }
    return "The provider request failed unexpectedly."
}

// function getProperty<T>(error: unknown, key: string): T | undefined {
//     if (typeof error !== "object" || error === null) {
//         return undefined
//     }
//     return (error as Record<string, unknown>)[key] as T | undefined
// }