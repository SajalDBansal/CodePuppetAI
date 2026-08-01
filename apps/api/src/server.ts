import { json, urlencoded } from "body-parser";
import express, { type Express } from "express";
import morgan from "morgan";
import cors from "cors";
import { errorHandler } from "./middleware/error-handler.js";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./auth/auth.js";
import appRouter from "./router/index.js";
import { environment } from "./utils/environment.js";
import { notFoundHandler } from "./middleware/not-found.js";

export const createServer = (): Express => {
  const app = express();

  app
    .disable("x-powered-by")
    .use(morgan(environment.NODE_ENV === "test" ? "tiny" : "dev"))
    .use(cors({
      origin: environment.WEB_ORIGIN,
      credentials: true,
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    }))
    .all("/api/v1/auth/*", toNodeHandler(auth))
    .use(urlencoded({ extended: true }))
    .use(json({ limit: "5mb" }))
    .use("/api/v1", appRouter)
    .use(notFoundHandler)
    .use(errorHandler);

  return app;
};
