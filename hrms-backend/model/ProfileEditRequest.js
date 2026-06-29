import mongoose from "mongoose";

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
 */

// Only these fields can be self-service edited
export const EDITABLE_FIELDS = ["name", "phone", "address", "age", "sex"];

const profileEditRequestSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // Snapshot of what changed: { fieldName: { from: oldValue, to: newValue } }
    changes: { type: mongoose.Schema.Types.Mixed, required: true },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },

    // Optional note from HR/Admin when rejecting or approving
    reviewNote: { type: String, default: "" },

    // Who reviewed it
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

profileEditRequestSchema.index({ employee: 1, status: 1 });
profileEditRequestSchema.index({ requestedBy: 1 });

export default mongoose.model("ProfileEditRequest", profileEditRequestSchema, "profileEditRequests");
