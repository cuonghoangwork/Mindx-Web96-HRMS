/**
 * exchangeRate.js — task 3.8: monthly VND-per-USD snapshot.
 *
 * `getOrCreateMonthlyFxRate` is the entry point jobs/generateMonthlyPayrollDraft.js
 * and (optionally) payrollController.createPeriod call. It is idempotent per
 * {year, month} thanks to ExchangeRate's unique index: the first caller for a
 * given month fetches and persists a snapshot, every later caller that same
 * month just reads it back. That guarantees every payslip generated for a
 * period was priced off the exact same rate, even if the draft job and a
 * manual "create period" click race on the same day.
 *
 * Network fetch failures are swallowed here, not thrown: payroll must still
 * be able to run (with the existing hardcoded default) even if the FX
 * provider is down or unreachable from the host (e.g. a sandboxed CI runner
 * with restricted egress). Callers can check the returned `source` field to
 * see whether they got a live rate or the fallback.
 */

import ExchangeRateModel from "../model/ExchangeRate.js";
import { DEFAULT_FX_RATE_VND_PER_USD } from "./payrollEngine.js";

export const DEFAULT_FX_API_URL = "https://open.er-api.com/v6/latest/USD";
export const FX_FETCH_TIMEOUT_MS = 8_000;

/**
 * Pulls a VND-per-USD number out of a handful of common free-tier FX API
 * response shapes. Kept separate from the network call so it can be unit
 * tested against fixture JSON with no network/DB involved.
 */
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

/**
 * Fetches the current USD->VND rate from the configured provider.
 * Throws on any failure (network error, non-2xx, unparseable body,
 * timeout) — callers decide what to do about that (see getOrCreateMonthlyFxRate).
 */
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

/**
 * Returns the persisted snapshot for {year, month}, creating it on first
 * call for that month. Never throws for FX-provider reasons — a fetch
 * failure just downgrades the result to the default rate with
 * source: "fallback" so payroll generation can proceed unattended.
 */
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
    // Duplicate-key race: another caller (e.g. the manual "create period"
    // endpoint) won the create for this month between our findOne and here.
    // Their snapshot wins; read it back rather than erroring out.
    if (err?.code === 11000) {
      const winner = await ExchangeRateModel.findOne({ year, month });
      if (winner) return winner;
    }
    throw err;
  }
}

export default getOrCreateMonthlyFxRate;
