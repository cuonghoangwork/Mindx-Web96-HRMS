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

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json());

app.use("/api/v1", rootRouter);

app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// Final error handler - catches anything thrown/passed via next(err) outside controller try/catch
app.use((err, req, res, next) => {
  console.error(err);
  // Multer errors (oversized file, fileFilter rejection) are a bad request, not a server fault.
  const isMulterError = err instanceof multer.MulterError || /image/i.test(err.message || "");
  const status = err.status || (isMulterError ? 400 : 500);
  res.status(status).json({
    success: false,
    message: err.message || "Internal server error",
  });
});

const PORT = process.env.PORT || 8080;

connectDB()
  .then(() =>
    // A migration failure is a best-effort data fix gone wrong, not a
    // reason to refuse to serve traffic — log it and keep booting.
    runStartupMigrations().catch((err) => {
      console.error("Startup migrations failed (continuing to start server):", err);
    }),
  )
  .then(() => {
    startScheduler();
    app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB", err);
    process.exit(1);
  });
