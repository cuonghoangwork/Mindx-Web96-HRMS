import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import supertest from "supertest";
import bcrypt from "bcryptjs";
import { startDb, stopDb, clearDb, createApp, seedAdminAndLogin } from "./testHelpers.js";
import { standardWorkingDaysInMonth } from "../utils/payrollEngine.js";

let dbAvailable = false;
let app;
let request;
let token;

const YEAR = 2026;
const MONTH = 5;

beforeAll(async () => {
  try {
    await startDb();
    dbAvailable = true;
  } catch (err) {
    console.warn(`[payrollAdjustment.integration] MongoDB unavailable — skipping.\n${err.message}`);
    return;
  }
  app = await createApp();
  request = supertest(app);
});

afterAll(async () => {
  await stopDb();
});

beforeEach(async () => {
  if (!dbAvailable) return;
  await clearDb();
  ({ token } = await seedAdminAndLogin(app));
});

const auth = () => ({ Authorization: `Bearer ${token}` });

async function seedDraftPayslip({ createdAt = new Date(YEAR, MONTH - 1, 1) } = {}) {
  const { default: EmployeeModel } = await import("../model/Employee.js");
  const { default: PayrollPeriodModel } = await import("../model/PayrollPeriod.js");
  const { buildPayslipRows, insertPayslips } = await import("../utils/payrollGeneration.js");
  const { default: PayslipModel } = await import("../model/Payslip.js");

  const employee = await EmployeeModel.create({
    employeeId: "EMP500",
    name: "Payslip Owner",
    email: "owner@hrms.com",
    status: "active",
    annualSalary: 24000,
    contractType: "full-time",
  });
  await EmployeeModel.collection.updateOne({ _id: employee._id }, { $set: { createdAt } });

  const period = await PayrollPeriodModel.create({
    year: YEAR,
    month: MONTH,
    fxRate: 25000,
    standardWorkingDays: standardWorkingDaysInMonth(YEAR, MONTH),
    status: "draft",
  });
  await insertPayslips(await buildPayslipRows(period));

  return { employee, period, payslip: await PayslipModel.findOne({ period: period._id }) };
}

async function employeeToken() {
  const { default: UserModel } = await import("../model/User.js");
  await UserModel.create({
    email: "staff@hrms.com",
    password: bcrypt.hashSync("staffpass1", 10),
    name: "Staff",
    role: "EMPLOYEE",
  });
  const res = await request
    .post("/api/v1/auth/login")
    .send({ email: "staff@hrms.com", password: "staffpass1" });
  return res.body.data?.access_token;
}

describe("PATCH /payroll/payslips/:id — manual adjustment", () => {
  it("rejects an adjustment with no reason", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { payslip } = await seedDraftPayslip();

    const res = await request
      .patch(`/api/v1/payroll/payslips/${payslip._id}`)
      .set(auth())
      .send({ bonus: 3_000_000 });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Adjustment reason is required");
  });

  it("rejects a non-string reason with 400 rather than a 500", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { payslip } = await seedDraftPayslip();

    const res = await request
      .patch(`/api/v1/payroll/payslips/${payslip._id}`)
      .set(auth())
      .send({ bonus: 3_000_000, reason: 42 });

    expect(res.status).toBe(400);
  });

  it("applies the adjustment and records real before/after values plus the reason", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { payslip } = await seedDraftPayslip();
    const { default: AuditLogModel } = await import("../model/AuditLog.js");
    const originalBase = payslip.baseSalary;

    const res = await request
      .patch(`/api/v1/payroll/payslips/${payslip._id}`)
      .set(auth())
      .send({ bonus: 3_000_000, reason: "Q2 performance bonus approved by the board" });

    expect(res.status).toBe(200);
    expect(res.body.data.bonus).toBe(3_000_000);

    const entry = await AuditLogModel.findOne({ resource: "payroll", action: "updated" });
    expect(entry).toBeTruthy();
    expect(entry.changes.bonus).toEqual({ from: 0, to: 3_000_000 });
    expect(entry.changes.reason.to).toBe("Q2 performance bonus approved by the board");
    expect(entry.changes.baseSalary).toBeUndefined();
    expect(originalBase).toBeGreaterThan(0);
  });

  it("rejects an adjustment once the period leaves draft", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { payslip, period } = await seedDraftPayslip();
    period.status = "approved";
    await period.save();

    const res = await request
      .patch(`/api/v1/payroll/payslips/${payslip._id}`)
      .set(auth())
      .send({ bonus: 1_000_000, reason: "Too late" });

    expect(res.status).toBe(409);
  });

  it("keeps insurance at zero when adjusting an exempt payslip", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { employee, period } = await seedDraftPayslip();
    const { default: LeaveRequestModel } = await import("../model/LeaveRequest.js");
    const { default: PayslipModel } = await import("../model/Payslip.js");

    await LeaveRequestModel.create({
      employee: employee._id,
      startDate: new Date(YEAR, MONTH - 1, 1),
      endDate: new Date(YEAR, MONTH - 1, 26),
      days: 18,
      type: "unpaid",
      status: "approved",
    });
    await PayslipModel.deleteMany({ period: period._id });
    const { buildPayslipRows, insertPayslips } = await import("../utils/payrollGeneration.js");
    await insertPayslips(await buildPayslipRows(period));

    const payslip = await PayslipModel.findOne({ period: period._id });
    expect(payslip.insuranceExempt).toBe(true);

    const res = await request
      .patch(`/api/v1/payroll/payslips/${payslip._id}`)
      .set(auth())
      .send({ allowance: 500_000, reason: "Travel allowance" });

    expect(res.status).toBe(200);
    expect(res.body.data.insuranceExempt).toBe(true);
    expect(res.body.data.insuranceTotal).toBe(0);
    expect(res.body.data.grossPay).toBe(
      res.body.data.netPay + res.body.data.insuranceTotal + res.body.data.pit,
    );
  });
});

