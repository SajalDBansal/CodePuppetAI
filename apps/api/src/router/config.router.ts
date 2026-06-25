import { Router } from "express";
import { asyncHandler } from "../utils/async-wrapper.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { ConfigController } from "../controller/config.controller.js";

const configRouter: Router = Router();

const controller = new ConfigController();

configRouter.get("/init", requireAuth, asyncHandler(controller.initialize));

export default configRouter;