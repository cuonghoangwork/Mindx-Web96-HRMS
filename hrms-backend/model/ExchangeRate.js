import mongoose from "mongoose";

/**
 * ExchangeRate — one persisted VND-per-USD snapshot per calendar month
 * (task 3.8). Payroll draft generation (3.9) and PayrollPeriod.fxRate both
 * read from this instead of re-fetching live on every request, so every
 * payslip in a given period is priced off the exact same number.
 */
const exchangeRateSchema = new mongoose.Schema(
  {
    year: { type: Number, required: true, min: 2000, max: 2100 },
    month: { type: Number, required: true, min: 1, max: 12 },

    rateVndPerUsd: { type: Number, required: true, min: 1 },

    // "api" - fetched live from the configured FX provider.
    // "fallback" - live fetch failed or was disabled; DEFAULT_FX_RATE_VND_PER_USD used instead.
    // "manual" - reserved for a future HR override path; not written by the job today.
    source: { type: String, enum: ["api", "fallback", "manual"], required: true },
    providerName: { type: String, default: null },
    fetchedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

exchangeRateSchema.index({ year: 1, month: 1 }, { unique: true });

export default mongoose.model("ExchangeRate", exchangeRateSchema, "exchangeRates");
