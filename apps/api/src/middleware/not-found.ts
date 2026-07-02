import { Request, Response } from "express"

export function notFoundHandler(request: Request, response: Response): void {
    response.status(404).json({
        success: false,
        error: {
            code: "ROUTE_NOT_FOUND",
            message: `No route matches ${request.method} ${request.originalUrl}`
        }
    })
}