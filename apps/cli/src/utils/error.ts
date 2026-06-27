export class HarnessError extends Error {
    constructor(
        message: string,
        public readonly code = "HARNESS_ERROR",
        public readonly exitCode = 1,
    ) {
        super(message);
        this.name = "HarnessError";
    }
}

export function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
}

export class AuthenticationError extends Error {
    constructor(message = "Login is required. Run 'deepmind login'.") {
        super(message)
        this.name = "AUTHENTICATION_ERROR"
    }
}

export class InitializationError extends Error {
    constructor() {
        super("Configuration is not initialized. Run 'deepmind init'.")
        this.name = "INITIALIZATION_ERROR"
    }
}
