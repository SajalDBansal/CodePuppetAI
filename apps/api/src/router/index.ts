import { Router } from "express";
import cliRouter from "./cli.router.js";
import accountRouter from "./account.router.js";
import configRouter from "./config.router.js";
import providerRouter from "./provider.router.js";
import statusRouter from "./status.router.js";
import credentialRouter from "./credential.router.js";

const appRouter: Router = Router();

appRouter.use("/", accountRouter);
appRouter.use("/status", statusRouter);
appRouter.use("/cli", cliRouter);
appRouter.use("/config", configRouter);
appRouter.use("/provider", providerRouter);
appRouter.use("/credential", credentialRouter);

export default appRouter;