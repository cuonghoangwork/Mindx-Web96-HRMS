/**
 * aiChat.integration.test.js — Solo Gaps Milestone 2 (AI chat widget).
 *
 * POST /ai/chat — every authenticated user, no role restriction. askGemini
 * is mocked out (no real network call in tests), same convention as
 * performanceAiInsight.integration.test.js.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import supertest from "supertest";
import { startDb, stopDb, clearDb, createApp } from "./testHelpers.js";
import { auth, seedPerformanceOrg } from "./performanceFixtures.js";

vi.mock("../utils/geminiClient.js", () => ({
  askGemini: vi.fn(),
}));

let dbAvailable = false;
let app;
let request;
let org;
let askGemini;

beforeAll(async () => {
  try {
    await startDb();
    dbAvailable = true;
  } catch (err) {
    console.warn(`[aiChat.integration] MongoDB unavailable — skipping.\n${err.message}`);
    return;
  }
  app = await createApp();
  request = supertest(app);
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

const chatUrl = "/api/v1/ai/chat";

describe("POST /ai/chat", () => {
  it("rejects an unauthenticated request", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await request.post(chatUrl).send({ message: "How do I request leave?" });

    expect(res.status).toBe(401);
    expect(askGemini).not.toHaveBeenCalled();
  });

  it("rejects an empty message", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await request.post(chatUrl).set(auth(org.tokens.dev)).send({ message: "" });

    expect(res.status).toBe(400);
    expect(askGemini).not.toHaveBeenCalled();
  });

  it("returns the reply for any authenticated role (no role restriction)", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    askGemini.mockResolvedValue("Head to the Holidays page to request leave.");

    const res = await request
      .post(chatUrl)
      .set(auth(org.tokens.dev))
      .send({ message: "How do I request leave?" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.reply).toBe("Head to the Holidays page to request leave.");
    expect(askGemini).toHaveBeenCalledTimes(1);
    // Plain-text mode — no {json:true} option, unlike the AI-insight call.
    expect(askGemini.mock.calls[0][1]).toBeUndefined();
  });

  it("caps history to the last 6 turns regardless of what the client sends", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    askGemini.mockResolvedValue("ok");

    const history = Array.from({ length: 10 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `msg${i}`,
    }));

    await request.post(chatUrl).set(auth(org.tokens.dev)).send({ message: "latest question", history });

    const prompt = askGemini.mock.calls[0][0];
    for (let i = 0; i < 4; i += 1) expect(prompt).not.toContain(`msg${i}`);
    for (let i = 4; i < 10; i += 1) expect(prompt).toContain(`msg${i}`);
  });

  it("asks Gemini to respond in Vietnamese when the client's language is 'vi'", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    askGemini.mockResolvedValue("Vào trang Ngày lễ để xin nghỉ phép.");

    await request
      .post(chatUrl)
      .set(auth(org.tokens.dev))
      .send({ message: "How do I request leave?", language: "vi" });

    const prompt = askGemini.mock.calls[0][0];
    expect(prompt).toContain("Respond in Vietnamese.");
  });

  it("defaults to English when no language is sent", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    askGemini.mockResolvedValue("Head to the Holidays page to request leave.");

    await request.post(chatUrl).set(auth(org.tokens.dev)).send({ message: "How do I request leave?" });

    const prompt = askGemini.mock.calls[0][0];
    expect(prompt).toContain("Respond in English.");
  });

  it("returns a clean error response when the AI call fails, not a crash", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const err = new Error("AI chat isn't configured yet (GEMINI_API_KEY is unset).");
    err.status = 503;
    askGemini.mockRejectedValue(err);

    const res = await request.post(chatUrl).set(auth(org.tokens.dev)).send({ message: "hello" });

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/GEMINI_API_KEY/);
  });
});
