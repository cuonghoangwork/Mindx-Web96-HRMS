import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startDb, stopDb, clearDb } from "./testHelpers.js";
import { standardWorkingDaysInMonth } from "../utils/payrollEngine.js";

let dbAvailable = false;

const YEAR = 2026;
const MONTH = 5;
const AS_OF = new Date(YEAR, MONTH, 10, 3);

beforeAll(async () => {
  try {
    await startDb();
    dbAvailable = true;
  } catch (err) {
    console.warn(`[runMonthlyPayroll.integration] MongoDB unavailable — skipping.\n${err.message}`);
  }
});

afterAll(async () => {
  await stopDb();
});

beforeEach(async () => {
  if (dbAvailable) await clearDb();
});

async function makeEmployee({ createdAt = new Date(YEAR, MONTH - 1, 1), ...overrides } = {}) {
  const { default: EmployeeModel } = await import("../model/Employee.js");
  const employee = await EmployeeModel.create({
    employeeId: overrides.employeeId ?? `EMP${Math.floor(Math.random() * 100000)}`,
    name: overrides.name ?? "Test Employee",
    email: overrides.email ?? `test${Math.random()}@hrms.com`,
    status: overrides.status ?? "active",
    annualSalary: overrides.annualSalary ?? 24000,
    contractType: overrides.contractType ?? "full-time",
    ...overrides,
  });
  await EmployeeModel.collection.updateOne({ _id: employee._id }, { $set: { createdAt } });
  return employee;
}

async function makePeriod(overrides = {}) {
  const { default: PayrollPeriodModel } = await import("../model/PayrollPeriod.js");
  return PayrollPeriodModel.create({
    year: YEAR,
    month: MONTH,
    fxRate: 25000,
    standardWorkingDays: standardWorkingDaysInMonth(YEAR, MONTH),
    status: "draft",
    ...overrides,
  });
}

async function generateFor(period) {
  const { buildPayslipRows, insertPayslips } = await import("../utils/payrollGeneration.js");
  return insertPayslips(await buildPayslipRows(period));
}

