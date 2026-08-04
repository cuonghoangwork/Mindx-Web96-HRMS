import mongoose from "mongoose";

/**
 * PositionLevel.js — lookup model for the Position Ladder (tasks 0.3 / 2.3).
 *
 * A small, HR-configurable table mapping each ladder level to its base
 * salary. Two consumers, both intentionally reading the same table so the
 * ladder and Payroll never drift apart:
 *   - The promotion-eligibility job (2.4) uses `order` to find "the next
 *     level up" and `baseSalary` to pre-fill a proposed salary.
 *   - Payroll's future annual-increment job (3.3, not yet built) will read
 *     `baseSalary` the same way.
 *
 * Per DECISION_2.6_Manager_Level.md: "Manager" here is a personal
 * seniority/pay-grade, fully decoupled from Department.manager. No code in
 * this model or its consumers should ever join against Department.
 */

export const POSITION_LEVELS = ["Intern", "Full-time", "Senior", "Manager"];

const positionLevelSchema = new mongoose.Schema(
  {
    level: { type: String, enum: POSITION_LEVELS, required: true, unique: true },
    // Order along the ladder (0 = lowest). Drives "what's the next level up"
    // lookups in the eligibility job — kept explicit rather than inferring
    // it from array position, so re-seeding in a different order is safe.
    order: { type: Number, required: true },
    baseSalary: { type: Number, required: true, min: 0 },
    note: { type: String, default: "" },
  },
  { timestamps: true },
);

export default mongoose.model("PositionLevel", positionLevelSchema, "positionLevels");
