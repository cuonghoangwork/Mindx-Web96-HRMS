/**
 * generateMonthlyPayrollDraft.integration.test.js — tasks 3.8/3.9.
 *
 * Covers jobs/generateMonthlyPayrollDraft.js and the ExchangeRate side of
 * utils/exchangeRate.js end-to-end against a real (in-memory) database:
 *   - First run of the month fetches (or falls back) an FX rate, persists
 *     one ExchangeRate snapshot, and creates a draft PayrollPeriod +
 *     Payslip rows priced off that snapshot.
 *   - A second run for the same month is a no-op (idempotent) and does not
 *     create a second ExchangeRate snapshot or PayrollPeriod.
 *   - A manually-created period for the month makes the job skip cleanly.
 *   - A month with no payable employees cleans up after itself (no orphan
 *     PayrollPeriod/ExchangeRate left with zero payslips).
 *
 * Uses the same in-memory MongoDB harness as
 * checkPromotionEligibility.integration.test.js / closeAttendanceDay.integration.test.js.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { startDb, stopDb, clearDb } from "./testHelpers.js";

let dbAvailable = false;

beforeAll(async () => {
  try {
    await startDb();
    dbAvailable = true;
  } catch (err) {
    console.warn(`[generateMonthlyPayrollDraft.integration] MongoDB unavailable — skipping.\n${err.message}`);
  }
});

afterAll(async () => {
  await stopDb();
});

beforeEach(async () => {
  if (dbAvailable) await clearDb();
  vi.restoreAllMocks();
});

async function makeEmployee(overrides = {}) {
  const { default: EmployeeModel } = await import("../model/Employee.js");
  return EmployeeModel.create({
    employeeId: overrides.employeeId ?? `EMP${Math.floor(Math.random() * 100000)}`,
    name: overrides.name ?? "Test Employee",
    email: overrides.email ?? `test${Math.random()}@hrms.com`,
    status: overrides.status ?? "active",
    annualSalary: overrides.annualSalary ?? 12000,
    contractType: overrides.contractType ?? "full-time",
    ...overrides,
  });
}

describe("generateMonthlyPayrollDraft (tasks 3.8/3.9)", () => {
  it("fetches a live FX rate, drafts a period, and generates payslips", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { generateMonthlyPayrollDraft } = await import("../jobs/generateMonthlyPayrollDraft.js");
    const { default: PayrollPeriodModel } = await import("../model/PayrollPeriod.js");
    const { default: PayslipModel } = await import("../model/Payslip.js");
    const { default: ExchangeRateModel } = await import("../model/ExchangeRate.js");

    await makeEmployee({ annualSalary: 12000 });
    await makeEmployee({ annualSalary: 24000 });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rates: { VND: 26000 } }) }),
    );

    const result = await generateMonthlyPayrollDraft({ asOf: new Date(2026, 7, 1) }); // Aug 2026

    expect(result.skipped).toBe(false);
    expect(result.fxRate).toBe(26000);
    expect(result.fxRateSource).toBe("api");
    expect(result.generated).toBe(2);

    const period = await PayrollPeriodModel.findById(result.periodId);
    expect(period.status).toBe("draft");
    expect(period.systemGenerated).toBe(true);
    expect(period.createdBy).toBeNull();
    expect(period.fxRate).toBe(26000);

    const payslips = await PayslipModel.find({ period: period._id });
    expect(payslips).toHaveLength(2);

    const snapshot = await ExchangeRateModel.findOne({ year: 2026, month: 8 });
    expect(snapshot.rateVndPerUsd).toBe(26000);
    expect(snapshot.source).toBe("api");
  });

  it("falls back to the default rate when the live fetch fails, and still drafts the period", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { generateMonthlyPayrollDraft } = await import("../jobs/generateMonthlyPayrollDraft.js");
    const { DEFAULT_FX_RATE_VND_PER_USD } = await import("../utils/payrollEngine.js");

    await makeEmployee();

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const result = await generateMonthlyPayrollDraft({ asOf: new Date(2026, 7, 1) });

    expect(result.skipped).toBe(false);
    expect(result.fxRate).toBe(DEFAULT_FX_RATE_VND_PER_USD);
    expect(result.fxRateSource).toBe("fallback");
  });

  it("is idempotent - a second run the same month does not duplicate the snapshot or the period", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { generateMonthlyPayrollDraft } = await import("../jobs/generateMonthlyPayrollDraft.js");
    const { default: PayrollPeriodModel } = await import("../model/PayrollPeriod.js");
    const { default: ExchangeRateModel } = await import("../model/ExchangeRate.js");

    await makeEmployee();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rates: { VND: 25500 } }) }),
    );

    const first = await generateMonthlyPayrollDraft({ asOf: new Date(2026, 7, 1) });
    expect(first.skipped).toBe(false);

    const second = await generateMonthlyPayrollDraft({ asOf: new Date(2026, 7, 15) }); // same month, later day
    expect(second.skipped).toBe(true);
    expect(second.reason).toBe("already-drafted");
    expect(second.periodId).toBe(first.periodId);

    expect(await PayrollPeriodModel.countDocuments({ year: 2026, month: 8 })).toBe(1);
    expect(await ExchangeRateModel.countDocuments({ year: 2026, month: 8 })).toBe(1);
  });

  it("skips cleanly if HR already manually created a period for the month", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { generateMonthlyPayrollDraft } = await import("../jobs/generateMonthlyPayrollDraft.js");
    const { default: PayrollPeriodModel } = await import("../model/PayrollPeriod.js");
    const { default: UserModel } = await import("../model/User.js");

    const admin = await UserModel.create({
      email: "admin@hrms.com",
      password: "hash",
      name: "Admin",
      role: "ADMIN",
    });
    await PayrollPeriodModel.create({
      year: 2026,
      month: 8,
      fxRate: 25000,
      standardWorkingDays: 21,
      createdBy: admin._id,
    });

    const result = await generateMonthlyPayrollDraft({ asOf: new Date(2026, 7, 1) });

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("already-exists");
    expect(await PayrollPeriodModel.countDocuments({ year: 2026, month: 8 })).toBe(1);
  });

  it("cleans up the period (leaves nothing orphaned) when there are no payable employees", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { generateMonthlyPayrollDraft } = await import("../jobs/generateMonthlyPayrollDraft.js");
    const { default: PayrollPeriodModel } = await import("../model/PayrollPeriod.js");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rates: { VND: 25000 } }) }),
    );

    const result = await generateMonthlyPayrollDraft({ asOf: new Date(2026, 7, 1) });

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("no-payable-employees");
    expect(await PayrollPeriodModel.countDocuments({ year: 2026, month: 8 })).toBe(0);
  });
});
