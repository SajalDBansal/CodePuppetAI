import { Router } from "express";
import { asyncHandler } from "../utils/async-wrapper.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { AccountController } from "../controller/account.controller.js";

const accountRouter: Router = Router();

const controller = new AccountController();

accountRouter.post("/me", requireAuth, asyncHandler(controller.me));

export default accountRouter;