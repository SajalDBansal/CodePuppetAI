import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { AgentSessionController } from "../controller/agent-session.controller.js";
import { requireAuthentication } from "../middleware/authentication.js";

const agentSessionRouter: Router = Router();
const controller = new AgentSessionController();

agentSessionRouter.use(requireAuthentication);
agentSessionRouter.get("/", asyncHandler(controller.listSessions));
agentSessionRouter.post("/", asyncHandler(controller.startSession));
agentSessionRouter.post("/:sessionId/interactions", asyncHandler(controller.continueSession));

export default agentSessionRouter;