describe("POST /payroll/payslips/:id/recompute-deduction", () => {
  it("recomputes from live attendance instead of failing on a missing import", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { employee, payslip } = await seedDraftPayslip();
    const { default: LeaveRequestModel } = await import("../model/LeaveRequest.js");

    await LeaveRequestModel.create({
      employee: employee._id,
      startDate: new Date(YEAR, MONTH - 1, 4),
      endDate: new Date(YEAR, MONTH - 1, 8),
      days: 5,
      type: "unpaid",
      status: "approved",
    });

    const res = await request
      .post(`/api/v1/payroll/payslips/${payslip._id}/recompute-deduction`)
      .set(auth());

    expect(res.status).toBe(200);
    expect(res.body.data.unpaidLeaveDays).toBe(5);
    expect(res.body.data.deduction).toBeGreaterThan(0);
    expect(res.body.data.deductionOverridden).toBe(false);
  });
});

describe("GET /audit-log/recent — salary amounts must not leak", () => {
  it("omits changes for every reader, including an EMPLOYEE", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { payslip } = await seedDraftPayslip();

    await request
      .patch(`/api/v1/payroll/payslips/${payslip._id}`)
      .set(auth())
      .send({ baseSalary: 99_000_000, reason: "Board-approved raise" });

    const staffToken = await employeeToken();
    const res = await request
      .get("/api/v1/audit-log/recent")
      .set("Authorization", `Bearer ${staffToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    for (const item of res.body.items) {
      expect(item.changes).toBeUndefined();
    }
    expect(JSON.stringify(res.body)).not.toContain("99000000");
  });

  it("still serves changes to an ADMIN on the full audit-log route", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { payslip } = await seedDraftPayslip();

    await request
      .patch(`/api/v1/payroll/payslips/${payslip._id}`)
      .set(auth())
      .send({ baseSalary: 99_000_000, reason: "Board-approved raise" });

    const res = await request.get("/api/v1/audit-log?resource=payroll").set(auth());

    expect(res.status).toBe(200);
    const entry = res.body.items.find((i) => i.action === "updated");
    expect(entry.changes.baseSalary.to).toBe(99_000_000);
    expect(entry.changes.reason.to).toBe("Board-approved raise");
  });
});
/* ══════════════════════════════════════════════════
   Attendance Overtime (M5) — overtime must survive every recompute path.

   computePayslip returns a COMPLETE payslip, so any call site that forgets to
   pass overtimePay writes a zero over the stored figure. There are four such
   call sites; two of them are these HR edit paths, and neither has any reason
   to be thinking about overtime. Nothing errors when it goes wrong — the
   employee is just quietly not paid for hours their manager already approved.
══════════════════════════════════════════════════ */
describe("payslip recompute paths preserve overtime (M5)", () => {
  const OT_MINUTES = 240; // 4h on a working day
  const OT_DATE = new Date(Date.UTC(YEAR, MONTH - 1, 12));

  /** A draft payslip whose employee worked one approved 4h weekday overtime. */
  async function seedWithOvertime() {
    const { default: EmployeeModel } = await import("../model/Employee.js");
    const { default: AttendanceModel } = await import("../model/Attendance.js");
    const { default: PayrollPeriodModel } = await import("../model/PayrollPeriod.js");
    const { buildPayslipRows, insertPayslips } = await import("../utils/payrollGeneration.js");
    const { default: PayslipModel } = await import("../model/Payslip.js");

    const employee = await EmployeeModel.create({
      employeeId: "EMP501",
      name: "Overtime Worker",
      email: "ot@hrms.com",
      status: "active",
      annualSalary: 24000,
      contractType: "full-time",
    });
    await EmployeeModel.collection.updateOne(
      { _id: employee._id },
      { $set: { createdAt: new Date(YEAR, MONTH - 1, 1) } },
    );

    await AttendanceModel.create({
      employee: employee._id,
      date: OT_DATE,
      checkIn: "09:00",
      checkOut: "22:00",
      status: "present",
      otMinutes: OT_MINUTES,
      otNightMinutes: 0,
      otDayType: "normal",
      otEvidence: "planned",
    });

    const period = await PayrollPeriodModel.create({
      year: YEAR,
      month: MONTH,
      fxRate: 25000,
      standardWorkingDays: standardWorkingDaysInMonth(YEAR, MONTH),
      status: "draft",
    });
    await insertPayslips(await buildPayslipRows(period));

    return {
      employee,
      period,
      payslip: await PayslipModel.findOne({ period: period._id, employee: employee._id }),
    };
  }

  it("prices the month's approved overtime onto the draft payslip", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { payslip } = await seedWithOvertime();

    expect(payslip.overtimeHours).toBe(4);
    expect(payslip.overtimePay).toBeGreaterThan(0);
    expect(payslip.overtimeBreakdown.normal.dayMinutes).toBe(OT_MINUTES);
    // In gross, out of the insurance base.
    expect(payslip.grossPay).toBe(payslip.baseSalary + payslip.overtimePay);
  });

  it("keeps the overtime when HR adjusts an unrelated field", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { payslip } = await seedWithOvertime();
    const before = payslip.overtimePay;
    expect(before).toBeGreaterThan(0);

    const res = await request
      .patch(`/api/v1/payroll/payslips/${payslip._id}`)
      .set(auth())
      .send({ bonus: 1_000_000, reason: "Spot bonus" });

    expect(res.status).toBe(200);
    // The bug this pins: a bonus nudge silently zeroing the overtime.
    expect(res.body.data.overtimePay).toBe(before);
    expect(res.body.data.grossPay).toBe(res.body.data.baseSalary + 1_000_000 + before);
  });

  it("keeps the overtime when the deduction is recomputed", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { payslip } = await seedWithOvertime();
    const before = payslip.overtimePay;

    const res = await request
      .post(`/api/v1/payroll/payslips/${payslip._id}/recompute-deduction`)
      .set(auth());

    expect(res.status).toBe(200);
    expect(res.body.data.overtimePay).toBe(before);
  });

  it("never lets overtime raise the insurance base, even when the clamp binds", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { payslip } = await seedWithOvertime();

    // A deduction big enough to push gross-excluding-overtime below
    // base + allowance, so Math.min(base + allo, grossExOt) is the binding
    // constraint — the exact shape where clamping against the full gross would
    // smuggle overtime into the insurance base.
    const res = await request
      .patch(`/api/v1/payroll/payslips/${payslip._id}`)
      .set(auth())
      .send({ deduction: payslip.baseSalary - 1_000_000, reason: "Unpaid leave correction" });

    expect(res.status).toBe(200);
    expect(res.body.data.overtimePay).toBeGreaterThan(0);
    expect(res.body.data.insuranceBase).toBe(1_000_000);
    expect(res.body.data.insuranceBase).toBeLessThan(res.body.data.grossPay);
  });

  it("exposes the payslip line's segments to the client", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { period } = await seedWithOvertime();

    const res = await request.get(`/api/v1/payroll/periods/${period._id}/payslips`).set(auth());
    expect(res.status).toBe(200);

    const slip = res.body.items.find((i) => i.employeeCode === "EMP501");
    expect(slip.overtimeHours).toBe(4);
    expect(slip.overtimeTaxExempt).toBe(true);
    expect(slip.overtimeSegments).toEqual([
      expect.objectContaining({ percent: 150, hours: 4, night: false }),
    ]);
  });
});
