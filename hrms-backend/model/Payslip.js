import mongoose from "mongoose";

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

    unpaidLeaveDays: { type: Number, default: 0, min: 0 },
    absentDays: { type: Number, default: 0, min: 0 },
    autoDeduction: { type: Number, default: 0, min: 0 },
    deductionOverridden: { type: Boolean, default: false },

    grossPay: { type: Number, required: true, default: 0, min: 0 },
    insuranceBase: { type: Number, required: true, default: 0, min: 0 },
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
