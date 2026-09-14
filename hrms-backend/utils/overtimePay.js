/**
 * A month of attendance rows → the overtime figure payroll needs plus the
 * payslip breakdown. Pure; the caller loads rows once for the whole company.
 *
 * Only `otMinutes` is paid — `otUnapprovedMinutes` is exactly what the
 * approval queue exists to withhold (DECISIONS.md D5). Each day is rounded
 * then summed, so the breakdown buckets add up to the headline exactly.
 */

import { OT_MULTIPLIERS, overtimeHourlyRateVnd, overtimePayFromMinutesVnd } from "./overtimeRate.js";

const DAY_TYPES = ["normal", "restDay", "holiday"];

const emptyBucket = () => ({ dayMinutes: 0, nightMinutes: 0, pay: 0 });

const emptyBreakdown = () =>
  Object.fromEntries(DAY_TYPES.map((k) => [k, emptyBucket()]));

/**
 * @param {number} args.baseSalary  Monthly VND base.
 * @param {Array}  args.attendanceRows  The employee's rows for the month; rows without paid overtime are ignored.
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

    // No day type → no multiplier. Skip rather than guess "normal", which would silently underpay a rest day.
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

/** Payslip line segments, e.g. `150% x 4h · 200% x 10h` — built server-side so OT_MULTIPLIERS stays the only copy. */
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
