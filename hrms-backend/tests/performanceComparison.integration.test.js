/**
 * performanceComparison.integration.test.js — cycle-over-cycle comparison
 * (Performance Reviews improvement addendum, feature 3).
 *
 * GET /performance/cycles/:key/comparison. Admin/HR only (router-gated, not
 * scoped like analytics/roster). Historical data for the previous standard
 * cycle is seeded by writing PerformanceReview docs directly — the cycle is
 * Closed, so the normal submit endpoints (assertCycleOpen) can't reach it.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import supertest from "supertest";
import { startDb, stopDb, clearDb, createApp } from "./testHelpers.js";
import { auth, closedCycleKey, currentCycleKey, seedPerformanceOrg } from "./performanceFixtures.js";

let dbAvailable = false;
let app;
let request;
let org;
let cycleKey;
let closedKey;

beforeAll(async () => {
  try {
    await startDb();
    dbAvailable = true;
  } catch (err) {
    console.warn(`[performanceComparison.integration] MongoDB unavailable — skipping.\n${err.message}`);
    return;
  }
  app = await createApp();
  request = supertest(app);
  cycleKey = await currentCycleKey();
  closedKey = await closedCycleKey();
});

afterAll(async () => {
  await stopDb();
});

beforeEach(async () => {
  if (!dbAvailable) return;
  await clearDb();
  org = await seedPerformanceOrg(app);
});

const reviewUrl = (employee) => `/api/v1/performance/reviews/${cycleKey}/${employee._id}`;
const comparisonUrl = (key = cycleKey, query = "") =>
  `/api/v1/performance/cycles/${key}/comparison${query}`;

async function submitSelf(employee, token, selfRating) {
  return request.patch(`${reviewUrl(employee)}/self`).set(auth(token)).send({ selfRating });
}

async function submitManager(employee, token, managerRating) {
  return request.patch(`${reviewUrl(employee)}/manager`).set(auth(token)).send({ managerRating });
}

/** Writes a completed review directly into the (closed) previous cycle —
 * bypasses the API since assertCycleOpen blocks the normal submit routes. */
async function seedPreviousCycleReview(employee, { selfRating, managerRating, appeal } = {}) {
  const { default: PerformanceReviewModel } = await import("../model/PerformanceReview.js");
  return PerformanceReviewModel.create({
    cycleKey: closedKey,
    employee: employee._id,
    selfRating: selfRating ?? null,
    selfSubmittedDate: selfRating != null ? new Date() : null,
    managerRating: managerRating ?? null,
    managerSubmittedDate: managerRating != null ? new Date() : null,
    appeal: appeal ?? null,
  });
}

describe("GET /performance/cycles/:key/comparison", () => {
  it("auto-resolves a standard cycle's predecessor and computes deltas", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    await seedPreviousCycleReview(org.employees.dev, { selfRating: 3, managerRating: 3 });
    await submitSelf(org.employees.dev, org.tokens.dev, 4);
    await submitManager(org.employees.dev, org.tokens.manager, 5);

    const res = await request.get(comparisonUrl()).set(auth(org.tokens.admin));

    expect(res.status).toBe(200);
    expect(res.body.previous.key).toBe(closedKey);
    expect(res.body.data.current.totals.employees).toBe(4);
    expect(res.body.data.previous.totals.employees).toBe(4);
    expect(res.body.data.deltas.avgSelfDelta).toBe(1);
    expect(res.body.data.deltas.avgManagerDelta).toBe(2);
  });

  it("returns previous: null for a custom cycle with no compareTo", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const created = await request
      .post("/api/v1/performance/cycles")
      .set(auth(org.tokens.admin))
      .send({ label: "Pilot", start: "2026-01-01", end: "2026-01-31" });
    const customKey = created.body.data.key;

    const res = await request.get(comparisonUrl(customKey)).set(auth(org.tokens.admin));

    expect(res.status).toBe(200);
    expect(res.body.previous).toBe(null);
    expect(res.body.data.previous).toBe(null);
    expect(res.body.data.deltas.avgSelfDelta).toBe(null);
  });

  it("uses an explicit compareTo for a custom cycle", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    await seedPreviousCycleReview(org.employees.dev, { selfRating: 2 });
    const created = await request
      .post("/api/v1/performance/cycles")
      .set(auth(org.tokens.admin))
      .send({ label: "Pilot", start: "2026-01-01", end: "2026-01-31" });
    const customKey = created.body.data.key;

    const res = await request
      .get(comparisonUrl(customKey, `?compareTo=${closedKey}`))
      .set(auth(org.tokens.admin));

    expect(res.status).toBe(200);
    expect(res.body.previous.key).toBe(closedKey);
    expect(res.body.data.previous.averages.self).toBe(2);
  });

  it("404s an invalid compareTo instead of silently degrading to null", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await request
      .get(comparisonUrl(cycleKey, "?compareTo=2019-h2"))
      .set(auth(org.tokens.admin));

    expect(res.status).toBe(404);
  });

  it("404s an unknown current cycle", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await request.get(comparisonUrl("2019-h1")).set(auth(org.tokens.admin));
    expect(res.status).toBe(404);
  });

  it("is Admin/HR only — refuses a manager and a plain employee", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    expect((await request.get(comparisonUrl()).set(auth(org.tokens.manager))).status).toBe(403);
    expect((await request.get(comparisonUrl()).set(auth(org.tokens.dev))).status).toBe(403);
    expect((await request.get(comparisonUrl()).set(auth(org.tokens.hr))).status).toBe(200);
  });

  it("reflects an appeal in the appeal-rate delta", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    await seedPreviousCycleReview(org.employees.dev, { managerRating: 2 });
    await submitManager(org.employees.dev, org.tokens.manager, 2);
    await request
      .post(`${reviewUrl(org.employees.dev)}/appeal`)
      .set(auth(org.tokens.dev))
      .send({ reasonCategory: "rating_low", detail: "Too low." });

    const res = await request.get(comparisonUrl()).set(auth(org.tokens.admin));

    expect(res.body.data.current.appealRate).toBe(0.25);
    expect(res.body.data.previous.appealRate).toBe(0);
    expect(res.body.data.deltas.appealRateDelta).toBe(0.25);
  });
});
