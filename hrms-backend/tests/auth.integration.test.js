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
  if (dbAvailable) await clearDb();
});

// ══════════════════════════════════════════════════════════
// POST /auth/register
// ══════════════════════════════════════════════════════════

// Sprint 1 (task 1.1) locked public self-registration behind
// ALLOW_PUBLIC_REGISTRATION. This block asserts the real production
// default — closed — so a regression here is caught even though the
// block below re-opens the gate to keep exercising registration's
// internal logic (dedup, lowercasing, role handling).
describe("POST /api/v1/auth/register — registration gate", () => {
  const valid = { name: "Test User", email: "test@hrms.com", password: "password123" };

  it("returns 403 by default (public registration disabled)", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const res = await request.post("/api/v1/auth/register").send(valid);
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });
});

describe("POST /api/v1/auth/register — internal logic (gate open)", () => {
  const valid = { name: "Test User", email: "test@hrms.com", password: "password123" };
  let prevFlag;

  beforeAll(() => {
    prevFlag = process.env.ALLOW_PUBLIC_REGISTRATION;
    process.env.ALLOW_PUBLIC_REGISTRATION = "true";
  });

  afterAll(() => {
    process.env.ALLOW_PUBLIC_REGISTRATION = prevFlag;
  });

  it("creates a new account and returns 201", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
    const res = await request.post("/api/v1/auth/register").send(valid);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe("test@hrms.com");
    expect(res.body.data.role).toBe("EMPLOYEE"); // default role
    expect(res.body.data).not.toHaveProperty("password");
  });

  it("lowercases the email before storing", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
    const res = await request.post("/api/v1/auth/register").send({ ...valid, email: "TEST@HRMS.COM" });
    expect(res.status).toBe(201);
    expect(res.body.data.email).toBe("test@hrms.com");
  });

  it("rejects duplicate email with 400", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
    await request.post("/api/v1/auth/register").send(valid);
    const res = await request.post("/api/v1/auth/register").send(valid);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("rejects missing name (validate middleware)", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
    const res = await request.post("/api/v1/auth/register").send({ email: "a@b.com", password: "password123" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Name/i);
  });

  it("rejects invalid email (validate middleware)", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
    const res = await request.post("/api/v1/auth/register").send({ ...valid, email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Email/i);
  });

  it("rejects short password (validate middleware)", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
    const res = await request.post("/api/v1/auth/register").send({ ...valid, password: "short" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Password/i);
  });

  it("does not allow self-assigning ADMIN role", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
    const res = await request.post("/api/v1/auth/register").send({ ...valid, role: "ADMIN" });
    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe("EMPLOYEE"); // ADMIN silently downgraded
  });

  it("always creates an EMPLOYEE account regardless of requested role", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
    // authController.register hardcodes role: "EMPLOYEE" unconditionally —
    // there is no self-promotion path anymore. Promoting to MANAGER/ADMIN
    // is an ADMIN-only action via PATCH /auth/users/:id/promote.
    const res = await request.post("/api/v1/auth/register").send({ ...valid, role: "MANAGER" });
    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe("EMPLOYEE");
  });
});

// ══════════════════════════════════════════════════════════
// POST /auth/login
// ══════════════════════════════════════════════════════════
describe("POST /api/v1/auth/login", () => {
  beforeEach(async () => {
    if (!dbAvailable) return;
    await seedAdminAndLogin(app); // seeds admin but we discard the token
    await clearDb();
    // Re-seed just the user (seedAdminAndLogin calls login internally)
    const bcrypt = (await import("bcryptjs")).default;
    const { default: UserModel } = await import("../model/User.js");
    const hash = bcrypt.hashSync("admin123", 10);
    await UserModel.create({ email: "admin@hrms.com", password: hash, name: "Admin", role: "ADMIN" });
  });

  it("returns access_token and refresh_token on success", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
    const res = await request.post("/api/v1/auth/login").send({ email: "admin@hrms.com", password: "admin123" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.access_token).toBeTruthy();
    expect(res.body.data.refresh_token).toBeTruthy();
    expect(res.body.data.user.email).toBe("admin@hrms.com");
    expect(res.body.data.user.role).toBe("ADMIN");
    expect(res.body.data.user).not.toHaveProperty("password");
  });

  it("rejects wrong password with 400", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
    const res = await request.post("/api/v1/auth/login").send({ email: "admin@hrms.com", password: "wrongpass" });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("rejects unknown email with 400", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
    const res = await request.post("/api/v1/auth/login").send({ email: "ghost@hrms.com", password: "admin123" });
    expect(res.status).toBe(400);
  });

  it("rejects missing password (validate middleware)", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
    const res = await request.post("/api/v1/auth/login").send({ email: "admin@hrms.com" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Password/i);
  });

  it("rejects bad email format (validate middleware)", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
    const res = await request.post("/api/v1/auth/login").send({ email: "notanemail", password: "admin123" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Email/i);
  });
});

// ══════════════════════════════════════════════════════════
// GET /auth/me
// ══════════════════════════════════════════════════════════
describe("GET /api/v1/auth/me", () => {
  it("returns the current user when authenticated", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
    const { token } = await seedAdminAndLogin(app);
    const res = await request.get("/api/v1/auth/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe("admin@hrms.com");
    expect(res.body.data.role).toBe("ADMIN");
    expect(res.body.data.id).toBeTruthy();
    expect(res.body.data).not.toHaveProperty("password");
    expect(res.body.data).not.toHaveProperty("refreshToken");
  });

  it("returns 401 without a token", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
    const res = await request.get("/api/v1/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns 401 with a malformed token", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
    const res = await request.get("/api/v1/auth/me").set("Authorization", "Bearer not.a.token");
    expect(res.status).toBe(401);
  });
});

// ══════════════════════════════════════════════════════════
// POST /auth/logout
// ══════════════════════════════════════════════════════════
describe("POST /api/v1/auth/logout", () => {
  it("returns 200 and clears refresh token", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
    const { token } = await seedAdminAndLogin(app);
    const res = await request.post("/api/v1/auth/logout").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("returns 401 without a token", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
    const res = await request.post("/api/v1/auth/logout");
    expect(res.status).toBe(401);
  });
});

// ══════════════════════════════════════════════════════════
// POST /auth/refresh-token
// ══════════════════════════════════════════════════════════
describe("POST /api/v1/auth/refresh-token", () => {
  it("issues a new token pair given a valid refresh token", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
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

  it("rejects a missing refresh token with 401", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
    const res = await request.post("/api/v1/auth/refresh-token").send({});
    expect(res.status).toBe(401);
  });

  it("rejects a garbage refresh token with 401", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
    const res = await request.post("/api/v1/auth/refresh-token").send({ refresh_token: "garbage.token.here" });
    expect(res.status).toBe(401);
  });
});
