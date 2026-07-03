import type { Request, Response } from "express";
import { prisma } from "@workspace/database";

export class HealthController {
    live = async (request: Request, response: Response): Promise<Response> => {
        return response.status(200).json({
            status: "OK",
            uptime: process.uptime(),
            timestamp: new Date().toISOString()
        })
    }

    ready = async (request: Request, response: Response): Promise<Response> => {
        try {
            await prisma.$queryRaw`SELECT 1`
            return response
                .status(200)
                .json({ status: "ready", database: "available" })
        } catch {
            return response.status(503).json({
                status: "not_ready",
                database: "unavailable"
            })
        }
    }

}