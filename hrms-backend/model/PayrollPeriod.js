import mongoose from "mongoose";

export const PAYROLL_PERIOD_STATUSES = ["draft", "approved", "paid"];

const payrollPeriodSchema = new mongoose.Schema(
  {
    year: { type: Number, required: true, min: 2000, max: 2100 },
    month: { type: Number, required: true, min: 1, max: 12 },

    fxRate: { type: Number, required: true, default: 25000, min: 1 },
    standardWorkingDays: { type: Number, required: true, min: 1 },

    status: { type: String, enum: PAYROLL_PERIOD_STATUSES, default: "draft" },
    note: { type: String, default: "" },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    approvedAt: { type: Date, default: null },
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    paidAt: { type: Date, default: null },
  },
  { timestamps: true },
);

payrollPeriodSchema.index({ year: 1, month: 1 }, { unique: true });
payrollPeriodSchema.index({ status: 1, year: -1, month: -1 });

export default mongoose.model("PayrollPeriod", payrollPeriodSchema, "payrollPeriods");
