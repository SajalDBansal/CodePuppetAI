export class HarnessApiError extends Error {
    constructor(
        message: string,
        public readonly status: number,
        public readonly code?: string,
    ) {
        super(message);
        this.name = "HarnessApiError"
    }
}

export class AuthenticationRequiredError extends Error {
    constructor(
        message = "Authentication is required. Run 'code-puppet login',"
    ) {
        super(message);
        this.name = "AuthenticationRequiredError"
    }
}

export class InitializationRequiredError extends Error {
    constructor(message = "Initialization is required. Run 'codex-agent init'.") {
        super(message)
        this.name = "InitializationRequiredError"
    }
}