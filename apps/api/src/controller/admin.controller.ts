import type { Request, Response } from "express";
import { validate } from "../utils/validate.js";
import z from "zod";
import { prisma } from "@workspace/database";

const AuditLogQuerySchema = z.object({
    cursor: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
})

export class AdminController {
    listAuditLogs = async (request: Request, response: Response): Promise<Response> => {
        const query = validate(AuditLogQuerySchema, request.query);
        const logs = await prisma.auditLog.findMany({
            take: query.limit,
            ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
            orderBy: { createdAt: "desc" },
        });

        return response.status(200).json({
            logs,
            nextCursor: logs.length === query.limit ? (logs.at(-1)?.id ?? null) : null,
        })
    }

}