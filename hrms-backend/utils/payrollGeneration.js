/**
 * payrollGeneration.js — the payslip-row generation logic shared between the
 * manual "create period" HTTP endpoint (payrollController.createPeriod /
 * .regenerate) and the scheduled monthly draft job
 * (jobs/generateMonthlyPayrollDraft.js, task 3.9).
 *
 * This used to live inline in payrollController.js. It was extracted so the
 * two callers can never drift apart — a period created by hand and a period
 * auto-drafted at the start of the month go through the exact same code
 * path, just with a different fxRate source (manual input / default vs. the
 * task-3.8 monthly snapshot).
 */

import PayslipModel from "../model/Payslip.js";
import EmployeeModel from "../model/Employee.js";
import AttendanceModel from "../model/Attendance.js";
import LeaveRequestModel from "../model/LeaveRequest.js";
import HolidayModel from "../model/Holiday.js";
import { autoDeductionVnd, computePayslip, seedBaseSalaryVnd } from "./payrollEngine.js";
import {
  collectAbsentKeys,
  collectLeaveKeys,
  collectOnLeaveCoverageKeys,
  groupByEmployee,
  holidayKeySet,
  monthQueryWindowUtc,
  periodEndUtc,
} from "./payrollPeriod.js";

export const PAYABLE_EMPLOYEE_STATUSES = ["active", "on-leave"];

export const periodLabel = (p) => `${p.year}-${String(p.month).padStart(2, "0")}`;

export async function loadMonthDayCounts(year, month) {
  const { lo, hi } = monthQueryWindowUtc(year, month);

  const [leaves, absences, onLeaveRows, holidays] = await Promise.all([
    LeaveRequestModel.find(
      { status: "approved", startDate: { $lte: hi }, endDate: { $gte: lo } },
      "employee startDate endDate type",
    ),
    AttendanceModel.find({ status: "absent", date: { $gte: lo, $lte: hi } }, "employee date"),
    AttendanceModel.find({ status: "on-leave", date: { $gte: lo, $lte: hi } }, "employee date"),
    HolidayModel.find({ date: { $gte: lo, $lte: hi } }, "date"),
  ]);

  const holidayKeys = holidayKeySet(holidays);
  const leavesByEmp = groupByEmployee(leaves);
  const absencesByEmp = groupByEmployee(absences);
  const onLeaveByEmp = groupByEmployee(onLeaveRows);

  return (employeeId) => {
    const id = String(employeeId);
    const rows = leavesByEmp.get(id) ?? [];

    const unpaidSet = collectLeaveKeys(
      rows.filter((r) => r.type === "unpaid"),
      year,
      month,
      holidayKeys,
    );

    const leaveCovered = collectLeaveKeys(rows, year, month, holidayKeys);
    for (const key of collectOnLeaveCoverageKeys(onLeaveByEmp.get(id) ?? [], year, month)) {
      leaveCovered.add(key);
    }

    const absentSet = collectAbsentKeys(absencesByEmp.get(id) ?? [], year, month, leaveCovered);

    return { unpaidLeaveDays: unpaidSet.size, absentDays: absentSet.size };
  };
}

export async function buildPayslipRows(period) {
  const employees = await EmployeeModel.find(
    {
      status: { $in: PAYABLE_EMPLOYEE_STATUSES },
      createdAt: { $lte: periodEndUtc(period.year, period.month) },
    },
    "employeeId name department designation contractType annualSalary",
  ).populate("department", "name");

  if (!employees.length) return [];

  const dayCountsFor = await loadMonthDayCounts(period.year, period.month);

  return employees.map((emp) => {
    const baseSalary = seedBaseSalaryVnd(emp.annualSalary, period.fxRate);
    const { unpaidLeaveDays, absentDays } = dayCountsFor(emp._id);
    const autoDeduction = autoDeductionVnd({
      baseSalary,
      bonus: 0,
      allowance: 0,
      unpaidLeaveDays,
      absentDays,
      standardWorkingDays: period.standardWorkingDays,
    });

    return {
      period: period._id,
      employee: emp._id,
      employeeCode: emp.employeeId ?? "",
      employeeName: emp.name ?? "",
      departmentId: emp.department?._id ?? null,
      departmentName: emp.department?.name ?? null,
      designation: emp.designation ?? null,
      contractType: emp.contractType ?? null,
      annualSalaryUsd: emp.annualSalary ?? 0,
      unpaidLeaveDays,
      absentDays,
      autoDeduction,
      deductionOverridden: false,
      ...computePayslip({
        baseSalary,
        bonus: 0,
        allowance: 0,
        deduction: autoDeduction,
        unpaidDays: unpaidLeaveDays + absentDays,
      }),
    };
  });
}

export async function insertPayslips(rows) {
  if (!rows.length) return 0;
  try {
    const inserted = await PayslipModel.insertMany(rows, { ordered: false });
    return inserted.length;
  } catch (err) {
    const isDuplicateOnly =
      err?.code === 11000 ||
      (Array.isArray(err?.writeErrors) &&
        err.writeErrors.length > 0 &&
        err.writeErrors.every((w) => (w?.err?.code ?? w?.code) === 11000));
    if (!isDuplicateOnly) throw err;
    return err.result?.insertedCount ?? err.insertedDocs?.length ?? 0;
  }
}
