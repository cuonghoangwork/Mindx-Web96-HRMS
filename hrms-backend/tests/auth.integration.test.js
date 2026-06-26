/**
 * auth.integration.test.js — Supertest tests for /api/v1/auth/*
 *
 * Covers: register, login (success + wrong password), /me, logout, refresh-token.
 * Validation rejection cases are also exercised here to confirm the middleware
 * is wired into the router correctly (not just tested in unit tests).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import supertest from "supertest";
import { startDb, stopDb, clearDb, createApp, seedAdminAndLogin } from "./testHelpers.js";

let app;
let request;
let dbAvailable = false;

beforeAll(async () => {
  try {
    await startDb();
    dbAvailable = true;
  } catch (err) {
    console.warn(`[auth.integration] MongoDB unavailable — integration tests will be skipped.\n${err.message}`);
    return;
  }
  app = await createApp();
  request = supertest(app);
});

afterAll(async () => {
  await stopDb();
});

beforeEach(async () => {
  await clearDb();
});

// ══════════════════════════════════════════════════════════
// POST /auth/register
// ══════════════════════════════════════════════════════════
describe("POST /api/v1/auth/register", () => {
  const valid = { name: "Test User", email: "test@hrms.com", password: "password123" };

  it.skipIf(!dbAvailable)("creates a new account and returns 201", async () => {
    const res = await request.post("/api/v1/auth/register").send(valid);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe("test@hrms.com");
    expect(res.body.data.role).toBe("EMPLOYEE"); // default role
    expect(res.body.data).not.toHaveProperty("password");
  });

  it.skipIf(!dbAvailable)("lowercases the email before storing", async () => {
    const res = await request.post("/api/v1/auth/register").send({ ...valid, email: "TEST@HRMS.COM" });
    expect(res.status).toBe(201);
    expect(res.body.data.email).toBe("test@hrms.com");
  });

  it.skipIf(!dbAvailable)("rejects duplicate email with 400", async () => {
    await request.post("/api/v1/auth/register").send(valid);
    const res = await request.post("/api/v1/auth/register").send(valid);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it.skipIf(!dbAvailable)("rejects missing name (validate middleware)", async () => {
    const res = await request.post("/api/v1/auth/register").send({ email: "a@b.com", password: "password123" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Name/i);
  });

  it.skipIf(!dbAvailable)("rejects invalid email (validate middleware)", async () => {
    const res = await request.post("/api/v1/auth/register").send({ ...valid, email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Email/i);
  });

  it.skipIf(!dbAvailable)("rejects short password (validate middleware)", async () => {
    const res = await request.post("/api/v1/auth/register").send({ ...valid, password: "short" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Password/i);
  });

  it.skipIf(!dbAvailable)("does not allow self-assigning ADMIN role", async () => {
    const res = await request.post("/api/v1/auth/register").send({ ...valid, role: "ADMIN" });
    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe("EMPLOYEE"); // ADMIN silently downgraded
  });

  it.skipIf(!dbAvailable)("allows MANAGER role for HR self-registration", async () => {
    const res = await request.post("/api/v1/auth/register").send({ ...valid, role: "MANAGER" });
    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe("MANAGER");
  });
});

// ══════════════════════════════════════════════════════════
// POST /auth/login
// ══════════════════════════════════════════════════════════
describe("POST /api/v1/auth/login", () => {
  beforeEach(async () => {
    await seedAdminAndLogin(app); // seeds admin but we discard the token
    await clearDb();
    // Re-seed just the user (seedAdminAndLogin calls login internally)
    const bcrypt = (await import("bcryptjs")).default;
    const { default: UserModel } = await import("../model/User.js");
    const hash = bcrypt.hashSync("admin123", 10);
    await UserModel.create({ email: "admin@hrms.com", password: hash, name: "Admin", role: "ADMIN" });
  });

  it.skipIf(!dbAvailable)("returns access_token and refresh_token on success", async () => {
    const res = await request.post("/api/v1/auth/login").send({ email: "admin@hrms.com", password: "admin123" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.access_token).toBeTruthy();
    expect(res.body.data.refresh_token).toBeTruthy();
    expect(res.body.data.user.email).toBe("admin@hrms.com");
    expect(res.body.data.user.role).toBe("ADMIN");
    expect(res.body.data.user).not.toHaveProperty("password");
  });

  it.skipIf(!dbAvailable)("rejects wrong password with 400", async () => {
    const res = await request.post("/api/v1/auth/login").send({ email: "admin@hrms.com", password: "wrongpass" });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it.skipIf(!dbAvailable)("rejects unknown email with 400", async () => {
    const res = await request.post("/api/v1/auth/login").send({ email: "ghost@hrms.com", password: "admin123" });
    expect(res.status).toBe(400);
  });

  it.skipIf(!dbAvailable)("rejects missing password (validate middleware)", async () => {
    const res = await request.post("/api/v1/auth/login").send({ email: "admin@hrms.com" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Password/i);
  });

  it.skipIf(!dbAvailable)("rejects bad email format (validate middleware)", async () => {
    const res = await request.post("/api/v1/auth/login").send({ email: "notanemail", password: "admin123" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Email/i);
  });
});

// ══════════════════════════════════════════════════════════
// GET /auth/me
// ══════════════════════════════════════════════════════════
describe("GET /api/v1/auth/me", () => {
  it.skipIf(!dbAvailable)("returns the current user when authenticated", async () => {
    const { token } = await seedAdminAndLogin(app);
    const res = await request.get("/api/v1/auth/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe("admin@hrms.com");
    expect(res.body.data.role).toBe("ADMIN");
    expect(res.body.data.id).toBeTruthy();
    expect(res.body.data).not.toHaveProperty("password");
    expect(res.body.data).not.toHaveProperty("refreshToken");
  });

  it.skipIf(!dbAvailable)("returns 401 without a token", async () => {
    const res = await request.get("/api/v1/auth/me");
    expect(res.status).toBe(401);
  });

  it.skipIf(!dbAvailable)("returns 401 with a malformed token", async () => {
    const res = await request.get("/api/v1/auth/me").set("Authorization", "Bearer not.a.token");
    expect(res.status).toBe(401);
  });
});

// ══════════════════════════════════════════════════════════
// POST /auth/logout
// ══════════════════════════════════════════════════════════
describe("POST /api/v1/auth/logout", () => {
  it.skipIf(!dbAvailable)("returns 200 and clears refresh token", async () => {
    const { token } = await seedAdminAndLogin(app);
    const res = await request.post("/api/v1/auth/logout").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it.skipIf(!dbAvailable)("returns 401 without a token", async () => {
    const res = await request.post("/api/v1/auth/logout");
    expect(res.status).toBe(401);
  });
});

// ══════════════════════════════════════════════════════════
// POST /auth/refresh-token
// ══════════════════════════════════════════════════════════
describe("POST /api/v1/auth/refresh-token", () => {
  it.skipIf(!dbAvailable)("issues a new token pair given a valid refresh token", async () => {
    // Login to get the refresh token
    const bcrypt = (await import("bcryptjs")).default;
    const { default: UserModel } = await import("../model/User.js");
    const hash = bcrypt.hashSync("admin123", 10);
    await UserModel.create({ email: "admin@hrms.com", password: hash, name: "Admin", role: "ADMIN" });

    const loginRes = await request.post("/api/v1/auth/login").send({ email: "admin@hrms.com", password: "admin123" });
    const refreshToken = loginRes.body.data.refresh_token;

    const res = await request.post("/api/v1/auth/refresh-token").send({ refresh_token: refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.data.access_token).toBeTruthy();
    expect(res.body.data.refresh_token).toBeTruthy();
  });

  it.skipIf(!dbAvailable)("rejects a missing refresh token with 401", async () => {
    const res = await request.post("/api/v1/auth/refresh-token").send({});
    expect(res.status).toBe(401);
  });

  it.skipIf(!dbAvailable)("rejects a garbage refresh token with 401", async () => {
    const res = await request.post("/api/v1/auth/refresh-token").send({ refresh_token: "garbage.token.here" });
    expect(res.status).toBe(401);
  });
});
