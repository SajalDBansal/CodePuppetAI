import { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/error.js";
import { isAPIError } from "better-auth/api";

export const errorHandler = async (
    err: Error,
    req: Request,
    res: Response,
    _next: NextFunction
): Promise<void> => {
    const isApiError = err instanceof ApiError;
    const isBetterAuthError = isAPIError(err);
    const isCorsError = err.message?.startsWith("CORS blocked");

    const betterAuthBody = isBetterAuthError ? err.body as Record<string, unknown> | undefined : undefined;

    const betterAuthType = typeof betterAuthBody?.error === "string" ? betterAuthBody.error
        : typeof betterAuthBody?.code === "string" ? betterAuthBody.code : "BetterAuthError";

    const betterAuthMessage = typeof betterAuthBody?.error_description === "string"
        ? betterAuthBody.error_description
        : typeof betterAuthBody?.message === "string" ? betterAuthBody.message : err.message;

    const statusCode = isApiError ? err.statusCode : isBetterAuthError ? err.statusCode : isCorsError ? 403 : 500;

    const type = isApiError
        ? err.type
        : isBetterAuthError
            ? betterAuthType
            : isCorsError ? "CorsError" : "InternalServerError";
    const message = isApiError
        ? err.message
        : isBetterAuthError
            ? betterAuthMessage
            : process.env.NODE_ENV === "production"
                ? "Internal Server Error"
                : err.message;

    console.error({
        type,
        message,
        method: req.method,
        path: req.originalUrl,
        stack: err.stack,
    });


    res.status(statusCode).json({
        success: false,
        error: {
            type,
            message,
            statusCode,
        },
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        path: req.originalUrl,
    });
};
