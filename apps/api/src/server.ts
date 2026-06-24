import { json, urlencoded } from "body-parser";
import express, { type Express } from "express";
import morgan from "morgan";
import cors from "cors";
import { errorHandler } from "./middleware/error.middleware.js";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./utils/auth.js";
import appRouter from "./router/index.js";
import { envConfig } from "./utils/config.js";

export const createServer = (): Express => {
  const app = express();

  app
    .disable("x-powered-by")
    .use(morgan("dev"))
    .use(cors({
      origin: envConfig.WEB_ORIGIN,
      credentials: true,
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    }))
    .all("/api/v1/auth/*", toNodeHandler(auth))
    .use(urlencoded({ extended: true }))
    .use(json())
    .use("/api/v1", appRouter)
    .use(errorHandler);

  return app;
};
