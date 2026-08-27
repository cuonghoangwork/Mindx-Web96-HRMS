import PayrollPeriodModel from "../model/PayrollPeriod.js";
import PayslipModel from "../model/Payslip.js";
import NotificationModel from "../model/Notification.js";
import { autoDeductionVnd, computePayslip } from "../utils/payrollEngine.js";
import {
  buildPayslipRows,
  insertPayslips,
  loadMonthDayCounts,
  periodLabel,
} from "../utils/payrollGeneration.js";
import { logAction } from "../utils/auditLog.js";
import { notifyHR } from "../controller/notificationController.js";

export function targetMonthOf(asOf) {
  const d = new Date(asOf.getFullYear(), asOf.getMonth() - 1, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

async function refreshDayCounts(period) {
  const dayCountsFor = await loadMonthDayCounts(period.year, period.month);
  const payslips = await PayslipModel.find({ period: period._id });

  for (const payslip of payslips) {
    const { unpaidLeaveDays, absentDays } = dayCountsFor(payslip.employee);
    const autoDeduction = autoDeductionVnd({
      baseSalary: payslip.baseSalary,
      bonus: payslip.bonus,
      allowance: payslip.allowance,
      unpaidLeaveDays,
      absentDays,
      standardWorkingDays: period.standardWorkingDays,
    });
    const deduction = payslip.deductionOverridden ? payslip.deduction : autoDeduction;

    payslip.unpaidLeaveDays = unpaidLeaveDays;
    payslip.absentDays = absentDays;
    payslip.autoDeduction = autoDeduction;
    Object.assign(
      payslip,
      computePayslip({
        baseSalary: payslip.baseSalary,
        bonus: payslip.bonus,
        allowance: payslip.allowance,
        deduction,
        unpaidDays: unpaidLeaveDays + absentDays,
      }),
    );
    await payslip.save();
  }

  return payslips.length;
}

export async function runMonthlyPayroll({ asOf = new Date() } = {}) {
  const { year, month } = targetMonthOf(asOf);
  const label = `${year}-${String(month).padStart(2, "0")}`;

  const period = await PayrollPeriodModel.findOne({ year, month });
  if (!period) {
    await notifyHR({
      title: "Monthly payroll run skipped",
      message: `No payroll period exists for ${label}. Create it before payroll can be run for that month.`,
      titleKey: "monthlyPayrollRunSkipped",
      messageKey: "monthlyPayrollRunSkippedNoPeriod",
      params: { monthLabel: label },
      category: "payroll",
      link: "/payroll",
      linkLabel: "Open payroll",
    });
    return { year, month, skipped: true, reason: "no-period", refreshed: 0, added: 0 };
  }

  if (period.status === "paid") {
    return {
      year,
      month,
      skipped: true,
      reason: "already-paid",
      periodId: String(period._id),
      refreshed: 0,
      added: 0,
    };
  }

  let added = 0;
  let refreshed = 0;

  if (period.status === "draft") {
    added = await insertPayslips(await buildPayslipRows(period));
  }

  const payslipCount = await PayslipModel.countDocuments({ period: period._id });
  if (!payslipCount) {
    await notifyHR({
      title: "Monthly payroll run skipped",
      message: `The ${label} payroll period has no payslips, so it was not paid.`,
      titleKey: "monthlyPayrollRunSkipped",
      messageKey: "monthlyPayrollRunSkippedNoPayslips",
      params: { monthLabel: label },
      category: "payroll",
      link: "/payroll",
      linkLabel: "Open payroll",
    });
    return {
      year,
      month,
      skipped: true,
      reason: "no-payslips",
      periodId: String(period._id),
      refreshed: 0,
      added,
    };
  }

  const from = period.status;
  if (from === "draft") {
    refreshed = await refreshDayCounts(period);
    period.status = "approved";
    period.approvedBy = null;
    period.approvedAt = new Date();
  }

  period.status = "paid";
  period.paidBy = null;
  period.paidAt = new Date();
  await period.save();

  await logAction(
    {},
    {
      action: "status_changed",
      resource: "payroll",
      resourceId: period._id,
      label: `Payroll ${periodLabel(period)} paid by the monthly run`,
      changes: {
        status: { from, to: "paid" },
        payslips: { from: 0, to: payslipCount },
        refreshed: { from: 0, to: refreshed },
        added: { from: 0, to: added },
      },
    },
  );

  await NotificationModel.create({
    user: null,
    audience: "all",
    category: "payroll",
    title: "Payroll paid",
    message: `${periodLabel(period)} payroll has been paid.`,
    titleKey: "payrollPaid",
    messageKey: "payrollPaid",
    params: { periodLabel: periodLabel(period) },
    link: null,
    isCustom: false,
  });

  return {
    year,
    month,
    skipped: false,
    reason: null,
    periodId: String(period._id),
    payslipCount,
    refreshed,
    added,
  };
}

export default runMonthlyPayroll;
