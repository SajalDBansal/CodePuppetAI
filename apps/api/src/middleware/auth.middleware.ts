import { Request, Response, NextFunction } from "express";
import { auth } from "../utils/auth.js";
import { fromNodeHeaders } from "better-auth/node";
import { AuthorizationError } from "../utils/error.js";

export async function requireAuth(request: Request, _response: Response, next: NextFunction): Promise<void> {
    try {
        const result = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
        if (!result) {
            throw new AuthorizationError("User session is unauthorized");
        }
        request.authUser = {
            id: result.user.id,
            name: result.user.name,
            email: result.user.email,
            role: result.user.role ?? "user"
        }
        request.session = {
            id: result.session.id,
            accessToken: result.session.token
        }
        next();
    } catch {
        next(new AuthorizationError("User session is unauthorized"));
    }
}

export async function requireAdminAuth(request: Request, _response: Response, next: NextFunction): Promise<void> {
    try {
        const result = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
        if (!result) {
            throw new AuthorizationError("User session is unauthorized");
        }
        if (result.user.role !== "admin") {
            throw new AuthorizationError("Admin access is required");
        }
        request.authUser = {
            id: result.user.id,
            name: result.user.name,
            email: result.user.email,
            role: result.user.role ?? "user"
        }
        request.session = {
            id: result.session.id,
            accessToken: result.session.token
        }
        next();
    } catch (error) {
        next(error instanceof AuthorizationError
            ? error
            : new AuthorizationError("User session is unauthorized"));
    }
}
