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

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json());

app.use("/api/v1", rootRouter);

app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found", code: "ROUTE_NOT_FOUND" });
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
    code: err.code || (isMulterError ? "FILE_UPLOAD_ERROR" : "INTERNAL_ERROR"),
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
  .then(() =>
    // Solo Gaps Milestone 3 — ensure the 4 toggleable capability rows
    // exist (enabled: true) so the permissions matrix has something to
    // show on first load. Same "don't block boot" reasoning as above.
    seedRolePermissions().catch((err) => {
      console.error("Seeding role permissions failed (continuing to start server):", err);
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
