import { Router } from "express";
import { requireAuthentication } from "../middleware/authentication.js";
import { asyncHandler } from "../utils/async-handler.js";
import { DeviceLoginController } from "../controller/device-login.controller.js";
import { fixedWindowRateLimit } from "../middleware/rate-limit.js";

const deviceLoginRouter: Router = Router();
const controller = new DeviceLoginController();
const startLimit = fixedWindowRateLimit(20, 60_000);
const tokenLimit = fixedWindowRateLimit(120, 60_000);

deviceLoginRouter.post("/start", startLimit, asyncHandler(controller.start));
deviceLoginRouter.post("/token", tokenLimit, asyncHandler(controller.exchangeToken));

deviceLoginRouter.use(requireAuthentication);
deviceLoginRouter.get("/verify", asyncHandler(controller.verify));
deviceLoginRouter.post("/decision", asyncHandler(controller.decide));

export default deviceLoginRouter;