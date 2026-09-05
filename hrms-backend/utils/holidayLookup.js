/**
 * holidayLookup.js — Attendance Overtime, milestone M2.
 *
 * One holiday-matching idiom, in one place.
 *
 * The codebase grew two incompatible ones: an exact-Date match in
 * jobs/closeAttendanceDay.js's resolveSkipReason (`findOne({ date })`) and a
 * range match in utils/payrollGeneration.js's loadMonthDayCounts
 * (`{ date: { $gte: lo, $lte: hi } }`). They agree only when every Holiday
 * row is stored at exactly UTC midnight. A fixture created that way passes
 * both, which is precisely why a mismatch survives a test suite and then
 * misbehaves in production.
 *
 * Overtime resolves the day type on the attendance side, so it uses the
 * attendance idiom — the exact match. Milestone M3 points
 * closeAttendanceDay's resolveSkipReason at this same function so there is
 * one implementation rather than two that happen to agree.
 */

import HolidayModel from "../model/Holiday.js";

/**
 * Is `date` (a UTC-midnight Date, as stored on Attendance and
 * OvertimeRequest) a public holiday?
 */
export async function isHolidayOn(date) {
  return Boolean(await HolidayModel.findOne({ date }, "_id"));
}

export default isHolidayOn;
