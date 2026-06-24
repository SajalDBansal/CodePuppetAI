import { Request, Response } from "express";

export class AccountController {

    constructor() { }

    /** Returns the current public user and session details. */
    me = async (request: Request, response: Response) => {
        const user = request.authUser;
        const session = request.session;
        return response.status(200).json({ user, session })
    }

}