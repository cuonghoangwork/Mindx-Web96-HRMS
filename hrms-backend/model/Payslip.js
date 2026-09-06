import mongoose from "mongoose";

/**
 * Attendance Overtime (M5). Per-day-type buckets, so a payslip can show
 * "150% x 4h · 200% x 10h · 270% x 2h" rather than one opaque figure.
 * Minutes are the stored unit everywhere overtime is concerned; hours are
 * derived for display.
 */
const overtimeBucketSchema = new mongoose.Schema(
  {
    dayMinutes: { type: Number, default: 0, min: 0 },
    nightMinutes: { type: Number, default: 0, min: 0 },
    pay: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const overtimeBreakdownSchema = new mongoose.Schema(
  {
    normal: { type: overtimeBucketSchema, default: () => ({}) },
    restDay: { type: overtimeBucketSchema, default: () => ({}) },
    holiday: { type: overtimeBucketSchema, default: () => ({}) },
  },
  { _id: false },
);

const payslipSchema = new mongoose.Schema(
  {
    period: { type: mongoose.Schema.Types.ObjectId, ref: "PayrollPeriod", required: true },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true },

    employeeCode: { type: String, default: "" },
    employeeName: { type: String, default: "" },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Department", default: null },
    departmentName: { type: String, default: null },
    designation: { type: String, default: null },
    contractType: { type: String, default: null },
    annualSalaryUsd: { type: Number, default: 0 },

    baseSalary: { type: Number, required: true, default: 0, min: 0 },
    bonus: { type: Number, required: true, default: 0, min: 0 },
    allowance: { type: Number, required: true, default: 0, min: 0 },
    deduction: { type: Number, required: true, default: 0, min: 0 },

    // Attendance Overtime (M5). Persisted rather than recomputed on read,
    // because every payslip recompute path (HR adjustments, deduction
    // recalculation) must be able to carry overtime forward without going
    // back to the attendance records — see the note in payrollController.
    overtimeHours: { type: Number, default: 0, min: 0 },
    overtimeNightHours: { type: Number, default: 0, min: 0 },
    overtimePay: { type: Number, default: 0, min: 0 },
    overtimeBreakdown: { type: overtimeBreakdownSchema, default: () => ({}) },
    // Records the policy in force when this payslip was computed, so a later
    // change to OT_PIT_EXEMPT cannot silently reinterpret a historical slip.
    overtimeTaxExempt: { type: Boolean, default: true },

    unpaidLeaveDays: { type: Number, default: 0, min: 0 },
    absentDays: { type: Number, default: 0, min: 0 },
    autoDeduction: { type: Number, default: 0, min: 0 },
    deductionOverridden: { type: Boolean, default: false },

    grossPay: { type: Number, required: true, default: 0, min: 0 },
    insuranceBase: { type: Number, required: true, default: 0, min: 0 },
    insuranceExempt: { type: Boolean, default: false },
    bhxh: { type: Number, required: true, default: 0, min: 0 },
    bhyt: { type: Number, required: true, default: 0, min: 0 },
    bhtn: { type: Number, required: true, default: 0, min: 0 },
    insuranceTotal: { type: Number, required: true, default: 0, min: 0 },
    taxableIncome: { type: Number, required: true, default: 0, min: 0 },
    pit: { type: Number, required: true, default: 0, min: 0 },
    netPay: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true },
);

payslipSchema.index({ period: 1, employee: 1 }, { unique: true });
payslipSchema.index({ employee: 1, createdAt: -1 });

export default mongoose.model("Payslip", payslipSchema, "payslips");
