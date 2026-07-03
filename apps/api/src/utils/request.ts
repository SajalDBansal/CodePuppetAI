import { Request } from "express";
import { AuthenticationError } from "./api-error.js";

export function requireUserId(request: Request) {
    if (!request.authUser) {
        throw new AuthenticationError();
    }
    return request.authUser.id;
}

export function getRequestIp(request: Request): string | undefined {
    return request.ip || request.socket.remoteAddress;
}