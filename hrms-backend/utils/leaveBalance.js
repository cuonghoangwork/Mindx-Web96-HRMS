/**
 * leaveBalance.js — paid-leave balance math for LeaveRequest (task 4.1) and,
 * as of Sprint 2, the late half-day deduction (task 4.2).
 *
 * Kept separate from the model/controller so the counting rules (which
 * statuses count against the balance, which days of the week count as
 * "working days") are in one place.
 */

import LeaveRequestModel from "../model/LeaveRequest.js";
import AttendanceModel from "../model/Attendance.js";
import { LEAVE_TYPES, LEAVE_TYPE_LABELS, LEAVE_TYPE_ALLOWANCES } from "../model/LeaveRequest.js";

/**
 * Sums leave days of a given type an employee has already used (or has a
 * pending request in flight for) within a given calendar year.
 *
 * Pending requests count too, not just approved ones — otherwise two
 * concurrent requests could each look like they fit under the type's cap
 * and both get approved, together blowing past it. The tradeoff is a
 * pending-but-later-rejected request temporarily depresses the visible
 * balance; acceptable since rejections are meant to be reviewed promptly.
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

/**
 * Task 4.2: each "late" day the end-of-day closer marked as consuming an
 * *Annual/PTO* half-day counts as 0.5 day against the same annual balance
 * as explicit LeaveRequests of type "annual". Counts already-closed days
 * only — the closer sets `lateHalfDayType` once per day, so this is a
 * straight count of matching Attendance records for the year, not a live
 * decision. Only the "annual" type has this extra source; other types are
 * never touched by the late-half-day rule.
 */
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

/**
 * Remaining days of a given type for an employee in a given year, floored
 * at 0. "unpaid" has no allowance entry in LEAVE_TYPE_ALLOWANCES — it's
 * uncapped, so this returns null for it without querying usage, matching
 * the "uncapped" sentinel used everywhere else (getAllBalances, the
 * balance HTTP handler, the frontend).
 */
export async function getRemainingDays(employeeId, year, type) {
  const allowance = LEAVE_TYPE_ALLOWANCES[type];
  if (allowance === undefined) return null;
  const used = await getUsedDays(employeeId, year, type);
  return Math.max(0, allowance - used);
}

/**
 * Full per-type leave balance breakdown for an employee/year, in the shape
 * the Leave tab / balance API return — one row per LEAVE_TYPES entry.
 * "unpaid" reports remaining as null (uncapped, "remaining" is meaningless).
 *
 * Unlike getUsedDays (one type at a time), this fetches every request for
 * the year in a single query and groups by type in memory — LEAVE_TYPES.map
 * calling getUsedDays per type would fire one LeaveRequestModel.find() per
 * type (5 queries) plus the attendance count (6 total) for what's really
 * one balance snapshot.
 */
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

/**
 * Counts working days (Mon–Fri) inclusive between two Date objects.
 * Does not account for company holidays yet — HolidayModel integration
 * is a reasonable Sprint 3+ follow-up once this basic version is in use.
 */
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
