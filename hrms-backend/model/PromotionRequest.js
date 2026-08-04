import mongoose from "mongoose";
import { reviewRequestBaseFields } from "../utils/reviewQueue.js";
import { POSITION_LEVELS } from "./PositionLevel.js";

export const PROMOTION_FIELDS = ["designation", "department", "salary", "positionLevel"];

const promotionRequestSchema = new mongoose.Schema(
  {
    ...reviewRequestBaseFields(),

    currentDesignation: { type: String, default: null },
    currentDepartmentName: { type: String, default: null },
    currentAnnualSalary: { type: Number, default: null },
    // Position Ladder (task 2.4/2.5) — separate from designation, which is
    // free-text job title. currentPositionLevel is captured at proposal
    // time the same way currentDesignation etc. already are, so the
    // request stands on its own even if the employee changes level again
    // before this one is reviewed.
    currentPositionLevel: { type: String, enum: POSITION_LEVELS, default: null },

    proposedDesignation: { type: String, default: null, trim: true },
    proposedDepartment: { type: mongoose.Schema.Types.ObjectId, ref: "Department", default: null },
    proposedDepartmentName: { type: String, default: null },
    proposedAnnualSalary: { type: Number, default: null, min: 0 },
    proposedPositionLevel: { type: String, enum: POSITION_LEVELS, default: null },

    effectiveDate: { type: Date, default: null },
    reason: { type: String, default: "" },
    appliedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

promotionRequestSchema.index({ employee: 1, status: 1 });
promotionRequestSchema.index({ requestedBy: 1 });
promotionRequestSchema.index({ employee: 1, systemGenerated: 1, proposedPositionLevel: 1 });

export default mongoose.model("PromotionRequest", promotionRequestSchema, "promotionRequests");
