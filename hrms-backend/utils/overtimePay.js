/**
 * overtimePay.js — Attendance Overtime, milestone M5. Payroll aggregation.
 *
 * Turns a month of attendance records into the one number payroll needs, plus
 * the breakdown a payslip has to show. Pure: the caller supplies the rows, so
 * this stays unit-testable and payrollGeneration can load them once for the
 * whole company rather than once per employee.
 *
 * Two rules encoded here that are easy to get wrong:
 *
 *   - **Only otMinutes is paid.** otUnapprovedMinutes is deliberately ignored:
 *     time worked with nobody signing off is recorded and flagged, never paid.
 *     Reading the wrong field would quietly pay for exactly the hours the
 *     approval queue exists to withhold.
 *   - **Each day is rounded, then summed.** Not summed then rounded — that way
 *     the breakdown buckets are integers that add up to the total exactly, so
 *     a payslip's sub-line can never disagree with its own headline figure.
 */

import { OT_MULTIPLIERS, overtimeHourlyRateVnd, overtimePayFromMinutesVnd } from "./overtimeRate.js";

const DAY_TYPES = ["normal", "restDay", "holiday"];

const emptyBucket = () => ({ dayMinutes: 0, nightMinutes: 0, pay: 0 });

const emptyBreakdown = () =>
  Object.fromEntries(DAY_TYPES.map((k) => [k, emptyBucket()]));

/**
 * @param {object} args
 * @param {number} args.baseSalary  Monthly VND base for the employee.
 * @param {number} args.year
 * @param {number} args.month       1-12.
 * @param {Array}  args.attendanceRows  That employee's Attendance rows for the
 *   month. Rows with no paid overtime are ignored, so the caller can pass the
 *   whole month without filtering.
 * @returns {{hours, nightHours, minutes, nightMinutes, pay, hourlyRate, breakdown}}
 */
export function computeOvertimePay({ baseSalary, year, month, attendanceRows = [] } = {}) {
  const hourlyRate = overtimeHourlyRateVnd({ baseSalary, year, month });
  const breakdown = emptyBreakdown();

  let minutes = 0;
  let nightMinutes = 0;
  let pay = 0;

  for (const row of attendanceRows) {
    const otMinutes = Number(row?.otMinutes) || 0;
    if (otMinutes <= 0) continue;

    // An overtime record without a day type cannot be priced — there is no
    // multiplier to apply. Skip it rather than guessing "normal", which would
    // underpay a rest day by a third and do it silently.
    const dayType = row?.otDayType;
    if (!DAY_TYPES.includes(dayType)) continue;

    const rowNight = Math.min(Math.max(0, Number(row?.otNightMinutes) || 0), otMinutes);
    const rowDay = otMinutes - rowNight;

    const rowPay = overtimePayFromMinutesVnd({
      hourlyRate,
      dayType,
      dayMinutes: rowDay,
      nightMinutes: rowNight,
    });

    breakdown[dayType].dayMinutes += rowDay;
    breakdown[dayType].nightMinutes += rowNight;
    breakdown[dayType].pay += rowPay;

    minutes += otMinutes;
    nightMinutes += rowNight;
    pay += rowPay;
  }

  return {
    minutes,
    nightMinutes,
    hours: Math.round((minutes / 60) * 100) / 100,
    nightHours: Math.round((nightMinutes / 60) * 100) / 100,
    pay,
    hourlyRate,
    breakdown,
  };
}

/**
 * Flattens a breakdown into the segments a payslip line renders, e.g.
 * `150% x 4h · 200% x 10h · 270% x 2h`.
 *
 * Built here rather than in the client so the statutory multipliers stay in
 * one place (OT_MULTIPLIERS). The frontend receives finished numbers and only
 * has to format them.
 */
export function overtimeSegments(breakdown) {
  if (!breakdown) return [];
  const segments = [];
  for (const dayType of DAY_TYPES) {
    const bucket = breakdown[dayType];
    if (!bucket) continue;
    const multipliers = OT_MULTIPLIERS[dayType];
    for (const [minutesKey, rateKey] of [
      ["dayMinutes", "day"],
      ["nightMinutes", "night"],
    ]) {
      const mins = Number(bucket[minutesKey]) || 0;
      if (mins <= 0) continue;
      segments.push({
        dayType,
        night: rateKey === "night",
        multiplier: multipliers[rateKey],
        percent: Math.round(multipliers[rateKey] * 100),
        hours: Math.round((mins / 60) * 100) / 100,
      });
    }
  }
  return segments;
}

export default computeOvertimePay;
