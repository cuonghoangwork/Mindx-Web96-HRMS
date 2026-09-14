/**
 * Overtime pricing (DECISIONS.md D5). Pure functions: no DB, no clock. The one
 * database-backed input — is this date a holiday? — is passed in as a boolean.
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

/** Exclusive end-of-day sentinel: a rest-day shift may run to midnight, and "23:59" would shave a minute off it. */
export const END_OF_DAY = "24:00";

const DAY_END_MINUTES = 24 * 60; // 1440
const NIGHT_START_MINUTES = parseHHMM(OT_NIGHT_START);

/** parseHHMM plus the "24:00" sentinel — kept out of parseHHMM itself so `checkIn: "24:00"` stays illegal. */
export function parseHHMMEnd(value) {
  if (value === END_OF_DAY) return DAY_END_MINUTES;
  return parseHHMM(value);
}

/**
 * Day type for rate purposes. Callers supply `isHoliday` via
 * utils/holidayLookup.js so every site matches holidays the same way. A
 * holiday outranks a rest day — it does not stop being one on a Saturday.
 */
export function resolveDayType(dateKey, { isHoliday = false } = {}) {
  if (isHoliday) return "holiday";
  return isWeekend(dateKey) ? "restDay" : "normal";
}

/**
 * Splits a requested span into day and night minutes. Night is 22:00–24:00
 * only: spans may not cross midnight (Attendance is one row per day with
 * "HH:MM" strings), so the 00:00–06:00 half of the legal night window is a
 * known limitation. Throws on an inverted span — silently unpaid overtime is
 * the worst failure mode here.
 */
export function splitDayNight(startHHMM, endHHMM) {
  const start = parseHHMM(startHHMM);
  const end = parseHHMMEnd(endHHMM);
  if (end <= start) {
    throw new AppError("Overtime cannot cross midnight.", "OT_CROSSES_MIDNIGHT", undefined, 400);
  }
  return splitDayNightMinutes(start, end);
}

/**
 * Same arithmetic on minutes-since-midnight, returning zeroes for an empty or
 * inverted span: overtimeRecompute.js intersects an approved window with the
 * hours actually clocked, and "went home before the window opened" is an
 * ordinary outcome, not an error.
 */
export function splitDayNightMinutes(start, end) {
  if (!(end > start)) return { dayMinutes: 0, nightMinutes: 0 };
  const nightMinutes = Math.max(
    0,
    Math.min(end, DAY_END_MINUTES) - Math.max(start, NIGHT_START_MINUTES),
  );
  return { dayMinutes: end - start - nightMinutes, nightMinutes };
}

/** workday.js's minutesBetween/hoursBetween, accepting "24:00" as the end — the close job writes plannedEnd onto checkOut. */
export function minutesBetweenEnd(startHHMM, endHHMM) {
  return Math.max(0, parseHHMMEnd(endHHMM) - parseHHMM(startHHMM));
}

export function hoursBetweenEnd(startHHMM, endHHMM) {
  return minutesBetweenEnd(startHHMM, endHHMM) / 60;
}

/**
 * Hourly rate = monthly salary / (standard working days × 8), using the same
 * Mon–Fri day count and whole-VND rounding as payroll's daily deduction, so
 * an overtime hour and a deducted day are priced off the same "working day".
 */
export function overtimeHourlyRateVnd({ baseSalary, year, month } = {}) {
  const salary = Number(baseSalary);
  if (!Number.isFinite(salary) || salary <= 0) return 0;
  return Math.round(salary / (standardWorkingDaysInMonth(year, month) * 8));
}

/** The rate table lookup, with a loud error rather than a silent zero. */
export function multipliersFor(dayType) {
  const multipliers = OT_MULTIPLIERS[dayType];
  if (!multipliers) {
    throw new AppError(
      `Unknown overtime day type: ${dayType}`,
      "OT_UNKNOWN_DAY_TYPE",
      { dayType: String(dayType) },
      400,
    );
  }
  return multipliers;
}

/**
 * Prices already-split minutes — the form payroll has, since Attendance stores
 * otMinutes/otNightMinutes rather than the span. Rounds once, at the end.
 */
export function overtimePayFromMinutesVnd({ hourlyRate, dayType, dayMinutes = 0, nightMinutes = 0 } = {}) {
  const multipliers = multipliersFor(dayType);
  const rate = Number(hourlyRate);
  if (!Number.isFinite(rate) || rate <= 0) return 0;

  return Math.round(
    (Math.max(0, dayMinutes) / 60) * rate * multipliers.day +
      (Math.max(0, nightMinutes) / 60) * rate * multipliers.night,
  );
}

/** Prices one "HH:MM" span. Validation order: day type, then span, then rate — each is an error regardless of the next. */
export function overtimePayVnd({ hourlyRate, dayType, startHHMM, endHHMM } = {}) {
  multipliersFor(dayType);
  const { dayMinutes, nightMinutes } = splitDayNight(startHHMM, endHHMM);

  return overtimePayFromMinutesVnd({ hourlyRate, dayType, dayMinutes, nightMinutes });
}
