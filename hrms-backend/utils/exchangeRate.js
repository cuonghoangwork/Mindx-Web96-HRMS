/**
 * Monthly VND-per-USD snapshot (DECISIONS.md D9). Idempotent per {year, month}
 * via ExchangeRate's unique index, so every payslip in a period is priced at
 * the same rate even if the draft job and a manual "create period" race.
 * Fetch failures fall back to the default rate — payroll must still run.
 */
import ExchangeRateModel from "../model/ExchangeRate.js";
import { DEFAULT_FX_RATE_VND_PER_USD } from "./payrollEngine.js";

export const DEFAULT_FX_API_URL = "https://open.er-api.com/v6/latest/USD";
export const FX_FETCH_TIMEOUT_MS = 8_000;

/** VND-per-USD from the common free-tier response shapes. Separate from the fetch so it unit-tests on fixtures. */
export function parseFxRateResponse(json) {
  const candidate =
    json?.rates?.VND ?? // open.er-api.com, exchangerate.host, frankfurter-style
    json?.conversion_rates?.VND ?? // exchangerate-api.com v6 (keyed)
    json?.data?.VND; // some wrapper APIs nest under "data"

  const rate = Number(candidate);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("FX response did not contain a usable VND rate.");
  }
  return rate;
}

/** Live USD->VND rate. Throws on any failure; getOrCreateMonthlyFxRate decides what that means. */
export async function fetchLiveFxRate({
  apiUrl = process.env.FX_RATE_API_URL || DEFAULT_FX_API_URL,
  fetchImpl = globalThis.fetch,
  timeoutMs = FX_FETCH_TIMEOUT_MS,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("No fetch implementation available to call the FX rate API.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(apiUrl, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`FX rate API responded with HTTP ${response.status}`);
    }
    const json = await response.json();
    return parseFxRateResponse(json);
  } finally {
    clearTimeout(timer);
  }
}

/** The month's snapshot, created on first call. A fetch failure yields the default rate with source: "fallback". */
export async function getOrCreateMonthlyFxRate({ year, month, fetchImpl } = {}) {
  const existing = await ExchangeRateModel.findOne({ year, month });
  if (existing) return existing;

  let rateVndPerUsd = DEFAULT_FX_RATE_VND_PER_USD;
  let source = "fallback";
  let providerName = null;

  try {
    rateVndPerUsd = await fetchLiveFxRate({ fetchImpl });
    source = "api";
    providerName = process.env.FX_RATE_API_URL || DEFAULT_FX_API_URL;
  } catch (err) {
    console.warn(
      `[exchangeRate] live FX fetch failed for ${year}-${String(month).padStart(2, "0")}, ` +
        `falling back to DEFAULT_FX_RATE_VND_PER_USD (${DEFAULT_FX_RATE_VND_PER_USD}): ${err.message}`,
    );
  }

  try {
    return await ExchangeRateModel.create({
      year,
      month,
      rateVndPerUsd,
      source,
      providerName,
      fetchedAt: new Date(),
    });
  } catch (err) {
    // Another caller won the create for this month; their snapshot wins.
    if (err?.code === 11000) {
      const winner = await ExchangeRateModel.findOne({ year, month });
      if (winner) return winner;
    }
    throw err;
  }
}

export default getOrCreateMonthlyFxRate;
