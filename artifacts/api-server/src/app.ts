import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { rateLimit } from "./middlewares/rate-limit";

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

// CORS: if ALLOWED_ORIGINS is set (comma-separated), only those origins may
// call the API from a browser. Unset = allow all (local dev convenience).
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  cors(
    allowedOrigins.length
      ? { origin: allowedOrigins, methods: ["GET", "POST"] }
      : {},
  ),
);

// Rate limits: general traffic + a stricter bucket for Google-billed routes.
app.use("/api/places", rateLimit({ windowMs: 60_000, max: 30 }));
app.use("/api", rateLimit({ windowMs: 60_000, max: 120 }));

app.use(express.json({ limit: "50kb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
