import mongoose from "mongoose";
import { reviewRequestBaseFields } from "../utils/reviewQueue.js";

/**
 * ProfileEditRequest — tracks an employee's request to update their own profile fields.
 *
 * An Employee submits a request with the fields they want to change.
 * HR/Admin reviews it and approves or rejects. On approval the employee
 * record is updated automatically.
 *
 * Fields the employee is allowed to change (self-service):
 *   name, phone, address, age, sex (gender)
 *
 * Fields that are HR-only (not allowed here):
 *   employeeId, department, designation, type, status, salary, avatar
 *
 * Composes the shared review-queue fields (employee, requestedBy, status,
 * reviewNote, reviewedBy, reviewedAt) from utils/reviewQueue.js — see that
 * file for the generalized list/review handlers this schema pairs with.
 */

// Only these fields can be self-service edited
export const EDITABLE_FIELDS = ["name", "phone", "address", "age", "sex"];

const profileEditRequestSchema = new mongoose.Schema(
  {
    ...reviewRequestBaseFields(),

    // Snapshot of what changed: { fieldName: { from: oldValue, to: newValue } }
    changes: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);

profileEditRequestSchema.index({ employee: 1, status: 1 });
profileEditRequestSchema.index({ requestedBy: 1 });

export default mongoose.model("ProfileEditRequest", profileEditRequestSchema, "profileEditRequests");
