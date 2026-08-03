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
import { PAID_LEAVE_DAYS_PER_YEAR } from "../model/LeaveRequest.js";

/**
 * Sums "paid"-type leave days an employee has already used (or has a
 * pending request in flight for) within a given calendar year.
 *
 * Pending requests count too, not just approved ones — otherwise two
 * concurrent requests could each look like they fit under the 12-day cap
 * and both get approved, together blowing past it. The tradeoff is a
 * pending-but-later-rejected request temporarily depresses the visible
 * balance; acceptable since rejections are meant to be reviewed promptly.
 */
export async function getUsedPaidDaysFromRequests(employeeId, year) {
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
  const requests = await LeaveRequestModel.find({
    employee: employeeId,
    type: "paid",
    status: { $in: ["pending", "approved"] },
    startDate: { $gte: start, $lte: end },
  });
  return requests.reduce((sum, r) => sum + r.days, 0);
}

/**
 * Task 4.2: each "late" day the end-of-day closer marked as consuming a
 * *paid* half-day counts as 0.5 day against the same 12-day annual balance
 * as explicit LeaveRequests. Counts already-closed days only — the closer
 * sets `lateHalfDayType` once per day, so this is a straight count of
 * matching Attendance records for the year, not a live decision.
 */
export async function getLateHalfDayPaidDays(employeeId, year) {
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
  const count = await AttendanceModel.countDocuments({
    employee: employeeId,
    date: { $gte: start, $lte: end },
    lateHalfDayType: "paid",
  });
  return count * 0.5;
}

/** Total paid-leave days used this year: formal LeaveRequests + late half-days. */
export async function getUsedPaidDays(employeeId, year) {
  const [fromRequests, fromLateHalfDays] = await Promise.all([
    getUsedPaidDaysFromRequests(employeeId, year),
    getLateHalfDayPaidDays(employeeId, year),
  ]);
  return fromRequests + fromLateHalfDays;
}

/** Remaining paid-leave days for an employee in a given year, floored at 0. */
export async function getRemainingPaidDays(employeeId, year) {
  const used = await getUsedPaidDays(employeeId, year);
  return Math.max(0, PAID_LEAVE_DAYS_PER_YEAR - used);
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
