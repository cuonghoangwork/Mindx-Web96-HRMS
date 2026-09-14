/**
 * The 13:00 overtime application cutoff (DECISIONS.md D5, D10). The container
 * runs UTC, so `new Date().getHours() >= 13` reads 6 at 13:00 in Vietnam and
 * never fires — every comparison here goes through an explicit time zone.
 */

import { APP_TIMEZONE, dateKeyInTz, parseHHMM } from "./workday.js";
import { OT_APPLY_CUTOFF } from "./overtime.js";

export const OT_TIMEZONE = APP_TIMEZONE;

/** Wall-clock "HH:MM" in `timeZone`. hourCycle "h23", not hour12:false — the latter renders midnight as "24:00" on some runtimes. */
export function hhmmInTz(date, timeZone = OT_TIMEZONE) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

/**
 * Is `now` past the cutoff for overtime date `otDateKey` ("YYYY-MM-DD")?
 * Earlier dates: never. Later dates: always. Same day: 13:00 exactly is
 * closed. Time only — the HR/Admin exemption is a role rule in the controller.
 */
export function isPastCutoff(now, otDateKey, { timeZone = OT_TIMEZONE, cutoff = OT_APPLY_CUTOFF } = {}) {
  const nowKey = dateKeyInTz(now, timeZone);
  if (nowKey < otDateKey) return false;
  if (nowKey > otDateKey) return true;
  return parseHHMM(hhmmInTz(now, timeZone)) >= parseHHMM(cutoff);
}

export default isPastCutoff;
