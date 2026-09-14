import mongoose from "mongoose";
import { reviewRequestBaseFields } from "../utils/reviewQueue.js";

/**
 * Time-off request (DECISIONS.md D3). Balance and same-day rules are enforced
 * in leaveRequestController.create; the review lifecycle comes from
 * utils/reviewQueue.js (D6).
 */
export const LEAVE_TYPES = ["annual", "sick", "parental", "bereavement", "unpaid"];

export const LEAVE_TYPE_LABELS = {
  annual: "Annual/PTO",
  sick: "Sick",
  parental: "Parental",
  bereavement: "Bereavement",
  unpaid: "Unpaid",
};

// Days per calendar year. "unpaid" is absent on purpose: a missing key means uncapped, not zero.
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

    // Working days inclusive; stored so a later change to the counting rule does not reinterpret history.
    days: { type: Number, required: true, min: 0.5 },

    type: { type: String, enum: LEAVE_TYPES, required: true },
    reason: { type: String, default: "" },

    // What the same-day cutoff is evaluated against (today identical to createdAt).
    appliedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

leaveRequestSchema.index({ employee: 1, status: 1 });
leaveRequestSchema.index({ employee: 1, startDate: 1 });

export default mongoose.model("LeaveRequest", leaveRequestSchema, "leaveRequests");
