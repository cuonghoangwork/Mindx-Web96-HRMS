/**
 * Overtime usage against the monthly/annual caps (DECISIONS.md D5). As with
 * leaveBalance.js, pending *and* approved requests consume the allowance so
 * several individually-valid requests cannot collectively exceed it.
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

/** GET /overtime-requests/balance and the request modal's caps meter (at 4h/day the monthly cap arrives on the tenth shift). */
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
