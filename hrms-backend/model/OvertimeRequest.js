/**
 * OvertimeRequest.js — Attendance Overtime, milestone M2.
 *
 * An employee applying to work overtime on a given date, or HR/a manager
 * assigning it to them. Composes the shared review-queue fields
 * (utils/reviewQueue.js) the same way LeaveRequest and NoShowReview do, so
 * list/review come for free and only `create` is bespoke.
 *
 * Business rules live in controller/overtimeRequestController.js (the 10-step
 * validation) and utils/overtimeRate.js (the rate engine). What is encoded
 * *here* is the one rule a controller cannot enforce without a race: at most
 * one live request per employee per date, via the partial unique index below.
 */

import mongoose from "mongoose";
import { reviewRequestBaseFields } from "../utils/reviewQueue.js";

export const OT_DAY_TYPES = ["normal", "restDay", "holiday"];

/** "self" — the employee applied. "assigned" — HR/a manager assigned it to them. */
export const OT_ORIGINS = ["self", "assigned"];

/** The statuses that make a request "live" — i.e. that occupy the date. */
export const OT_LIVE_STATUSES = ["pending", "approved"];

const overtimeRequestSchema = new mongoose.Schema(
  {
    ...reviewRequestBaseFields(),

    // UTC midnight, exactly like Attendance.date, so the two join without a
    // timezone conversion anywhere in between.
    date: { type: Date, required: true },

    // "HH:MM". plannedEnd additionally accepts "24:00" (END_OF_DAY in
    // utils/overtimeRate.js) — spans may not cross midnight, so a rest-day
    // shift running to the end of the day needs a representable end value.
    plannedStart: { type: String, required: true },
    plannedEnd: { type: String, required: true },

    // Stored in whole minutes rather than the fractional hours the plan
    // originally specified. Caps are compared and accumulated across many
    // rows, and float hours drift; minutes also match Attendance's
    // otMinutes, so nothing has to convert at the join. Hours are derived
    // for the client in the controller's mapper.
    plannedMinutes: { type: Number, required: true, min: 1 },

    origin: { type: String, enum: OT_ORIGINS, default: "self" },

    // Snapshot at create time, not derived on read: the rate that applied
    // when the request was approved must not silently change if a Holiday
    // row is added or removed for that date afterwards.
    dayType: { type: String, enum: OT_DAY_TYPES, required: true },

    reason: { type: String, default: "" },
    appliedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

// Serves the caps aggregation (employee + date range + status) and the
// per-date duplicate pre-check.
overtimeRequestSchema.index({ employee: 1, date: 1 });
overtimeRequestSchema.index({ employee: 1, status: 1 });

/**
 * At most one live (pending or approved) request per employee per date.
 *
 * Partial rather than plain unique so a *rejected* request does not block a
 * corrected resubmission for the same date — which is the normal path after
 * HR rejects one. The controller pre-checks this too, for a clean error
 * message; the index is what makes it true under concurrency.
 *
 * partialFilterExpression uses $in, not $ne: MongoDB does not accept $ne in
 * a partial index filter.
 */
overtimeRequestSchema.index(
  { employee: 1, date: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: OT_LIVE_STATUSES } },
    name: "one_live_request_per_employee_per_date",
  },
);

export default mongoose.model("OvertimeRequest", overtimeRequestSchema, "overtimeRequests");
