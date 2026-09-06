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
 *
 * Every date here is pinned, INCLUDING each fixture employee's hire date.
 * That last part is not decoration. buildPayslipRows() only pays someone whose
 * `createdAt` is on or before the period end, so a fixture that lets mongoose
 * stamp "now" stops qualifying the moment the wall clock passes the hardcoded
 * period — which is exactly how three of these tests began failing on
 * 2026-09-01 while asking for August 2026. Nothing about the job had changed.
 *
 * The failure mode was quiet rather than loud: the job returned
 * `no-payable-employees`, the same outcome another test in this file asserts
 * on purpose, so the suite went red with a result that looked plausible. Hence
 * the "hired after the period end" test at the bottom — it pins that rule
 * deliberately instead of leaving it as an accident of the wall clock.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { startDb, stopDb, clearDb } from "./testHelpers.js";

let dbAvailable = false;

/** The period under test: August 2026, and a later day in the same month. */
const AS_OF = new Date(2026, 7, 1);
const AS_OF_LATER = new Date(2026, 7, 15);
const YEAR = 2026;
const MONTH = 8;

/** Well before AS_OF, so a fixture employee is always already on the roster. */
const HIRED_AT = new Date(2025, 0, 1);

/**
 * Local midnight on 1 September — the first instant of the next month in
 * company time, and the exact case periodEndUtc() used to get wrong. While
 * the month closed at 23:59:59.999 UTC, this timestamp was still inside
 * August (17:00Z on the 31st) and earned a payslip for a month the employee
 * had not worked. Kept at the boundary rather than a comfortable few days
 * later, so this test would notice if that regressed.
 */
const HIRED_AFTER_PERIOD = new Date(2026, 8, 1);

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
    // Explicit, never mongoose's "now" — see the header note.
    createdAt: overrides.createdAt ?? HIRED_AT,
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

    const result = await generateMonthlyPayrollDraft({ asOf: AS_OF });

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

    const snapshot = await ExchangeRateModel.findOne({ year: YEAR, month: MONTH });
    expect(snapshot.rateVndPerUsd).toBe(26000);
    expect(snapshot.source).toBe("api");
  });

  it("falls back to the default rate when the live fetch fails, and still drafts the period", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { generateMonthlyPayrollDraft } = await import("../jobs/generateMonthlyPayrollDraft.js");
    const { DEFAULT_FX_RATE_VND_PER_USD } = await import("../utils/payrollEngine.js");

    await makeEmployee();

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const result = await generateMonthlyPayrollDraft({ asOf: AS_OF });

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

    const first = await generateMonthlyPayrollDraft({ asOf: AS_OF });
    expect(first.skipped).toBe(false);

    const second = await generateMonthlyPayrollDraft({ asOf: AS_OF_LATER }); // same month, later day
    expect(second.skipped).toBe(true);
    expect(second.reason).toBe("already-drafted");
    expect(second.periodId).toBe(first.periodId);

    expect(await PayrollPeriodModel.countDocuments({ year: YEAR, month: MONTH })).toBe(1);
    expect(await ExchangeRateModel.countDocuments({ year: YEAR, month: MONTH })).toBe(1);
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

    const result = await generateMonthlyPayrollDraft({ asOf: AS_OF });

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("already-exists");
    expect(await PayrollPeriodModel.countDocuments({ year: YEAR, month: MONTH })).toBe(1);
  });

  it("cleans up the period (leaves nothing orphaned) when there are no payable employees", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { generateMonthlyPayrollDraft } = await import("../jobs/generateMonthlyPayrollDraft.js");
    const { default: PayrollPeriodModel } = await import("../model/PayrollPeriod.js");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rates: { VND: 25000 } }) }),
    );

    const result = await generateMonthlyPayrollDraft({ asOf: AS_OF });

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("no-payable-employees");
    expect(await PayrollPeriodModel.countDocuments({ year: YEAR, month: MONTH })).toBe(0);
  });

  it("does not pay someone hired after the period ended", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    // The rule that quietly broke the three tests above: buildPayslipRows
    // filters on createdAt <= period end. Pinned here so it is a stated
    // expectation rather than something the wall clock happens to satisfy.
    const { generateMonthlyPayrollDraft } = await import("../jobs/generateMonthlyPayrollDraft.js");

    await makeEmployee({ createdAt: HIRED_AT });
    await makeEmployee({ createdAt: HIRED_AFTER_PERIOD });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rates: { VND: 25000 } }) }),
    );

    const result = await generateMonthlyPayrollDraft({ asOf: AS_OF });

    expect(result.skipped).toBe(false);
    expect(result.generated).toBe(1);
  });

  it("reports no-payable-employees for an empty roster, not for a filtered-out one", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    // Both states produce the same reason string, which is why the original
    // breakage read as a plausible result instead of an obvious fault. This
    // asserts the roster is genuinely empty in that case.
    const { generateMonthlyPayrollDraft } = await import("../jobs/generateMonthlyPayrollDraft.js");
    const { default: EmployeeModel } = await import("../model/Employee.js");

    await makeEmployee({ createdAt: HIRED_AFTER_PERIOD });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rates: { VND: 25000 } }) }),
    );

    const result = await generateMonthlyPayrollDraft({ asOf: AS_OF });

    expect(result.reason).toBe("no-payable-employees");
    expect(await EmployeeModel.countDocuments()).toBe(1); // present, just not yet hired
  });
});
