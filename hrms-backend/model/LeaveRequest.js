import mongoose from "mongoose";
import { reviewRequestBaseFields } from "../utils/reviewQueue.js";

/**
 * LeaveRequest — an employee's request for time off (task 4.1 in
 * HRMS_IMPROVEMENT_TASKS.md).
 *
 * Business rules encoded here / in controller/leaveRequestController.js:
 *   - 12 paid leave days per employee per calendar year (PAID_LEAVE_DAYS_PER_YEAR)
 *   - same-day leave must be requested before 9:00 AM server time — enforced
 *     in the controller at submission time, not here
 *   - once the 12-day paid balance for the year is used up, further
 *     requests are still accepted, just marked "unpaid" instead of being
 *     rejected outright (task 4.4 — full policy lands in Sprint 2; this
 *     model already supports it via the `type` field)
 *
 * `type` is computed server-side from the employee's remaining balance at
 * submission time — it is never trusted from the client request body.
 *
 * Composes the shared review-queue fields (employee, requestedBy, status,
 * reviewNote, reviewedBy, reviewedAt) from utils/reviewQueue.js, same as
 * ProfileEditRequest — see that file for the shared list/review handlers.
 */
export const LEAVE_TYPES = ["paid", "unpaid"];
export const PAID_LEAVE_DAYS_PER_YEAR = 12;

const leaveRequestSchema = new mongoose.Schema(
  {
    ...reviewRequestBaseFields(),

    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },

    // Working-day count for [startDate, endDate] inclusive (weekends excluded).
    // Stored rather than recomputed on read so a later change to the counting
    // rule (e.g. factoring in holidays) doesn't silently reinterpret history.
    days: { type: Number, required: true, min: 0.5 },

    type: { type: String, enum: LEAVE_TYPES, required: true },
    reason: { type: String, default: "" },

    // When the request was actually submitted. Distinct from `createdAt`
    // only in intent: this is the field the 9AM same-day rule is evaluated
    // against, so the rule's reasoning has an explicit field to point to
    // even though today the two are set at the same instant.
    appliedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

leaveRequestSchema.index({ employee: 1, status: 1 });
leaveRequestSchema.index({ employee: 1, startDate: 1 });

export default mongoose.model("LeaveRequest", leaveRequestSchema, "leaveRequests");
