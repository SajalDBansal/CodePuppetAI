import { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/api-error.js";
import { isAPIError } from "better-auth/api";

export const errorHandler = (
    err: Error,
    request: Request,
    response: Response,
    _next: NextFunction
): void => {
    const knownError = err instanceof ApiError;
    const authError = isAPIError(err);
    const databaseErrorCode = getDatabaseErrorCode(err);
    const statusCode = knownError ? err.statusCode :
        authError ? err.statusCode :
            databaseErrorCode === "P2025" ? 404 :
                databaseErrorCode === "P2002" || databaseErrorCode === "P2003" ? 409 : 500;

    const code = knownError ? err.code :
        authError ? (err.body?.code ?? err.body?.error ?? "AUTH_ERROR") :
            databaseErrorCode === "P2025" ? "NOT_FOUND" :
                databaseErrorCode === "P2002" ? "DUPLICATE_RECORD" :
                    databaseErrorCode === "P2003" ? "RECORD_IN_USE"
                        : "INTERNAL_SERVER_ERROR";

    const message =
        statusCode >= 500 && process.env.NODE_ENV === "production"
            ? "An unexpected server error occurred."
            : authError ? (err.body?.message ?? err.body?.error_description ?? err.message)
                : err.message

    console.error({
        code,
        message,
        method: request.method,
        path: request.originalUrl,
        stack: err.stack,
    })

    response.status(statusCode).json({
        success: false,
        error: { code, message },
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        path: request.originalUrl,
    });
};

function getDatabaseErrorCode(error: Error): string | undefined {
    if ("code" in error && typeof error.code === "string") {
        return error.code
    }
    return undefined
}