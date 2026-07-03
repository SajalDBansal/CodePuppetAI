import { Router } from "express";
import { requireAdministrator, requireAuthentication } from "../middleware/authentication.js";
import { asyncHandler } from "../utils/async-handler.js";
import { CatalogController } from "../controller/catalog.controller.js";

const catalogRouter: Router = Router();
const controller = new CatalogController();

catalogRouter.get("/providers", asyncHandler(controller.listProviders));
catalogRouter.get("/models", asyncHandler(controller.listModels));

catalogRouter.use(requireAuthentication, requireAdministrator);

catalogRouter.post("/providers", asyncHandler(controller.createProvider));
catalogRouter.patch("/providers/:providerId", asyncHandler(controller.updateProvider));
catalogRouter.delete("/providers/:providerId", asyncHandler(controller.deleteProvider));


catalogRouter.post("/models", asyncHandler(controller.createModel));
catalogRouter.patch("/models/:providerId/:modelId", asyncHandler(controller.updateModel));
catalogRouter.delete("/models/:providerId/:modelId", asyncHandler(controller.deleteModel));

export default catalogRouter;