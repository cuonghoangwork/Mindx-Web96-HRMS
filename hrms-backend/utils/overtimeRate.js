/**
 * overtimeRate.js — Attendance Overtime, milestone M1. The rules engine.
 *
 * Pure functions of their arguments: no DB, no clock, no request. The one
 * input that genuinely needs a database (is this date a public holiday?) is
 * passed in as a boolean rather than looked up here, so this file stays
 * unit-testable and callers keep a single holiday-lookup idiom — see
 * resolveDayType's note.
 *
 * Rate table (Bộ luật Lao động 2019 Art. 98 + Decree 145/2020 Art. 57):
 *
 *   Day type      Daytime 06:00-22:00   Night 22:00-06:00
 *   working day        150%                  210%
 *   rest day           200%                  270%
 *   holiday            300%                  390%
 *
 * These are statutory *minimums*, kept in one exported table so a wrong
 * multiplier is a one-line fix rather than a hunt.
 */

import { AppError } from "./appError.js";
import { isWeekend, parseHHMM } from "./workday.js";
import { standardWorkingDaysInMonth } from "./payrollEngine.js";
import { OT_NIGHT_START } from "./overtime.js";

export const OT_MULTIPLIERS = {
  normal: { day: 1.5, night: 2.1 },
  restDay: { day: 2.0, night: 2.7 },
  holiday: { day: 3.0, night: 3.9 },
};

/**
 * Exclusive end-of-day sentinel. Overtime spans may not cross midnight, so a
 * rest-day shift running to the end of the day needs a representable end
 * value — and "23:59" would silently shave a minute off every such span.
 */
export const END_OF_DAY = "24:00";

const DAY_END_MINUTES = 24 * 60; // 1440
const NIGHT_START_MINUTES = parseHHMM(OT_NIGHT_START);

/**
 * Like parseHHMM, but additionally accepts "24:00" as the end-of-day
 * sentinel.
 *
 * Deliberately NOT folded into parseHHMM itself: that would also make
 * `checkIn: "24:00"` legal, which is meaningless, and workday.test.js pins
 * the strict behavior on purpose. parseHHMM has exactly one caller outside
 * workday.js, so confining the sentinel to the overtime helpers costs
 * nothing.
 */
export function parseHHMMEnd(value) {
  if (value === END_OF_DAY) return DAY_END_MINUTES;
  return parseHHMM(value);
}

/**
 * Classifies a date for rate purposes.
 *
 * `isHoliday` is supplied by the caller rather than queried here, for two
 * reasons: it keeps this module free of a DB dependency, and it forces every
 * call site to go through the *same* holiday lookup. The codebase has two
 * incompatible idioms — an exact-Date match in closeAttendanceDay's
 * resolveSkipReason and a range match in payrollGeneration — and a
 * holiday whose stored date is not exactly UTC midnight resolves differently
 * between them. Attendance callers must reuse resolveSkipReason's lookup.
 *
 * A public holiday outranks a weekly rest day: it pays 300% rather than
 * 200%, and a holiday does not stop being one because it fell on a Saturday.
 */
export function resolveDayType(dateKey, { isHoliday = false } = {}) {
  if (isHoliday) return "holiday";
  return isWeekend(dateKey) ? "restDay" : "normal";
}

/**
 * Splits an overtime span into daytime and night minutes.
 *
 * Night here is 22:00-24:00 only. Spans may not cross midnight (Attendance
 * has a unique index on {employee, date} and stores "HH:MM" strings, so a
 * shift ending at 01:00 the next day would need two rows or a full datetime
 * refactor), which makes the 00:00-06:00 half of the legal night window
 * unreachable. That is a documented limitation, not an oversight.
 *
 * Throws rather than returning 0 for an inverted span: hoursBetween() would
 * quietly return 0 via its Math.max(0, …) guard, and silently unpaid
 * overtime is the worst possible failure mode here.
 */
export function splitDayNight(startHHMM, endHHMM) {
  const start = parseHHMM(startHHMM);
  const end = parseHHMMEnd(endHHMM);
  if (end <= start) {
    throw new AppError("Overtime cannot cross midnight.", "OT_CROSSES_MIDNIGHT", undefined, 400);
  }

  const nightMinutes = Math.max(
    0,
    Math.min(end, DAY_END_MINUTES) - Math.max(start, NIGHT_START_MINUTES),
  );
  const dayMinutes = end - start - nightMinutes;
  return { dayMinutes, nightMinutes };
}

/**
 * Hourly rate = monthly base salary / (standard working days x 8).
 *
 * Two conventions inherited from the existing payroll code, both deliberate:
 * standardWorkingDaysInMonth counts Mon-Fri and ignores public holidays, and
 * the result is rounded to whole VND the same way autoDeductionVnd rounds its
 * daily rate. Keeping both means an overtime hour and a deducted day are
 * priced off the same notion of "a working day".
 */
export function overtimeHourlyRateVnd({ baseSalary, year, month } = {}) {
  const salary = Number(baseSalary);
  if (!Number.isFinite(salary) || salary <= 0) return 0;
  return Math.round(salary / (standardWorkingDaysInMonth(year, month) * 8));
}

/**
 * Prices one overtime span. Rounds once at the end rather than per-portion,
 * so the day and night halves cannot each absorb a rounding error.
 */
export function overtimePayVnd({ hourlyRate, dayType, startHHMM, endHHMM } = {}) {
  const multipliers = OT_MULTIPLIERS[dayType];
  if (!multipliers) {
    throw new AppError(
      `Unknown overtime day type: ${dayType}`,
      "OT_UNKNOWN_DAY_TYPE",
      { dayType: String(dayType) },
      400,
    );
  }

  // Validate the span before the rate: an inverted span is an error whether
  // or not there is a salary to price it against.
  const { dayMinutes, nightMinutes } = splitDayNight(startHHMM, endHHMM);

  const rate = Number(hourlyRate);
  if (!Number.isFinite(rate) || rate <= 0) return 0;

  return Math.round(
    (dayMinutes / 60) * rate * multipliers.day +
      (nightMinutes / 60) * rate * multipliers.night,
  );
}
