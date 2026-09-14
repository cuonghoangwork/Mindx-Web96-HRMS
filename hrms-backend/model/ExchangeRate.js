import mongoose from "mongoose";

/** One VND-per-USD snapshot per calendar month, so every payslip in a period is priced at the same rate (DECISIONS.md D9). */
const exchangeRateSchema = new mongoose.Schema(
  {
    year: { type: Number, required: true, min: 2000, max: 2100 },
    month: { type: Number, required: true, min: 1, max: 12 },

    rateVndPerUsd: { type: Number, required: true, min: 1 },

    // "api" live, "fallback" the default rate after a failed fetch, "manual" reserved (never written today).
    source: { type: String, enum: ["api", "fallback", "manual"], required: true },
    providerName: { type: String, default: null },
    fetchedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

exchangeRateSchema.index({ year: 1, month: 1 }, { unique: true });

export default mongoose.model("ExchangeRate", exchangeRateSchema, "exchangeRates");
