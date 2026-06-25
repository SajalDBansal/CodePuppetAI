import { Router } from "express";
import { asyncHandler } from "../utils/async-wrapper.js";
import { requireAdminAuth } from "../middleware/auth.middleware.js";
import { providerController } from "../controller/provider.controller.js";

const providerRouter: Router = Router();

const controller = new providerController();

providerRouter.get("/init", asyncHandler(controller.getDefaultModel));

providerRouter.get("/", asyncHandler(controller.getProvidersList));
providerRouter.post("/", requireAdminAuth, asyncHandler(controller.setProvider));
providerRouter.get("/model-catalog", asyncHandler(controller.getModelList));
providerRouter.post("/model", requireAdminAuth, asyncHandler(controller.setModel));

export default providerRouter;