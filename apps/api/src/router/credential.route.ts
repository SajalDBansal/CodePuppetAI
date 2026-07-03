import { Router } from "express";
import { requireAuthentication } from "../middleware/authentication.js";
import { asyncHandler } from "../utils/async-handler.js";
import { CredentialController } from "../controller/credential.controller.js";

const credentialRouter: Router = Router();
const controller = new CredentialController();

credentialRouter.use(requireAuthentication);

credentialRouter.get("/", asyncHandler(controller.list));
credentialRouter.post("/", asyncHandler(controller.save));
credentialRouter.delete("/", asyncHandler(controller.removeAll));
credentialRouter.delete("/:credentialId", asyncHandler(controller.remove));

export default credentialRouter;