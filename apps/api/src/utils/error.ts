export class ApiError extends Error {
    statusCode: number;
    type: string;

    constructor(statusCode: number, type: string, message: string) {
        super(message);
        this.statusCode = statusCode;
        this.type = type;

        Object.setPrototypeOf(this, ApiError.prototype);
        Error.captureStackTrace(this, this.constructor);
    }
}

export class AuthenticationError extends ApiError {
    constructor(message: string) {
        super(401, "AuthenticationError", message);
    }
}

export class DeviceAuthError extends ApiError {
    constructor(message: string) {
        super(401, "deviceExpiredError", message);
    }
}

export class AuthorizationError extends ApiError {
    constructor(message: string) {
        super(403, "AuthorizationError", message);
    }
}

export class ValidationError extends ApiError {
    constructor(message: string) {
        super(422, "ValidationError", message);
    }
}