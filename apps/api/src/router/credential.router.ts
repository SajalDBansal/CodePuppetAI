import { Router } from "express";
import { asyncHandler } from "../utils/async-wrapper.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { CredentialController } from "../controller/credential.controller.js";

const credentialRouter: Router = Router();

const controller = new CredentialController();

credentialRouter.get("/", requireAuth, asyncHandler(controller.getAllCrdentialsMetadata));
credentialRouter.delete("/", requireAuth, asyncHandler(controller.deleteAllCrdential));

credentialRouter.post("/", requireAuth, asyncHandler(controller.addCrdential));
credentialRouter.delete("/:id", requireAuth, asyncHandler(controller.deleteCrdentialById));

export default credentialRouter;