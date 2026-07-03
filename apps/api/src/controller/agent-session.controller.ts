import type { Request, Response } from "express";

export class AgentSessionController {
    listSessions = async (request: Request, response: Response): Promise<Response> => {
        return response.status(200).json({})
    }

    startSession = async (request: Request, response: Response): Promise<Response> => {
        return response.status(200).json({})
    }

    continueSession = async (request: Request, response: Response): Promise<Response> => {
        return response.status(200).json({})
    }

}