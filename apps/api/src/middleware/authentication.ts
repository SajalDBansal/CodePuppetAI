import { Request, Response, NextFunction } from "express";
import { auth } from "../auth/auth.js";
import { fromNodeHeaders } from "better-auth/node";
import { AuthenticationError, AuthorizationError } from "../utils/api-error.js";

export async function requireAuthentication(request: Request, _response: Response, next: NextFunction): Promise<void> {
    try {
        const result = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
        if (!result) {
            throw new AuthenticationError();
        }
        request.authUser = {
            id: result.user.id,
            name: result.user.name,
            email: result.user.email,
            role: result.user.role ?? "user"
        }
        request.authSession = {
            id: result.session.id,
            token: result.session.token,
            expiresAt: result.session.expiresAt,
        }
        next();
    } catch (error) {
        next(error instanceof AuthenticationError ? error : new AuthenticationError());
    }
}

export function requireAdministrator(request: Request, _response: Response, next: NextFunction): void {
    const roles = request.authUser?.role.split(",").map((role) => role.trim()) ?? []
    if (!roles.includes("admin")) {
        next(new AuthorizationError("Administrator access is required."))
        return
    }
    next()
}
