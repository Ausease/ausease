import express, { type Express, type RequestHandler } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { createRouter } from "./routes";
import { logger } from "./lib/logger";
import { clerkAuthMiddleware } from "./middleware/auth";

export const createApp = (enterpriseAuth?: RequestHandler): Express => {
const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(clerkAuthMiddleware);
app.use(cors());
// Native recordings are sent as base64 JSON. Keep this above the largest
// supported payload while still bounding memory use for malformed requests.
app.use(express.json({ limit: "16mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", createRouter(enterpriseAuth));

return app;
};

export default createApp();
