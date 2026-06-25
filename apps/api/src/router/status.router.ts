import { Router } from "express";
import { asyncHandler } from "../utils/async-wrapper.js";
import { prisma } from "@workspace/database";
const statusRouter: Router = Router()

statusRouter.get("/", asyncHandler(async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`
    await Promise.all([
        prisma.user.count(),
        prisma.session.count(),
        prisma.modelCatalog.count(),
    ])
    return res.json({ ok: true });
}))

export default statusRouter;
