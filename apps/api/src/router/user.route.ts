import { Router } from "express";
import { requireAuthentication } from "../middleware/authentication.js";
import { asyncHandler } from "../utils/async-handler.js";
import { UserController } from "../controller/user.controller.js";

const userRouter: Router = Router();
const controller = new UserController();

userRouter.use(requireAuthentication);
userRouter.get("/me", asyncHandler(controller.me));
userRouter.post("/logout", asyncHandler(controller.logout));

export default userRouter;