/**
 * testHelpers.js — shared setup for Supertest integration tests.
 *
 * Spins up an in-memory MongoDB instance so tests never touch a real DB.
 * Exports:
 *   createApp()    — Express app wired to the in-memory DB
 *   getAuthToken() — logs in as the seeded admin and returns a Bearer token
 */

import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

// Load test env stubs before anything reads process.env
process.env.AT_SECRETKEY  = process.env.AT_SECRETKEY  || "test-at-secret-key-for-tests-only";
process.env.RT_SECRETKEY  = process.env.RT_SECRETKEY  || "test-rt-secret-key-for-tests-only";
process.env.AT_EXPIRES_IN = "20m";
process.env.RT_EXPIRES_IN = "4w";
process.env.CORS_ORIGIN   = "*";
// Cloudinary — not needed in tests, but the import mustn't crash
process.env.CLOUD_NAME = "test";
process.env.API_KEY    = "test";
process.env.API_SECRET = "test";

let mongod;

/**
 * Start in-memory MongoDB and connect Mongoose. Call once before all tests.
 * Throws with a clear message when the binary can't be downloaded (e.g. no
 * internet access in CI); callers should catch and call vi.skip() to skip the
 * whole suite rather than fail every test.
 */
export async function startDb() {
  try {
    mongod = await MongoMemoryServer.create();
  } catch (err) {
    throw new Error(
      `mongodb-memory-server could not start — binary download likely failed.\n` +
      `Run tests with network access on first use so the binary can be cached.\n` +
      `Original error: ${err.message}`,
    );
  }
  const uri = mongod.getUri();
  await mongoose.connect(uri);
}

/** Drop all collections and stop the in-memory server. Call once after all tests. */
export async function stopDb() {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  } catch {
    // ignore cleanup errors
  }
  await mongod?.stop().catch(() => {});
}

/** Clear every collection between tests to keep them independent. */
export async function clearDb() {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
}

/** Build and return an Express app using the same router tree as production. */
export async function createApp() {
  const { default: rootRouter } = await import("../router/index.js");
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use("/api/v1", rootRouter);
  // minimal error handler
  app.use((err, req, res, next) => {
    res.status(err.status || 500).json({ success: false, message: err.message });
  });
  return app;
}

/** Seed an admin user and return { app, token, userId }. */
export async function seedAdminAndLogin(app) {
  const { default: UserModel } = await import("../model/User.js");
  const supertest = (await import("supertest")).default;

  const hash = bcrypt.hashSync("admin123", 10);
  await UserModel.create({
    email: "admin@hrms.com",
    password: hash,
    name: "Admin User",
    role: "ADMIN",
  });

  const res = await supertest(app)
    .post("/api/v1/auth/login")
    .send({ email: "admin@hrms.com", password: "admin123" });

  return {
    token:  res.body.data?.access_token,
    userId: res.body.data?.user?.id,
  };
}

export async function seedUserAndLogin(app, { email, password = "testpass1", name, role, employee = null }) {
  const { default: UserModel } = await import("../model/User.js");
  const supertest = (await import("supertest")).default;

  const user = await UserModel.create({
    email,
    password: bcrypt.hashSync(password, 10),
    name: name ?? email,
    role,
    employee,
  });

  const res = await supertest(app).post("/api/v1/auth/login").send({ email, password });

  return {
    user,
    token:  res.body.data?.access_token,
    userId: res.body.data?.user?.id,
  };
}
