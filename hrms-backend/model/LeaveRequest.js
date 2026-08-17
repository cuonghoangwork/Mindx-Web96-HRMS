import mongoose from "mongoose";
import { reviewRequestBaseFields } from "../utils/reviewQueue.js";

/**
 * LeaveRequest — an employee's request for time off (task 4.1 in
 * HRMS_IMPROVEMENT_TASKS.md; expanded from a flat paid/unpaid split to 5
 * named leave types to match the design's per-employee leave-balance table).
 *
 * Business rules encoded here / in controller/leaveRequestController.js:
 *   - each capped type (annual/sick/parental/bereavement) has its own
 *     per-employee, per-calendar-year day allowance (LEAVE_TYPE_ALLOWANCES)
 *   - "unpaid" has no cap — always accepted regardless of balance
 *   - same-day leave must be requested before 9:00 AM server time — enforced
 *     in the controller at submission time, not here
 *   - a request for a capped type that would exceed the remaining balance
 *     for that type is rejected at submission time (the employee should
 *     pick "unpaid", or split the range); see leaveRequestController.create
 *
 * `type` is chosen by the employee at submission time (they know whether
 * this is sick/parental/bereavement/etc.) and is validated against
 * LEAVE_TYPES + the remaining balance for that type server-side — never
 * trusted blindly from the client beyond that validation.
 *
 * Composes the shared review-queue fields (employee, requestedBy, status,
 * reviewNote, reviewedBy, reviewedAt) from utils/reviewQueue.js, same as
 * ProfileEditRequest — see that file for the shared list/review handlers.
 */
export const LEAVE_TYPES = ["annual", "sick", "parental", "bereavement", "unpaid"];

export const LEAVE_TYPE_LABELS = {
  annual: "Annual/PTO",
  sick: "Sick",
  parental: "Parental",
  bereavement: "Bereavement",
  unpaid: "Unpaid",
};

// Per-type annual day allowance. "unpaid" is intentionally absent — it has
// no cap, checked explicitly wherever this map is read (a missing key means
// "unlimited", not "zero").
export const LEAVE_TYPE_ALLOWANCES = {
  annual: 12,
  sick: 10,
  parental: 90,
  bereavement: 5,
};

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
