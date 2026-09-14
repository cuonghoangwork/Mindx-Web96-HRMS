import mongoose from "mongoose";

/**
 * HR-configurable base salary per ladder level, read by the eligibility job
 * to pre-fill a proposed salary. "Manager" here is a pay grade, decoupled
 * from Department.manager — nothing joins the two (DECISIONS.md D1).
 */

export const POSITION_LEVELS = ["Intern", "Full-time", "Senior", "Manager"];

const positionLevelSchema = new mongoose.Schema(
  {
    level: { type: String, enum: POSITION_LEVELS, required: true, unique: true },
    // 0 = lowest. Explicit, so re-seeding in a different order is safe.
    order: { type: Number, required: true },
    baseSalary: { type: Number, required: true, min: 0 },
    note: { type: String, default: "" },
  },
  { timestamps: true },
);

export default mongoose.model("PositionLevel", positionLevelSchema, "positionLevels");
