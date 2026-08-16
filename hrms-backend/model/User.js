import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    // HR = company-wide HR staff (unscoped). MANAGER = department-scoped line
    // manager (see utils/managerScope.js). Historically MANAGER did double
    // duty as both; HR was split out to give the department-scoping work a
    // real unscoped tier above it.
    role: { type: String, enum: ["ADMIN", "HR", "MANAGER", "EMPLOYEE"], default: "EMPLOYEE" },
    // Optional link to an Employee profile record (1:1)
    employee: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", default: null },
    refreshToken: { type: String, default: null },
    mustChangePassword: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export default mongoose.model("User", userSchema, "users");
