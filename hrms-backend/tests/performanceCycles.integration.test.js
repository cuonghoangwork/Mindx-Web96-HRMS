import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import supertest from "supertest";
import { startDb, stopDb, clearDb, createApp, seedAdminAndLogin, seedUserAndLogin } from "./testHelpers.js";
import { auth, closedCycleKey, currentCycleKey } from "./performanceFixtures.js";
import { COMPETENCIES } from "../model/PerformanceReview.js";

let dbAvailable = false;
let app;
let request;
let token;

beforeAll(async () => {
  try {
    await startDb();
    dbAvailable = true;
  } catch (err) {
    console.warn(`[performanceCycles.integration] MongoDB unavailable — skipping.\n${err.message}`);
    return;
  }
  app = await createApp();
  request = supertest(app);
});

afterAll(async () => {
  await stopDb();
});

beforeEach(async () => {
  if (!dbAvailable) return;
  await clearDb();
  ({ token } = await seedAdminAndLogin(app));
});

async function employeeToken() {
  const seeded = await seedUserAndLogin(app, {
    email: "staff@t.test",
    name: "Staff",
    role: "EMPLOYEE",
  });
  return seeded.token;
}

describe("GET /performance/meta", () => {
  it("serves every shared constant the frontend needs", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await request.get("/api/v1/performance/meta").set(auth(token));

    expect(res.status).toBe(200);
    expect(res.body.data.ratingOptions).toEqual([1, 2, 3, 4, 5]);
    expect(res.body.data.ratingLabels["3"]).toBe("Meets expectations");
    expect(res.body.data.competencies).toEqual(COMPETENCIES);
    expect(Object.keys(res.body.data.competencyLabels)).toEqual(COMPETENCIES);
    expect(res.body.data.reviewStatuses).toEqual([
      "Not started",
      "Self submitted",
      "Manager submitted",
      "Completed",
    ]);
    expect(res.body.data.appealReasonCategories).toEqual([
      "rating_low",
      "inaccurate",
      "process",
      "other",
    ]);
    expect(res.body.data.appealResolutions).toEqual(["Upheld", "Adjusted"]);
    expect(res.body.data.appealWindowDays).toBe(14);
    expect(res.body.data.goalProgressStep).toBe(10);
  });

  it("requires a token", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    expect((await request.get("/api/v1/performance/meta")).status).toBe(401);
  });
});

describe("GET /performance/cycles", () => {
  it("generates the rolling window on a completely empty database", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { default: PerformanceCycleModel } = await import("../model/PerformanceCycle.js");

    expect(await PerformanceCycleModel.countDocuments({})).toBe(0);

    const res = await request.get("/api/v1/performance/cycles").set(auth(token));

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(3);
    expect(await PerformanceCycleModel.countDocuments({})).toBe(3);
  });

  it("is idempotent across repeated calls", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { default: PerformanceCycleModel } = await import("../model/PerformanceCycle.js");

    await request.get("/api/v1/performance/cycles").set(auth(token));
    await request.get("/api/v1/performance/cycles").set(auth(token));
    const res = await request.get("/api/v1/performance/cycles").set(auth(token));

    expect(res.body.items).toHaveLength(3);
    expect(await PerformanceCycleModel.countDocuments({})).toBe(3);
  });

  it("survives two concurrent first calls without duplicating a key", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { default: PerformanceCycleModel } = await import("../model/PerformanceCycle.js");

    const results = await Promise.all([
      request.get("/api/v1/performance/cycles").set(auth(token)),
      request.get("/api/v1/performance/cycles").set(auth(token)),
      request.get("/api/v1/performance/cycles").set(auth(token)),
    ]);

    for (const res of results) expect(res.status).toBe(200);
    expect(await PerformanceCycleModel.countDocuments({})).toBe(3);
  });

  it("returns newest first, with only the current half open", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await request.get("/api/v1/performance/cycles").set(auth(token));
    const [newest, middle, oldest] = res.body.items;

    expect(newest.key).toBe(await currentCycleKey());
    expect(newest.status).toBe("Open");
    expect(middle.status).toBe("Closed");
    expect(oldest.status).toBe("Closed");
    expect(new Date(newest.start).getTime()).toBeGreaterThan(new Date(middle.start).getTime());
    expect(new Date(middle.start).getTime()).toBeGreaterThan(new Date(oldest.start).getTime());
  });

  it("marks every generated cycle as standard with a null override stamp", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await request.get("/api/v1/performance/cycles").set(auth(token));
    for (const cycle of res.body.items) {
      expect(cycle.kind).toBe("standard");
      expect(cycle.statusOverriddenAt).toBe(null);
      expect(cycle.key).toMatch(/^\d{4}-h[12]$/);
      expect(cycle.label).toMatch(/^H[12] \d{4}$/);
    }
  });

  it("is readable by an EMPLOYEE and closed to anonymous callers", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const staffToken = await employeeToken();
    expect((await request.get("/api/v1/performance/cycles").set(auth(staffToken))).status).toBe(200);
    expect((await request.get("/api/v1/performance/cycles")).status).toBe(401);
  });

  it("closes the previous half rather than leaving two cycles open", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const currentKey = await currentCycleKey();
    const previousKey = await closedCycleKey();

    const res = await request.get("/api/v1/performance/cycles").set(auth(token));
    const open = res.body.items.filter((cycle) => cycle.status === "Open");

    expect(open).toHaveLength(1);
    expect(open[0].key).toBe(currentKey);
    expect(res.body.items.find((cycle) => cycle.key === previousKey).status).toBe("Closed");
  });
});

describe("cycle lookup on other endpoints", () => {
  it("generates the window lazily when a deep link hits a cold database", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { default: PerformanceCycleModel } = await import("../model/PerformanceCycle.js");

    expect(await PerformanceCycleModel.countDocuments({})).toBe(0);

    const key = await currentCycleKey();
    const res = await request.get(`/api/v1/performance/cycles/${key}/roster`).set(auth(token));

    expect(res.status).toBe(200);
    expect(res.body.cycle.key).toBe(key);
    expect(await PerformanceCycleModel.countDocuments({})).toBe(3);
  });

  it("404s a standard-shaped key outside the generated window", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await request.get("/api/v1/performance/cycles/2019-h1/roster").set(auth(token));

    expect(res.status).toBe(404);
    expect(res.body.message).toContain("not found");
  });

  it("404s a key that is not standard-shaped without generating anything", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { default: PerformanceCycleModel } = await import("../model/PerformanceCycle.js");

    const res = await request.get("/api/v1/performance/cycles/not-a-cycle/roster").set(auth(token));

    expect(res.status).toBe(404);
    expect(await PerformanceCycleModel.countDocuments({})).toBe(0);
  });

  it("400s an absurdly long cycle key", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await request
      .get(`/api/v1/performance/cycles/${"x".repeat(200)}/roster`)
      .set(auth(token));

    expect(res.status).toBe(400);
  });
});
