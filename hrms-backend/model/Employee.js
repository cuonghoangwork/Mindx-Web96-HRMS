import mongoose from "mongoose";
import { POSITION_LEVELS } from "./PositionLevel.js";

export const EMPLOYEE_STATUSES = ["active", "on-leave", "terminated"];

/** Statuses payroll pays and overtime may be scheduled for — one constant so the two cannot drift. */
export const PAYABLE_EMPLOYEE_STATUSES = ["active", "on-leave"];

const employeeSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    age: { type: Number },
    gender: { type: String, enum: ["male", "female", "other"] },
    phone: { type: String },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    address: { type: String },
    department: { type: mongoose.Schema.Types.ObjectId, ref: "Department" },
    designation: { type: String },
    startDate: { type: Date },
    contractType: {
      type: String,
      enum: ["full-time", "part-time", "contract", "intern"],
      default: "full-time",
    },
    // Pay grade, independent of contractType (a part-time Senior is valid);
    // levelStartDate drives promotion eligibility (DECISIONS.md D1).
    positionLevel: {
      type: String,
      enum: POSITION_LEVELS,
      default: "Full-time",
    },
    levelStartDate: { type: Date, default: null },
    status: { type: String, enum: EMPLOYEE_STATUSES, default: "active" },
    annualSalary: { type: Number, default: 0 },
    avatar: { type: String },
    // Contract PDF: set only by uploadContract (not the generic update), one
    // current contract per employee — re-uploading overwrites the asset.
    contractUrl: { type: String, default: null },
    contractUploadedAt: { type: Date, default: null },
    // Other uploads (offer letters, ID scans). publicId is kept so
    // removeDocument() can delete the Cloudinary asset.
    documents: [
      {
        url: { type: String, required: true },
        publicId: { type: String, required: true },
        label: { type: String, default: "" },
        type: { type: String, enum: ["offer_letter", "id_scan", "other"], default: "other" },
        uploadedAt: { type: Date, default: Date.now },
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      },
    ],
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

employeeSchema.index({ department: 1, status: 1 });
employeeSchema.index({ positionLevel: 1, levelStartDate: 1 });

// A new employee's tenure clock starts at their startDate, not at insert time.
employeeSchema.pre("validate", function setDefaultLevelStartDate(next) {
  if (this.isNew && !this.levelStartDate) {
    this.levelStartDate = this.startDate || new Date();
  }
  next();
});

export default mongoose.model("Employee", employeeSchema, "employees");
