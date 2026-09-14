/**
 * Overtime limits. Every number is a statutory ceiling from Vietnamese labour
 * law (Bộ luật Lao động 2019, Art. 98 & 107; Decree 145/2020, Art. 57), not
 * company policy — env overrides may lower them, never raise them.
 *
 * Config-only on purpose: overtimeRate.js imports plain values and stays a
 * pure function of its arguments.
 */

/** Working-day overtime begins here — same value as workday.js's WORKDAY_END. */
export const OT_WORKDAY_START = process.env.OT_WORKDAY_START || "18:00";

/**
 * Auto clock-out boundary: 18:00 + the 4h daily cap. Equal to OT_NIGHT_START
 * so the night premium is only reachable on rest days and holidays.
 */
export const OT_WINDOW_END = process.env.OT_WINDOW_END || "22:00";

/** Applications close at this local time on the overtime date — see overtimeCutoff.js. */
export const OT_APPLY_CUTOFF = process.env.OT_APPLY_CUTOFF || "13:00";

/** Night-work premium window opens here. */
export const OT_NIGHT_START = process.env.OT_NIGHT_START || "22:00";

function envNumber(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Max overtime on a normal working day (50% of an 8h shift). */
export const OT_DAILY_CAP_HOURS = envNumber("OT_DAILY_CAP_HOURS", 4);
/** Max *total* work on a rest day or public holiday — there is no normal shift, so all of it is overtime. */
export const OT_RESTDAY_TOTAL_CAP = envNumber("OT_RESTDAY_TOTAL_CAP", 12);
export const OT_MONTHLY_CAP_HOURS = envNumber("OT_MONTHLY_CAP_HOURS", 40);
/** 300h applies only to listed sectors this system does not model. */
export const OT_ANNUAL_CAP_HOURS = envNumber("OT_ANNUAL_CAP_HOURS", 200);

/**
 * Overtime pay is PIT-exempt under Law 109/2025/QH15. A flag rather than an
 * effective date because the date has been reported inconsistently.
 */
export const OT_PIT_EXEMPT = process.env.OT_PIT_EXEMPT !== "false";

/**
 * Overtime is stored in whole minutes (caps accumulate across many rows and
 * fractional hours drift); hours are presentation only. Lives here, in the
 * one overtime module with no imports, so mappers.js can use it.
 */
export const minutesToHours = (minutes) => Math.round((minutes / 60) * 100) / 100;

export function dailyCapHoursFor(dayType) {
  return dayType === "normal" ? OT_DAILY_CAP_HOURS : OT_RESTDAY_TOTAL_CAP;
}