describe("runMonthlyPayroll", () => {
  it("approves, pays and broadcasts a draft period for the previous month", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { runMonthlyPayroll } = await import("../jobs/runMonthlyPayroll.js");
    const { default: PayrollPeriodModel } = await import("../model/PayrollPeriod.js");
    const { default: NotificationModel } = await import("../model/Notification.js");

    await makeEmployee();
    const period = await makePeriod();
    await generateFor(period);

    const result = await runMonthlyPayroll({ asOf: AS_OF });

    expect(result.skipped).toBe(false);
    expect(result.year).toBe(YEAR);
    expect(result.month).toBe(MONTH);
    expect(result.payslipCount).toBe(1);

    const after = await PayrollPeriodModel.findById(period._id);
    expect(after.status).toBe("paid");
    expect(after.approvedAt).toBeTruthy();
    expect(after.paidAt).toBeTruthy();

    const notices = await NotificationModel.find({ category: "payroll", user: null });
    const broadcast = notices.filter((n) => n.audience === "all");
    expect(broadcast).toHaveLength(1);
    expect(broadcast[0].link).toBe(null);
    expect(broadcast[0].title).toBe("Payroll paid");
  });

  it("skips a period that is already paid", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { runMonthlyPayroll } = await import("../jobs/runMonthlyPayroll.js");
    const { default: NotificationModel } = await import("../model/Notification.js");

    await makeEmployee();
    const period = await makePeriod();
    await generateFor(period);
    period.status = "paid";
    await period.save();

    const result = await runMonthlyPayroll({ asOf: AS_OF });

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("already-paid");
    expect(await NotificationModel.countDocuments({ audience: "all" })).toBe(0);
  });

  it("pays an already-approved period without clobbering who approved it", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { runMonthlyPayroll } = await import("../jobs/runMonthlyPayroll.js");
    const { default: PayrollPeriodModel } = await import("../model/PayrollPeriod.js");
    const { default: UserModel } = await import("../model/User.js");

    const approver = await UserModel.create({
      email: "hr@hrms.com",
      password: "x",
      name: "HR User",
      role: "MANAGER",
    });

    await makeEmployee();
    const period = await makePeriod();
    await generateFor(period);
    period.status = "approved";
    period.approvedBy = approver._id;
    period.approvedAt = new Date(YEAR, MONTH - 1, 28);
    await period.save();

    const result = await runMonthlyPayroll({ asOf: AS_OF });

    expect(result.skipped).toBe(false);
    expect(result.refreshed).toBe(0);

    const after = await PayrollPeriodModel.findById(period._id);
    expect(after.status).toBe("paid");
    expect(String(after.approvedBy)).toBe(String(approver._id));
    expect(after.approvedAt.getTime()).toBe(new Date(YEAR, MONTH - 1, 28).getTime());
  });

  it("skips a period that has no payslips instead of paying it", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { runMonthlyPayroll } = await import("../jobs/runMonthlyPayroll.js");
    const { default: PayrollPeriodModel } = await import("../model/PayrollPeriod.js");
    const { default: NotificationModel } = await import("../model/Notification.js");

    const period = await makePeriod();

    const result = await runMonthlyPayroll({ asOf: AS_OF });

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("no-payslips");
    expect((await PayrollPeriodModel.findById(period._id)).status).toBe("draft");
    expect(await NotificationModel.countDocuments({ audience: "all" })).toBe(0);
  });

  it("creates nothing at all when the previous month has no period", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { runMonthlyPayroll } = await import("../jobs/runMonthlyPayroll.js");
    const { default: PayrollPeriodModel } = await import("../model/PayrollPeriod.js");
    const { default: ExchangeRateModel } = await import("../model/ExchangeRate.js");
    const { default: NotificationModel } = await import("../model/Notification.js");

    await makeEmployee();

    const result = await runMonthlyPayroll({ asOf: AS_OF });

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("no-period");
    expect(await PayrollPeriodModel.countDocuments({})).toBe(0);
    expect(await ExchangeRateModel.countDocuments({})).toBe(0);
    expect(await NotificationModel.countDocuments({ audience: "hr" })).toBe(1);
  });

  it("targets December of the prior year when run in January", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { runMonthlyPayroll } = await import("../jobs/runMonthlyPayroll.js");

    await makeEmployee();
    const period = await makePeriod({ year: 2026, month: 12, standardWorkingDays: standardWorkingDaysInMonth(2026, 12) });
    await generateFor(period);

    const result = await runMonthlyPayroll({ asOf: new Date(2027, 0, 10, 3) });

    expect(result.year).toBe(2026);
    expect(result.month).toBe(12);
    expect(result.skipped).toBe(false);
  });

  it("exempts insurance once refreshed attendance shows 14 unpaid leave days", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { runMonthlyPayroll } = await import("../jobs/runMonthlyPayroll.js");
    const { default: PayslipModel } = await import("../model/Payslip.js");
    const { default: LeaveRequestModel } = await import("../model/LeaveRequest.js");

    const employee = await makeEmployee();
    const period = await makePeriod();
    await generateFor(period);

    const before = await PayslipModel.findOne({ employee: employee._id });
    expect(before.insuranceExempt).toBe(false);
    expect(before.insuranceTotal).toBeGreaterThan(0);

    await LeaveRequestModel.create({
      employee: employee._id,
      startDate: new Date(YEAR, MONTH - 1, 1),
      endDate: new Date(YEAR, MONTH - 1, 26),
      days: 18,
      type: "unpaid",
      status: "approved",
    });

    await runMonthlyPayroll({ asOf: AS_OF });

    const after = await PayslipModel.findOne({ employee: employee._id });
    expect(after.unpaidLeaveDays).toBeGreaterThanOrEqual(14);
    expect(after.insuranceExempt).toBe(true);
    expect(after.insuranceTotal).toBe(0);
    expect(after.bhxh).toBe(0);
    expect(after.bhyt).toBe(0);
    expect(after.bhtn).toBe(0);
    expect(after.grossPay).toBe(after.netPay + after.insuranceTotal + after.pit);
  });

  it("keeps a manually overridden deduction while still refreshing day counts", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { runMonthlyPayroll } = await import("../jobs/runMonthlyPayroll.js");
    const { default: PayslipModel } = await import("../model/Payslip.js");
    const { default: LeaveRequestModel } = await import("../model/LeaveRequest.js");

    const employee = await makeEmployee();
    const period = await makePeriod();
    await generateFor(period);

    await PayslipModel.updateOne(
      { employee: employee._id },
      { deduction: 1_234_000, deductionOverridden: true },
    );

    await LeaveRequestModel.create({
      employee: employee._id,
      startDate: new Date(YEAR, MONTH - 1, 4),
      endDate: new Date(YEAR, MONTH - 1, 8),
      days: 5,
      type: "unpaid",
      status: "approved",
    });

    await runMonthlyPayroll({ asOf: AS_OF });

    const after = await PayslipModel.findOne({ employee: employee._id });
    expect(after.deduction).toBe(1_234_000);
    expect(after.unpaidLeaveDays).toBe(5);
    expect(after.autoDeduction).toBeGreaterThan(0);
    expect(after.autoDeduction).not.toBe(after.deduction);
  });

  it("adds a payslip for someone hired after the period was drafted", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { runMonthlyPayroll } = await import("../jobs/runMonthlyPayroll.js");
    const { default: PayslipModel } = await import("../model/Payslip.js");

    await makeEmployee({ name: "Early Hire" });
    const period = await makePeriod();
    await generateFor(period);
    expect(await PayslipModel.countDocuments({ period: period._id })).toBe(1);

    const lateHire = await makeEmployee({
      name: "Mid-month Hire",
      createdAt: new Date(YEAR, MONTH - 1, 15),
    });

    const result = await runMonthlyPayroll({ asOf: AS_OF });

    expect(result.added).toBe(1);
    expect(await PayslipModel.countDocuments({ period: period._id })).toBe(2);
    expect(await PayslipModel.findOne({ employee: lateHire._id })).toBeTruthy();
  });
});
