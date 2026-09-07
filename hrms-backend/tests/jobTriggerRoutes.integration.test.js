/**
 * jobTriggerRoutes.integration.test.js
 *
 * HTTP coverage for the ADMIN-only manual triggers of the scheduled jobs.
 *
 * These routes exist because the deployed backend runs with
 * ENABLE_SCHEDULER=false (render.yaml — Render's free plan sleeps when idle,
 * so an in-process cron only fires if the instance happens to be awake). An
 * external scheduler drives the jobs over HTTP instead, which makes the route
 * layer load-bearing rather than a convenience.
 *
 * The jobs themselves are covered by checkPromotionEligibility.integration,
 * annualSalaryRaise and performanceReminders.integration. What is asserted
 * here is only what those cannot see: that the route is mounted, gated to
 * ADMIN, and actually passes asOf through — a handler that ignored asOf and
 * always used `new Date()` would still return 200 and pass a shape-only test.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import supertest from "supertest";
import { startDb, stopDb, clearDb, createApp, seedAdminAndLogin, seedUserAndLogin } from "./testHelpers.js";

let dbAvailable = false;
let app;

beforeAll(async () => {
  try {
    await startDb();
    dbAvailable = true;
    app = await createApp();
  } catch (err) {
    console.warn(`[jobTriggerRoutes.integration] MongoDB unavailable — skipping.\n${err.message}`);
  }
});

afterAll(async () => {
  await stopDb();
});

beforeEach(async () => {
  if (dbAvailable) await clearDb();
});

async function adminToken() {
  const { token } = await seedAdminAndLogin(app);
  return token;
}

async function hrToken() {
  const { token } = await seedUserAndLogin(app, {
    email: "hr@hrms.com",
    name: "HR Person",
    role: "HR",
  });
  return token;
}

async function makeIntern(levelStartDate) {
  const { default: EmployeeModel } = await import("../model/Employee.js");
  return EmployeeModel.create({
    employeeId: `EMP${Math.floor(Math.random() * 100000)}`,
    name: "Test Employee",
    email: `test${Math.random()}@hrms.com`,
    status: "active",
    positionLevel: "Intern",
    levelStartDate,
  });
}

const ROUTES = [
  ["/api/v1/promotion-requests/check-eligibility", "checkEligibility"],
  ["/api/v1/promotion-requests/annual-raise", "annualRaise"],
  ["/api/v1/performance/send-reminders", "sendReminders"],
];

describe("scheduled-job trigger routes", () => {
  describe.each(ROUTES)("POST %s", (route) => {
    it("refuses an unauthenticated caller", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
      const res = await supertest(app).post(route).send({});
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("NO_TOKEN_PROVIDED");
    });

    it("refuses HR — these are ADMIN-tier, same as close-day", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
      const token = await hrToken();
      const res = await supertest(app).post(route).set("Authorization", `Bearer ${token}`).send({});
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("ACCESS_DENIED");
    });

    it("rejects an unparseable asOf rather than silently running for today", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
      const token = await adminToken();
      const res = await supertest(app)
        .post(route)
        .set("Authorization", `Bearer ${token}`)
        .send({ asOf: "not-a-date" });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("INVALID_ASOF");
    });

    it("runs for ADMIN and reports what it swept", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
      const token = await adminToken();
      const res = await supertest(app).post(route).set("Authorization", `Bearer ${token}`).send({});
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeTypeOf("object");
    });
  });

  it("check-eligibility passes asOf through to the job, not just to the response", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const token = await adminToken();
    await makeIntern(new Date("2026-01-01"));

    // Two months short of the Intern -> Full-time threshold on this date.
    const early = await supertest(app)
      .post("/api/v1/promotion-requests/check-eligibility")
      .set("Authorization", `Bearer ${token}`)
      .send({ asOf: "2026-01-05" });
    expect(early.status).toBe(200);
    expect(early.body.data.flagged).toBe(0);

    // Past it on this one. A handler ignoring asOf would give the same answer
    // for both calls.
    const late = await supertest(app)
      .post("/api/v1/promotion-requests/check-eligibility")
      .set("Authorization", `Bearer ${token}`)
      .send({ asOf: "2026-03-01" });
    expect(late.status).toBe(200);
    expect(late.body.data.flagged).toBe(1);
  });

  it("check-eligibility defaults to now when asOf is omitted", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const token = await adminToken();
    await makeIntern(new Date("2020-01-01"));

    const res = await supertest(app)
      .post("/api/v1/promotion-requests/check-eligibility")
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.data.flagged).toBe(1);
  });

  it("annual-raise reports the shape the scheduler logs", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const token = await adminToken();
    const res = await supertest(app)
      .post("/api/v1/promotion-requests/annual-raise")
      .set("Authorization", `Bearer ${token}`)
      .send({ asOf: "2026-03-01" });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("checked");
    expect(res.body.data).toHaveProperty("proposed");
  });

  it("send-reminders reports the shape the scheduler logs", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const token = await adminToken();
    const res = await supertest(app)
      .post("/api/v1/performance/send-reminders")
      .set("Authorization", `Bearer ${token}`)
      .send({ asOf: "2026-03-01" });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("cyclesChecked");
    expect(res.body.data).toHaveProperty("remindersSent");
  });
});
