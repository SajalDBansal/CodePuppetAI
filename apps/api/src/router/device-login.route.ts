import { Router } from "express";
import { requireAuthentication } from "../middleware/authentication.js";
import { asyncHandler } from "../utils/async-handler.js";
import { DeviceLoginController } from "../controller/device-login.controller.js";

const deviceLoginRouter: Router = Router();
const controller = new DeviceLoginController();

deviceLoginRouter.post("/start", asyncHandler(controller.start));
deviceLoginRouter.post("/token", asyncHandler(controller.exchangeToken));

deviceLoginRouter.use(requireAuthentication);
deviceLoginRouter.get("/verify", asyncHandler(controller.verify));
deviceLoginRouter.post("/decision", asyncHandler(controller.decide));

export default deviceLoginRouter;