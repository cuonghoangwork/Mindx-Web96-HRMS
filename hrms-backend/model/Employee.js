import mongoose from "mongoose";
import { POSITION_LEVELS } from "./PositionLevel.js";

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
    // Position Ladder (tasks 2.1/2.2) — deliberately separate from
    // contractType (see DECISION_2.6_Manager_Level.md): contractType is
    // employment terms (e.g. a part-time Senior is representable), while
    // positionLevel is seniority/pay-grade on the ladder. levelStartDate
    // tracks tenure-in-level so eligibility (task 2.4) is computed, not
    // guessed from createdAt.
    positionLevel: {
      type: String,
      enum: POSITION_LEVELS,
      default: "Full-time",
    },
    levelStartDate: { type: Date, default: null },
    status: { type: String, enum: ["active", "on-leave", "terminated"], default: "active" },
    annualSalary: { type: Number, default: 0 },
    avatar: { type: String },
    // Back-link to the User account that belongs to this employee (optional 1:1)
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

employeeSchema.index({ department: 1, status: 1 });
employeeSchema.index({ positionLevel: 1, levelStartDate: 1 });

// Default levelStartDate to startDate (or now, if startDate wasn't given)
// on creation, so a brand-new employee's tenure clock starts from the
// moment that's actually true rather than whenever this field happened to
// be added to the schema. Existing employees are backfilled separately —
// see utils/backfillPositionLadder.js.
employeeSchema.pre("validate", function setDefaultLevelStartDate(next) {
  if (this.isNew && !this.levelStartDate) {
    this.levelStartDate = this.startDate || new Date();
  }
  next();
});

export default mongoose.model("Employee", employeeSchema, "employees");
