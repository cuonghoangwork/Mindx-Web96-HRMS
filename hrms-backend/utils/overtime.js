/**
 * overtime.js — Attendance Overtime, milestone M1. Configuration only.
 *
 * Every number here is a statutory limit from Vietnamese labour law
 * (Bộ luật Lao động 2019, Art. 98 and Art. 107) rather than a company
 * policy, so they are overridable by env var but should not be raised past
 * the legal ceiling without a deliberate decision:
 *
 *   - 4h/day is the legal maximum on a normal working day (50% of an 8h shift).
 *   - 12h is the maximum *total* work on a rest day or public holiday.
 *   - 40h/month and 200h/year are the cumulative ceilings (300h/year applies
 *     to a listed set of sectors this system does not model).
 *
 * Kept separate from utils/overtimeRate.js so the rate engine imports plain
 * values and stays a pure function of its arguments — the same split
 * workday.js already uses for WORKDAY_END / WORKDAY_LATE_AFTER.
 */

/** Working-day overtime begins here. Same value as workday.js's WORKDAY_END. */
export const OT_WORKDAY_START = process.env.OT_WORKDAY_START || "18:00";

/**
 * Auto clock-out boundary — 18:00 + the 4h daily cap. Deliberately equal to
 * OT_NIGHT_START: weekday overtime stops exactly where night work begins, so
 * the night premium is reachable only on rest days and holidays (see §3 of
 * HRMS_OVERTIME_PLAN.md).
 */
export const OT_WINDOW_END = process.env.OT_WINDOW_END || "22:00";

/** Applications close at 13:00 on the overtime date itself. TZ-aware — see utils/overtimeCutoff.js. */
export const OT_APPLY_CUTOFF = process.env.OT_APPLY_CUTOFF || "13:00";

/** Night work premium window opens here (Decree 145/2020 Art. 57). */
export const OT_NIGHT_START = process.env.OT_NIGHT_START || "22:00";

function envNumber(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Legal maximum overtime on a normal working day. */
export const OT_DAILY_CAP_HOURS = envNumber("OT_DAILY_CAP_HOURS", 4);

/** Maximum *total* work (not just overtime) on a weekly rest day or public holiday. */
export const OT_RESTDAY_TOTAL_CAP = envNumber("OT_RESTDAY_TOTAL_CAP", 12);

export const OT_MONTHLY_CAP_HOURS = envNumber("OT_MONTHLY_CAP_HOURS", 40);
export const OT_ANNUAL_CAP_HOURS = envNumber("OT_ANNUAL_CAP_HOURS", 200);

/**
 * Overtime pay is exempt from personal income tax under Law 109/2025/QH15.
 * A flag rather than a hardcoded effective date: the date has been reported
 * inconsistently across sources, so this is switched off in one place if the
 * exemption turns out not to apply for a given period.
 */
export const OT_PIT_EXEMPT = process.env.OT_PIT_EXEMPT !== "false";

/**
 * Minutes to hours, rounded to two decimals.
 *
 * Overtime is stored in whole minutes everywhere (OvertimeRequest.plannedMinutes,
 * Attendance.otMinutes) because caps accumulate across many rows and fractional
 * hours drift. Hours are a presentation concern, so the conversion lives here —
 * in the one overtime module that imports nothing — rather than in
 * utils/overtimeBalance.js, which pulls in a Mongoose model and so cannot be
 * imported by the deliberately dependency-free utils/mappers.js.
 */
export const minutesToHours = (minutes) => Math.round((minutes / 60) * 100) / 100;

/**
 * Daily ceiling for a day type. On a rest day or holiday there is no normal
 * shift, so the whole worked span is overtime and the cap is the 12h total-work
 * limit rather than the 4h overtime limit.
 */
export function dailyCapHoursFor(dayType) {
  return dayType === "normal" ? OT_DAILY_CAP_HOURS : OT_RESTDAY_TOTAL_CAP;
}
