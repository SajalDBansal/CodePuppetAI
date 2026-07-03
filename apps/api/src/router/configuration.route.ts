import { Router } from "express";
import { requireAdministrator, requireAuthentication } from "../middleware/authentication.js";
import { asyncHandler } from "../utils/async-handler.js";
import { ConfigurationController } from "../controller/configuration.controller.js";

const configurationRouter: Router = Router();
const controller = new ConfigurationController();

configurationRouter.use(requireAuthentication);
configurationRouter.get("/bootstrap", asyncHandler(controller.bootstrap));

configurationRouter.use(requireAdministrator);
configurationRouter.get("/list", asyncHandler(controller.list));
configurationRouter.put("/:key", asyncHandler(controller.save));
configurationRouter.delete("/:key", asyncHandler(controller.remove));


export default configurationRouter;