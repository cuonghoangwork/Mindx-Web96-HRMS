/**
 * leaveBalance.js — paid-leave balance math for LeaveRequest (task 4.1).
 *
 * Kept separate from the model/controller so the counting rules (which
 * statuses count against the balance, which days of the week count as
 * "working days") are in one place and easy to adjust in Sprint 2 when
 * the half-day-late and no-show rules (tasks 4.2/4.4/4.6) land alongside it.
 */

import LeaveRequestModel from "../model/LeaveRequest.js";
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
export async function getUsedPaidDays(employeeId, year) {
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

/** Remaining paid-leave days for an employee in a given year, floored at 0. */
export async function getRemainingPaidDays(employeeId, year) {
  const used = await getUsedPaidDays(employeeId, year);
  return Math.max(0, PAID_LEAVE_DAYS_PER_YEAR - used);
}

/**
 * Counts working days (Mon–Fri) inclusive between two Date objects.
 * Does not account for company holidays yet — HolidayModel integration
 * is a reasonable Sprint 2 follow-up once this basic version is in use.
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
