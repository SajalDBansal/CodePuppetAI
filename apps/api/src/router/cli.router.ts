import { Router } from "express";
import { CliController } from "../controller/cli.controller.js";
import { auth } from "../utils/auth.js";
import { asyncHandler } from "../utils/async-wrapper.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { fixedWindowRateLimit } from "../middleware/rate-limit.middleware.js";

const cliRouter: Router = Router();

const controller = new CliController(auth);
const startLoginRateLimit = fixedWindowRateLimit(20, 60_000);

cliRouter.post("/login/start", startLoginRateLimit, asyncHandler(controller.startLogin));
cliRouter.post("/login/token", asyncHandler(controller.exchangeToken));
cliRouter.get("/login/verify", requireAuth, asyncHandler(controller.verifyLogin));
cliRouter.post("/login/decision", requireAuth, asyncHandler(controller.decideLogin));
cliRouter.post("/logout", requireAuth, asyncHandler(controller.logout));

export default cliRouter;
