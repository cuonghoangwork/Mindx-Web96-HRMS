/**
 * performanceAiInsight.integration.test.js — task 5.
 *
 * POST /performance/reviews/:cycleKey/:employeeId/ai-insight. Same viewer
 * gate as GET .../reviews/:cycleKey/:employeeId (assertCanViewReview), so
 * this only covers what's specific to the AI path: askGemini is mocked out
 * (no real network call in tests, same reasoning as stubbing fetchImpl in
 * geminiClient.test.js) and the endpoint's success/error shapes.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import supertest from "supertest";
import { startDb, stopDb, clearDb, createApp } from "./testHelpers.js";
import { auth, currentCycleKey, seedPerformanceOrg } from "./performanceFixtures.js";

vi.mock("../utils/geminiClient.js", () => ({
  askGemini: vi.fn(),
}));

let dbAvailable = false;
let app;
let request;
let org;
let cycleKey;
let askGemini;

beforeAll(async () => {
  try {
    await startDb();
    dbAvailable = true;
  } catch (err) {
    console.warn(`[performanceAiInsight.integration] MongoDB unavailable — skipping.\n${err.message}`);
    return;
  }
  app = await createApp();
  request = supertest(app);
  cycleKey = await currentCycleKey();
  ({ askGemini } = await import("../utils/geminiClient.js"));
});

afterAll(async () => {
  await stopDb();
});

beforeEach(async () => {
  if (!dbAvailable) return;
  await clearDb();
  org = await seedPerformanceOrg(app);
  askGemini.mockReset();
});

const insightUrl = (employee, key = cycleKey) =>
  `/api/v1/performance/reviews/${key}/${employee._id}/ai-insight`;

describe("POST /performance/reviews/:cycleKey/:employeeId/ai-insight", () => {
  it("returns the generated text for a viewer with access", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    askGemini.mockResolvedValue("A neutral summary and one growth suggestion.");

    const res = await request.post(insightUrl(org.employees.dev)).set(auth(org.tokens.dev));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.text).toBe("A neutral summary and one growth suggestion.");
    expect(askGemini).toHaveBeenCalledTimes(1);
    expect(askGemini.mock.calls[0][0]).toContain("Dev One");
  });

  it("also allows the employee's manager and an admin", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    askGemini.mockResolvedValue("Insight text.");

    const asManager = await request.post(insightUrl(org.employees.dev)).set(auth(org.tokens.manager));
    expect(asManager.status).toBe(200);

    const asAdmin = await request.post(insightUrl(org.employees.dev)).set(auth(org.tokens.admin));
    expect(asAdmin.status).toBe(200);
  });

  it("refuses an unrelated employee (403)", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    askGemini.mockResolvedValue("Insight text.");

    const res = await request.post(insightUrl(org.employees.dev)).set(auth(org.tokens.designer));

    expect(res.status).toBe(403);
    expect(askGemini).not.toHaveBeenCalled();
  });

  it("returns a clean error response when the AI call fails, not a crash", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const err = new Error("AI insight isn't configured yet (GEMINI_API_KEY is unset).");
    err.status = 503;
    askGemini.mockRejectedValue(err);

    const res = await request.post(insightUrl(org.employees.dev)).set(auth(org.tokens.dev));

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/GEMINI_API_KEY/);
  });
});
