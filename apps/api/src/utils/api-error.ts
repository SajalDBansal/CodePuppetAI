export class ApiError extends Error {
    constructor(
        public readonly statusCode: number,
        public readonly code: string,
        message: string
    ) {
        super(message)
        this.name = "ApiError"
    }
}

export class AuthenticationError extends ApiError {
    constructor(message = "Authentication is required.") {
        super(401, "AUTHENTICATION_REQUIRED", message)
    }
}

export class AuthorizationError extends ApiError {
    constructor(message = "You do not have permission to perform this action.") {
        super(403, "PERMISSION_DENIED", message)
    }
}

export class NotFoundError extends ApiError {
    constructor(message: string) {
        super(404, "NOT_FOUND", message)
    }
}

export class ConflictError extends ApiError {
    constructor(message: string) {
        super(409, "CONFLICT", message)
    }
}

export class ValidationError extends ApiError {
    constructor(message: string) {
        super(422, "VALIDATION_ERROR", message)
    }
}
