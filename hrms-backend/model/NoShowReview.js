/**
 * NoShowReview.js — task 4.7: "5 no-shows -> flag for HR review (not
 * auto-terminate)". Composes the generic review-queue pattern (task 0.2,
 * utils/reviewQueue.js) the same way PromotionRequest does, per the plan
 * both jobs/checkPromotionEligibility.js and reviewQueue.js's own header
 * comment call out.
 *
 * Every request here is systemGenerated: true — there is deliberately no
 * employee- or HR-initiated "create" path (see controller). It only ever
 * exists to hand a repeated no-show pattern to a human for review; review
 * outcomes never change employee status/employment automatically (see
 * controller's onApprove, which intentionally does nothing).
 */

import mongoose from "mongoose";
import { reviewRequestBaseFields } from "../utils/reviewQueue.js";

const noShowReviewSchema = new mongoose.Schema(
  {
    ...reviewRequestBaseFields(),

    // Employee's all-time no-show count (Attendance status "no-show") at
    // the moment this flag was raised. Used both for display and for the
    // job's dedup rule (utils re-flag only once the count has grown by
    // another 5 since the last flag).
    noShowCountAtFlag: { type: Number, required: true, min: 1 },

    reason: { type: String, default: "" },
    flaggedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

noShowReviewSchema.index({ employee: 1, status: 1 });
noShowReviewSchema.index({ employee: 1, noShowCountAtFlag: -1 });

export default mongoose.model("NoShowReview", noShowReviewSchema, "noShowReviews");
