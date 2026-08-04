/**
 * generateMonthlyPayrollDraft.js — tasks 3.8/3.9.
 *
 * Runs once at the start of each calendar month (registered in jobs/index.js
 * alongside closeAttendanceDay and checkPromotionEligibility):
 *   1. Get-or-create that month's VND-per-USD snapshot (utils/exchangeRate.js).
 *   2. If a PayrollPeriod for this year/month doesn't already exist, create
 *      one as a draft, tagged systemGenerated: true, and generate its
 *      payslip rows using the exact same logic the manual "create period"
 *      endpoint uses (utils/payrollGeneration.js) — just with the FX
 *      snapshot's rate instead of a manually-typed one.
 *
 * This is deliberately just a draft: it does NOT set status to "approved"
 * or "paid", and does NOT replace the 10th-of-month official run (task 3.5)
 * or manual HR adjustment (task 3.6). HR reviews/edits the draft like any
 * other period between the 1st and the 10th. If a period for the month
 * already exists (created manually, or by a previous run of this same job
 * after a restart), the job is a no-op — matches the unique {year, month}
 * index on PayrollPeriod, so this is safe to run more than once.
 */

import PayrollPeriodModel from "../model/PayrollPeriod.js";
import PayslipModel from "../model/Payslip.js";
import { standardWorkingDaysInMonth } from "../utils/payrollEngine.js";
import { buildPayslipRows, insertPayslips, periodLabel } from "../utils/payrollGeneration.js";
import { getOrCreateMonthlyFxRate } from "../utils/exchangeRate.js";
import { logAction } from "../utils/auditLog.js";
import { notifyHR } from "../controller/notificationController.js";

export async function generateMonthlyPayrollDraft({ asOf = new Date() } = {}) {
  const year = asOf.getFullYear();
  const month = asOf.getMonth() + 1;

  const existing = await PayrollPeriodModel.findOne({ year, month });
  if (existing) {
    return {
      year,
      month,
      skipped: true,
      reason: existing.systemGenerated ? "already-drafted" : "already-exists",
      periodId: String(existing._id),
      generated: 0,
    };
  }

  const fxSnapshot = await getOrCreateMonthlyFxRate({ year, month });

  let created = null;
  try {
    created = await PayrollPeriodModel.create({
      year,
      month,
      fxRate: fxSnapshot.rateVndPerUsd,
      fxRateSource: fxSnapshot.source,
      standardWorkingDays: standardWorkingDaysInMonth(year, month),
      note: `Auto-drafted at the start of the month using a ${fxSnapshot.source === "api" ? "live" : "fallback"} FX rate (${fxSnapshot.rateVndPerUsd} VND/USD).`,
      createdBy: null,
      systemGenerated: true,
    });

    const rows = await buildPayslipRows(created);
    if (!rows.length) {
      await PayrollPeriodModel.findByIdAndDelete(created._id);
      return {
        year,
        month,
        skipped: true,
        reason: "no-payable-employees",
        fxRate: fxSnapshot.rateVndPerUsd,
        fxRateSource: fxSnapshot.source,
        generated: 0,
      };
    }

    const generated = await insertPayslips(rows);

    await logAction(
      {},
      {
        action: "created",
        resource: "payroll",
        resourceId: created._id,
        label: `Payroll ${periodLabel(created)} (auto-drafted)`,
        changes: {
          fxRate: { from: null, to: fxSnapshot.rateVndPerUsd },
          fxRateSource: { from: null, to: fxSnapshot.source },
          generated: { from: 0, to: generated },
        },
      },
    );

    await notifyHR({
      title: "Monthly payroll draft ready",
      message:
        `${generated} draft payslip${generated === 1 ? "" : "s"} auto-generated for ${periodLabel(created)} ` +
        `at ${fxSnapshot.rateVndPerUsd} VND/USD (${fxSnapshot.source === "api" ? "live rate" : "fallback rate"}). ` +
        "Review before the 10th-of-month payroll run.",
      category: "payroll",
      link: "/payroll",
      linkLabel: "Review draft",
    });

    return {
      year,
      month,
      skipped: false,
      periodId: String(created._id),
      fxRate: fxSnapshot.rateVndPerUsd,
      fxRateSource: fxSnapshot.source,
      generated,
    };
  } catch (err) {
    if (created?._id) {
      await PayrollPeriodModel.findByIdAndDelete(created._id).catch(() => {});
      await PayslipModel.deleteMany({ period: created._id }).catch(() => {});
    }
    throw err;
  }
}

export default generateMonthlyPayrollDraft;
