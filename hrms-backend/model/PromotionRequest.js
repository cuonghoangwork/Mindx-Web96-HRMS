import mongoose from "mongoose";
import { reviewRequestBaseFields } from "../utils/reviewQueue.js";

export const PROMOTION_FIELDS = ["designation", "department", "salary"];

const promotionRequestSchema = new mongoose.Schema(
  {
    ...reviewRequestBaseFields(),

    currentDesignation: { type: String, default: null },
    currentDepartmentName: { type: String, default: null },
    currentAnnualSalary: { type: Number, default: null },

    proposedDesignation: { type: String, default: null, trim: true },
    proposedDepartment: { type: mongoose.Schema.Types.ObjectId, ref: "Department", default: null },
    proposedDepartmentName: { type: String, default: null },
    proposedAnnualSalary: { type: Number, default: null, min: 0 },

    effectiveDate: { type: Date, default: null },
    reason: { type: String, default: "" },
    appliedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

promotionRequestSchema.index({ employee: 1, status: 1 });
promotionRequestSchema.index({ requestedBy: 1 });

export default mongoose.model("PromotionRequest", promotionRequestSchema, "promotionRequests");
