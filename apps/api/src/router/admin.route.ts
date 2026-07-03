import { Router } from "express";
import { requireAdministrator, requireAuthentication } from "../middleware/authentication.js";
import { asyncHandler } from "../utils/async-handler.js";
import { AdminController } from "../controller/admin.controller.js";

const adminRouter: Router = Router();
const controller = new AdminController();

adminRouter.use(requireAuthentication, requireAdministrator);
adminRouter.get("/audit-log", asyncHandler(controller.listAuditLogs));

export default adminRouter;