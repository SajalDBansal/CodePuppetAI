import { prisma, type Prisma } from "@workspace/database";
import { getRequestIp } from "../utils/request.js";
import { Request } from "express";

export async function recordAuditEvent(
    request: Request,
    action: string,
    targetType: string,
    targetId?: string,
    metadata?: Prisma.InputJsonValue
): Promise<void> {
    await prisma.auditLog.create({
        data: {
            actorUserId: request.authUser?.id,
            action,
            targetType,
            targetId,
            metadata,
            ipAddress: getRequestIp(request),
            userAgent: request.get("user-agent"),
        }
    })
}