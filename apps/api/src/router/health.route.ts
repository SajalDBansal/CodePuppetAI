import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { HealthController } from "../controller/health.controller.js";

const healthRouter: Router = Router();
const controller = new HealthController();

healthRouter.get("/live", controller.live);
healthRouter.get("/ready", asyncHandler(controller.ready));

export default healthRouter;