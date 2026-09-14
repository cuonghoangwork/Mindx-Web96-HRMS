/**
 * A repeated-no-show pattern handed to a human (DECISIONS.md D2, D6). Always
 * systemGenerated — there is no create endpoint — and review outcomes never
 * change employment automatically (the controller's onApprove does nothing).
 */

import mongoose from "mongoose";
import { reviewRequestBaseFields } from "../utils/reviewQueue.js";

const noShowReviewSchema = new mongoose.Schema(
  {
    ...reviewRequestBaseFields(),

    // All-time count when flagged; the job re-flags only once it has grown by another 5.
    noShowCountAtFlag: { type: Number, required: true, min: 1 },

    reason: { type: String, default: "" },
    flaggedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

noShowReviewSchema.index({ employee: 1, status: 1 });
noShowReviewSchema.index({ employee: 1, noShowCountAtFlag: -1 });

export default mongoose.model("NoShowReview", noShowReviewSchema, "noShowReviews");
