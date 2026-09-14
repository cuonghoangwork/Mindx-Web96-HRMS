/** Leave balance math (DECISIONS.md D3) — the counting rules in one place. */

import LeaveRequestModel from "../model/LeaveRequest.js";
import AttendanceModel from "../model/Attendance.js";
import { LEAVE_TYPES, LEAVE_TYPE_LABELS, LEAVE_TYPE_ALLOWANCES } from "../model/LeaveRequest.js";

/**
 * Days of `type` used (or pending) in the calendar year. Pending counts, so
 * two concurrent requests cannot both fit under the cap; a later rejection
 * temporarily depressed the visible balance, which is acceptable.
 */
export async function getUsedDaysFromRequests(employeeId, year, type) {
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
  const requests = await LeaveRequestModel.find({
    employee: employeeId,
    type,
    status: { $in: ["pending", "approved"] },
    startDate: { $gte: start, $lte: end },
  });
  return requests.reduce((sum, r) => sum + r.days, 0);
}

/** Late days the close job charged to annual leave, at 0.5 each (D4). Only "annual" has this extra source. */
export async function getLateHalfDayAnnualDays(employeeId, year) {
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
  const count = await AttendanceModel.countDocuments({
    employee: employeeId,
    date: { $gte: start, $lte: end },
    lateHalfDayType: "annual",
  });
  return count * 0.5;
}

/** Total leave days of a given type used this year: LeaveRequests + (for "annual" only) late half-days. */
export async function getUsedDays(employeeId, year, type) {
  const [fromRequests, fromLateHalfDays] = await Promise.all([
    getUsedDaysFromRequests(employeeId, year, type),
    type === "annual" ? getLateHalfDayAnnualDays(employeeId, year) : Promise.resolve(0),
  ]);
  return fromRequests + fromLateHalfDays;
}

/** Remaining days, floored at 0; null for an uncapped type ("unpaid"). */
export async function getRemainingDays(employeeId, year, type) {
  const allowance = LEAVE_TYPE_ALLOWANCES[type];
  if (allowance === undefined) return null;
  const used = await getUsedDays(employeeId, year, type);
  return Math.max(0, allowance - used);
}

/** One row per LEAVE_TYPES entry for the Leave tab / balance API — two queries, grouped in memory. */
export async function getAllBalances(employeeId, year) {
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
  const [requests, lateHalfDayCount] = await Promise.all([
    LeaveRequestModel.find({
      employee: employeeId,
      status: { $in: ["pending", "approved"] },
      startDate: { $gte: start, $lte: end },
    }),
    AttendanceModel.countDocuments({
      employee: employeeId,
      date: { $gte: start, $lte: end },
      lateHalfDayType: "annual",
    }),
  ]);

  const usedByType = new Map();
  for (const r of requests) {
    usedByType.set(r.type, (usedByType.get(r.type) ?? 0) + r.days);
  }
  usedByType.set("annual", (usedByType.get("annual") ?? 0) + lateHalfDayCount * 0.5);

  return LEAVE_TYPES.map((type) => {
    const allowance = LEAVE_TYPE_ALLOWANCES[type];
    const used = usedByType.get(type) ?? 0;
    return {
      type,
      label: LEAVE_TYPE_LABELS[type],
      accrued: allowance === undefined ? null : allowance,
      used,
      remaining: allowance === undefined ? null : Math.max(0, allowance - used),
    };
  });
}

/** Inclusive Mon–Fri count. Does not subtract holidays. */
export function countWorkingDays(startDate, endDate) {
  let count = 0;
  const cur = new Date(startDate);
  cur.setHours(0, 0, 0, 0);
  const last = new Date(endDate);
  last.setHours(0, 0, 0, 0);
  while (cur <= last) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) count += 1;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}
