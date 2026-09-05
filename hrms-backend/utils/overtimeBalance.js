/**
 * overtimeBalance.js — Attendance Overtime, milestone M2.
 *
 * Cumulative overtime usage against the monthly (40h) and annual (200h)
 * statutory caps. Same role utils/leaveBalance.js plays for leave, and the
 * same counting rule: pending *and* approved requests both consume the
 * allowance, so an employee cannot queue up several requests that are each
 * individually under the cap and collectively over it. Rejected requests
 * release what they had reserved.
 *
 * Everything here is in whole minutes (OvertimeRequest.plannedMinutes) and
 * only converts to hours at the edges — caps are compared across many
 * accumulated rows, and fractional hours drift.
 */

import OvertimeRequestModel, { OT_LIVE_STATUSES } from "../model/OvertimeRequest.js";
import { OT_MONTHLY_CAP_HOURS, OT_ANNUAL_CAP_HOURS, minutesToHours } from "./overtime.js";

/** UTC [start, end] bounds for a calendar month, matching Attendance.date's UTC midnights. */
export function monthBoundsUtc(year, month) {
  return {
    lo: new Date(Date.UTC(year, month - 1, 1)),
    hi: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)),
  };
}

/** UTC [start, end] bounds for a calendar year. */
export function yearBoundsUtc(year) {
  return {
    lo: new Date(Date.UTC(year, 0, 1)),
    hi: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
  };
}

/**
 * Total live (pending + approved) overtime minutes for an employee in a
 * date window. `excludeId` skips one request — used by the post-commit caps
 * re-check, which needs "everything except the row being judged".
 */
export async function usedMinutesInWindow(employeeId, { lo, hi }, { excludeId } = {}) {
  const condition = {
    employee: employeeId,
    status: { $in: OT_LIVE_STATUSES },
    date: { $gte: lo, $lte: hi },
  };
  if (excludeId) condition._id = { $ne: excludeId };

  const rows = await OvertimeRequestModel.find(condition, "plannedMinutes");
  return rows.reduce((sum, r) => sum + (r.plannedMinutes ?? 0), 0);
}

/**
 * The payload behind GET /overtime-requests/balance and the request modal's
 * live caps meter. The meter is load-bearing UX rather than decoration: at
 * 4h/day an employee reaches the 40h monthly cap on their tenth overtime day,
 * so without a visible running total they hit a wall they could not see coming.
 */
export async function getOvertimeBalance(employeeId, { year, month } = {}) {
  const [monthMinutes, yearMinutes] = await Promise.all([
    usedMinutesInWindow(employeeId, monthBoundsUtc(year, month)),
    usedMinutesInWindow(employeeId, yearBoundsUtc(year)),
  ]);

  return {
    year,
    month,
    monthUsed: minutesToHours(monthMinutes),
    monthCap: OT_MONTHLY_CAP_HOURS,
    monthRemaining: minutesToHours(Math.max(0, OT_MONTHLY_CAP_HOURS * 60 - monthMinutes)),
    yearUsed: minutesToHours(yearMinutes),
    yearCap: OT_ANNUAL_CAP_HOURS,
    yearRemaining: minutesToHours(Math.max(0, OT_ANNUAL_CAP_HOURS * 60 - yearMinutes)),
  };
}

export default getOvertimeBalance;
