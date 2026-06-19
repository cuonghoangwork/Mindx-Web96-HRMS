import express from "express";
import cors from "cors";
import dotenv from "dotenv";

const env = process.env.NODE_ENV || "dev";
dotenv.config({ path: `.env.${env}` });

import { connectDB } from "./config/db.js";
import rootRouter from "./router/index.js";

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
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
  });
});

const PORT = process.env.PORT || 8080;

connectDB()
  .then(() => {
    app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB", err);
    process.exit(1);
  });
