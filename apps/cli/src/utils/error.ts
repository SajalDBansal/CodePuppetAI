export class CliUsageError extends Error {
    constructor(message: string) {
        super(message)
        this.name = "CliUsageError"
    }
}

export class WorkspaceAccessRequiredError extends Error {
    constructor(workspaceRoot: string) {
        super(
            `Current directory "${workspaceRoot}" is not registered for agent access.`
        )
        this.name = "WorkspaceAccessRequiredError"
    }
}

export function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
}
