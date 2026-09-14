/**
 * An employee applying to work overtime on a date, or HR/a manager assigning
 * it (DECISIONS.md D5). Composes the review-queue fields (D6). The one rule
 * the controller cannot enforce without a race lives here: at most one live
 * request per employee per date, via the partial unique index below.
 */

import mongoose from "mongoose";
import { reviewRequestBaseFields } from "../utils/reviewQueue.js";

export const OT_DAY_TYPES = ["normal", "restDay", "holiday"];

/** "self" — the employee applied. "assigned" — HR/a manager assigned it. */
export const OT_ORIGINS = ["self", "assigned"];

/** Statuses that occupy the date. */
export const OT_LIVE_STATUSES = ["pending", "approved"];

const overtimeRequestSchema = new mongoose.Schema(
  {
    ...reviewRequestBaseFields(),

    // UTC midnight, like Attendance.date, so the two join directly.
    date: { type: Date, required: true },

    // "HH:MM"; plannedEnd also accepts "24:00" (END_OF_DAY in overtimeRate.js).
    plannedStart: { type: String, required: true },
    plannedEnd: { type: String, required: true },

    // Whole minutes, matching Attendance.otMinutes; hours are derived in the mapper.
    plannedMinutes: { type: Number, required: true, min: 1 },

    origin: { type: String, enum: OT_ORIGINS, default: "self" },

    // Snapshotted at create time so a Holiday row added later cannot reprice an approved shift.
    dayType: { type: String, enum: OT_DAY_TYPES, required: true },

    reason: { type: String, default: "" },
    appliedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

overtimeRequestSchema.index({ employee: 1, date: 1 });
overtimeRequestSchema.index({ employee: 1, status: 1 });

// Partial rather than plain unique so a rejected request does not block a
// corrected resubmission. ($in, not $ne — MongoDB rejects $ne in a partial filter.)
overtimeRequestSchema.index(
  { employee: 1, date: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: OT_LIVE_STATUSES } },
    name: "one_live_request_per_employee_per_date",
  },
);

export default mongoose.model("OvertimeRequest", overtimeRequestSchema, "overtimeRequests");
