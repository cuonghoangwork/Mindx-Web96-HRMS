/**
 * exchangeRate.test.js — task 3.8, pure-logic coverage.
 *
 * Covers response parsing and the live-fetch wrapper against a stubbed
 * fetch implementation. No network, no DB — getOrCreateMonthlyFxRate's
 * persistence behavior (the get-or-create-once-per-month contract) is
 * covered separately in generateMonthlyPayrollDraft.integration.test.js
 * since it needs a real ExchangeRate collection.
 */

import { describe, it, expect, vi } from "vitest";
import {
  parseFxRateResponse,
  fetchLiveFxRate,
  DEFAULT_FX_API_URL,
} from "../utils/exchangeRate.js";

describe("parseFxRateResponse", () => {
  it("reads rates.VND (open.er-api.com / exchangerate.host shape)", () => {
    expect(parseFxRateResponse({ rates: { VND: 25400, EUR: 0.9 } })).toBe(25400);
  });

  it("reads conversion_rates.VND (exchangerate-api.com v6 shape)", () => {
    expect(parseFxRateResponse({ conversion_rates: { VND: 25123.5 } })).toBe(25123.5);
  });

  it("reads data.VND as a last-resort fallback shape", () => {
    expect(parseFxRateResponse({ data: { VND: 25200 } })).toBe(25200);
  });

  it("throws when no VND rate is present anywhere expected", () => {
    expect(() => parseFxRateResponse({ rates: { EUR: 0.9 } })).toThrow();
  });

  it("throws on a non-numeric or non-positive rate", () => {
    expect(() => parseFxRateResponse({ rates: { VND: "not-a-number" } })).toThrow();
    expect(() => parseFxRateResponse({ rates: { VND: -5 } })).toThrow();
    expect(() => parseFxRateResponse({ rates: { VND: 0 } })).toThrow();
  });

  it("throws on a missing/empty body", () => {
    expect(() => parseFxRateResponse(undefined)).toThrow();
    expect(() => parseFxRateResponse({})).toThrow();
  });
});

describe("fetchLiveFxRate", () => {
  it("calls the configured URL and returns the parsed rate on success", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ rates: { VND: 26000 } }),
    });

    const rate = await fetchLiveFxRate({ apiUrl: "https://example.test/fx", fetchImpl });

    expect(rate).toBe(26000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe("https://example.test/fx");
  });

  it("defaults to DEFAULT_FX_API_URL when no apiUrl is given", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ rates: { VND: 26000 } }),
    });

    await fetchLiveFxRate({ fetchImpl });

    expect(fetchImpl.mock.calls[0][0]).toBe(DEFAULT_FX_API_URL);
  });

  it("throws when the response is not ok", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    await expect(fetchLiveFxRate({ fetchImpl })).rejects.toThrow(/503/);
  });

  it("throws when the body has no usable VND rate", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rates: {} }) });
    await expect(fetchLiveFxRate({ fetchImpl })).rejects.toThrow();
  });

  it("throws when no fetch implementation is available", async () => {
    // NOTE: passing `fetchImpl: undefined` here would NOT exercise this path -
    // object-destructuring defaults substitute for `undefined`, so it would
    // silently fall through to `= globalThis.fetch` and, on any runtime with
    // native fetch (Node 18+), make a real network call instead of failing.
    // `null` bypasses the default and reaches the typeof-check explicitly.
    await expect(fetchLiveFxRate({ fetchImpl: null })).rejects.toThrow(/fetch/i);
  });

  it("aborts and throws if the request takes longer than timeoutMs", async () => {
    const fetchImpl = vi.fn(
      (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );

    await expect(fetchLiveFxRate({ fetchImpl, timeoutMs: 10 })).rejects.toThrow();
  });
});
