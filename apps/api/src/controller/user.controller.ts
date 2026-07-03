import type { Request, Response } from "express";
import { auth } from "../auth/auth.js";
import { fromNodeHeaders } from "better-auth/node";

export class UserController {
    me = (request: Request, response: Response): Response => {
        return response.status(200).json({
            user: request.authUser,
            session: request.authSession
        })
    }

    logout = async (request: Request, response: Response): Promise<Response> => {
        await auth.api.signOut({ headers: fromNodeHeaders(request.headers) });
        return response.status(204).send()
    }
}