import mongoose from "mongoose";
import { reviewRequestBaseFields } from "../utils/reviewQueue.js";

/**
 * An employee's request to change their own profile (DECISIONS.md D6).
 * Self-service fields: name, phone, address, age, sex. Everything else is
 * HR-only. On approval the Employee record is updated.
 */

export const EDITABLE_FIELDS = ["name", "phone", "address", "age", "sex"];

const profileEditRequestSchema = new mongoose.Schema(
  {
    ...reviewRequestBaseFields(),

    // { fieldName: { from, to } }
    changes: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);

profileEditRequestSchema.index({ employee: 1, status: 1 });
profileEditRequestSchema.index({ requestedBy: 1 });

export default mongoose.model("ProfileEditRequest", profileEditRequestSchema, "profileEditRequests");
