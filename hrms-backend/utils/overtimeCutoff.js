/**
 * overtimeCutoff.js — Attendance Overtime, milestone M1.
 *
 * Overtime applications close at 13:00 on the overtime date itself. That
 * sounds like a one-line check and is not, because this app is deployed to a
 * container running UTC:
 *
 *   // WRONG — reads 6 when it is 13:00 in Vietnam, so the cutoff never fires
 *   if (new Date().getHours() >= 13) reject();
 *
 * Every comparison here goes through Intl.DateTimeFormat with an explicit
 * timeZone, the same approach workday.js's dateKeyInTz already uses for
 * calendar days. Nothing in this file reads the host's local time.
 */

import { dateKeyInTz, parseHHMM } from "./workday.js";
import { OT_APPLY_CUTOFF } from "./overtime.js";

/**
 * Same default and env var as jobs/index.js's scheduler and
 * attendanceController.closeDay, so the cutoff, the close job and the
 * manual close endpoint all agree on what "today" means.
 */
export const OT_TIMEZONE = process.env.SCHEDULER_TZ || "Asia/Ho_Chi_Minh";

/**
 * The wall-clock "HH:MM" in `timeZone` at the given instant.
 *
 * hourCycle: "h23" is explicit rather than relying on hour12: false, which
 * renders midnight as "24:00" in some locale/runtime combinations — and
 * parseHHMM rejects "24:00".
 */
export function hhmmInTz(date, timeZone = OT_TIMEZONE) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

/**
 * Is `now` past the application cutoff for the overtime date `otDateKey`
 * ("YYYY-MM-DD")?
 *
 *   - Applying in advance is always allowed.
 *   - Once the overtime date itself has passed, it is always too late.
 *   - On the overtime date, the cutoff hour decides. 13:00 exactly is closed:
 *     "applications close at 13:00" means 12:59 is the last acceptable minute.
 *
 * Answers a question about *time only*. HR/Admin being able to assign
 * overtime past the cutoff is a role rule, and lives in the controller's
 * validation order — not here.
 */
export function isPastCutoff(now, otDateKey, { timeZone = OT_TIMEZONE, cutoff = OT_APPLY_CUTOFF } = {}) {
  const nowKey = dateKeyInTz(now, timeZone);
  if (nowKey < otDateKey) return false;
  if (nowKey > otDateKey) return true;
  return parseHHMM(hhmmInTz(now, timeZone)) >= parseHHMM(cutoff);
}

export default isPastCutoff;
