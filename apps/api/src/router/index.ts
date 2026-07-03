import { Router } from "express";
import healthRouter from "./health.route.js";
import agentSessionRouter from "./agent-session.route.js";
import userRouter from "./user.route.js";
import deviceLoginRouter from "./device-login.route.js";
import credentialRouter from "./credential.route.js";
import configurationRouter from "./configuration.route.js";
import catalogRouter from "./catalog.route.js";
import adminRouter from "./admin.route.js";

const appRouter: Router = Router();

appRouter.use("/health", healthRouter);
appRouter.use("/user", userRouter);
appRouter.use("/agent-session", agentSessionRouter);
appRouter.use("/device-login", deviceLoginRouter);
appRouter.use("/credentials", credentialRouter);
appRouter.use("/configuration", configurationRouter);
appRouter.use("/catalog", catalogRouter);
appRouter.use("/admin", adminRouter);

export default appRouter;