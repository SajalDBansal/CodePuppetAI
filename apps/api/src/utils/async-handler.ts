import type { NextFunction, Request, RequestHandler, Response } from "express"

export function asyncHandler(handler: RequestHandler): RequestHandler {
    return (request: Request, response: Response, next: NextFunction) => {
        Promise.resolve(handler(request, response, next)).catch(next)
    }
}
