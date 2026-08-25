/**
 * geminiClient.test.js — task 5, pure-logic coverage.
 *
 * Same shape as exchangeRate.test.js: response parsing and the live-fetch
 * wrapper against a stubbed fetch implementation, no network, no DB.
 */

import { describe, it, expect, vi } from "vitest";
import { extractGeminiText, extractGeminiJson, askGemini, DEFAULT_GEMINI_MODEL } from "../utils/geminiClient.js";

describe("extractGeminiText", () => {
  it("reads the first candidate's text", () => {
    const json = { candidates: [{ content: { parts: [{ text: "  A neutral summary.  " }] } }] };
    expect(extractGeminiText(json)).toBe("A neutral summary.");
  });

  it("throws when candidates is missing", () => {
    expect(() => extractGeminiText({})).toThrow();
  });

  it("throws when the text is empty or whitespace-only", () => {
    expect(() => extractGeminiText({ candidates: [{ content: { parts: [{ text: "   " }] } }] })).toThrow();
    expect(() => extractGeminiText({ candidates: [{ content: { parts: [] } }] })).toThrow();
  });
});

describe("extractGeminiJson", () => {
  it("parses a JSON-string text part into an object", () => {
    const json = {
      candidates: [{ content: { parts: [{ text: '{"summary":"Solid quarter.","strengths":["Communication"],"growthAreas":["Delegation"]}' }] } }],
    };
    expect(extractGeminiJson(json)).toEqual({
      summary: "Solid quarter.",
      strengths: ["Communication"],
      growthAreas: ["Delegation"],
    });
  });

  it("throws a clear error when the text part is not valid JSON", () => {
    const json = { candidates: [{ content: { parts: [{ text: "not json at all" }] } }] };
    expect(() => extractGeminiJson(json)).toThrow(/not valid JSON/);
  });

  it("still throws when there's no text at all (delegates to extractGeminiText)", () => {
    expect(() => extractGeminiJson({})).toThrow();
  });
});

describe("askGemini", () => {
  it("throws (without calling fetch) when no API key is configured", async () => {
    const fetchImpl = vi.fn();
    await expect(askGemini("prompt", { apiKey: "", fetchImpl })).rejects.toThrow(/GEMINI_API_KEY/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("posts the prompt and returns the parsed text on success", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: "Great progress this cycle." }] } }] }),
    });

    const text = await askGemini("Summarize this review.", { apiKey: "test-key", fetchImpl });

    expect(text).toBe("Great progress this cycle.");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toContain(`models/${DEFAULT_GEMINI_MODEL}:generateContent`);
    expect(url).toContain("key=test-key");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body).contents[0].parts[0].text).toBe("Summarize this review.");
  });

  it("requests JSON output and returns the parsed object when json:true", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '{"summary":"Good.","strengths":[],"growthAreas":[]}' }] } }],
      }),
    });

    const result = await askGemini("prompt", { apiKey: "test-key", fetchImpl, json: true });

    expect(result).toEqual({ summary: "Good.", strengths: [], growthAreas: [] });
    const [, options] = fetchImpl.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.generationConfig.responseMimeType).toBe("application/json");
  });

  it("does not request JSON output by default", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: "plain text" }] } }] }),
    });
    await askGemini("prompt", { apiKey: "test-key", fetchImpl });
    const [, options] = fetchImpl.mock.calls[0];
    expect(JSON.parse(options.body).generationConfig.responseMimeType).toBeUndefined();
  });

  it("uses the given model instead of the default", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }),
    });
    await askGemini("prompt", { apiKey: "test-key", model: "gemini-1.5-flash", fetchImpl });
    expect(fetchImpl.mock.calls[0][0]).toContain("models/gemini-1.5-flash:generateContent");
  });

  it("throws with status 502 when the response is not ok", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    await expect(askGemini("prompt", { apiKey: "test-key", fetchImpl })).rejects.toMatchObject({ status: 502 });
  });

  it("throws when the response body has no usable text", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    await expect(askGemini("prompt", { apiKey: "test-key", fetchImpl })).rejects.toThrow();
  });

  it("aborts and throws if the request takes longer than timeoutMs", async () => {
    const fetchImpl = vi.fn(
      (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    await expect(
      askGemini("prompt", { apiKey: "test-key", fetchImpl, timeoutMs: 10 }),
    ).rejects.toThrow();
  });
});
