import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";

const env = process.env.NODE_ENV || "dev";
dotenv.config({ path: `.env.${env}` });

import { connectDB } from "./config/db.js";
import rootRouter from "./router/index.js";
import { startScheduler } from "./jobs/index.js";
import { runStartupMigrations } from "./utils/startupMigrations.js";
import { seedRolePermissions } from "./utils/permissions.js";
import { warnIfDemoMode } from "./utils/appNow.js";
import { startTelegram } from "./utils/telegramBoot.js";
import { errorHandler } from "./middleware/errorHandler.js";

// DEMO_MODE lets a header override server time (utils/appNow.js); warn first so a production deploy cannot miss it.
warnIfDemoMode();

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json());

// Unauthenticated health check for the host's poller; mounted outside verifyToken.
app.get("/api/v1/health", (req, res) => {
  res.status(200).json({ success: true, status: "ok" });
});

app.use("/api/v1", rootRouter);

app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found", code: "ROUTE_NOT_FOUND" });
});

app.use(errorHandler);

const PORT = process.env.PORT || 8080;

connectDB()
  .then(() =>
    // A failed migration is not a reason to refuse traffic.
    runStartupMigrations().catch((err) => {
      console.error("Startup migrations failed (continuing to start server):", err);
    }),
  )
  .then(() =>
    // Seeds the capability rows so the permissions matrix is not empty on first load.
    seedRolePermissions().catch((err) => {
      console.error("Seeding role permissions failed (continuing to start server):", err);
    }),
  )
  .then(() => {
    startScheduler();
    // No-op unless TELEGRAM_BOT_TOKEN is set.
    startTelegram();
    app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB", err);
    process.exit(1);
  });
