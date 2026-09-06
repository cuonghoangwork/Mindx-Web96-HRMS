export const WORKDAY_END = process.env.WORKDAY_END || "18:00";
export const WORKDAY_LATE_AFTER = process.env.WORKDAY_LATE_AFTER || "09:15";

/**
 * The zone the company operates in — the single definition. The cron
 * scheduler (jobs/index.js), the overtime cutoff (utils/overtimeCutoff.js)
 * and the payroll period boundary (utils/payrollPeriod.js) all read it from
 * here, because a calendar day has to mean the same thing to all three.
 */
export const APP_TIMEZONE = process.env.SCHEDULER_TZ || "Asia/Ho_Chi_Minh";

/**
 * The zone's UTC offset, in ms, at a specific instant. Sampled per instant
 * rather than assumed constant: Asia/Ho_Chi_Minh is a flat +07:00, but
 * SCHEDULER_TZ is configurable and plenty of zones move twice a year.
 */
function tzOffsetMs(instant, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  const asIfUtc = Date.UTC(
    +parts.year,
    +parts.month - 1,
    +parts.day,
    +parts.hour,
    +parts.minute,
    +parts.second,
    instant.getUTCMilliseconds(),
  );
  return asIfUtc - instant.getTime();
}

/**
 * Turns a wall-clock reading in `timeZone` into the real instant it names.
 *
 * `naiveUtcMs` carries the wall-clock fields as though they were UTC — i.e.
 * exactly what Date.UTC(...) returns — and this subtracts the zone's offset
 * to land on the true moment. Never reads the host clock, so the answer is
 * the same on a developer's laptop and on a UTC container.
 *
 * Applied twice on purpose: the offset has to be sampled near the ANSWER,
 * not near the naive input, and for a zone observing DST those two can sit
 * on opposite sides of a transition. The second pass costs nothing and makes
 * the result correct for every zone rather than only fixed-offset ones.
 */
export function zonedWallClockToUtc(naiveUtcMs, timeZone = APP_TIMEZONE) {
  const first = naiveUtcMs - tzOffsetMs(new Date(naiveUtcMs), timeZone);
  return new Date(naiveUtcMs - tzOffsetMs(new Date(first), timeZone));
}

const HHMM_RE = /^\d{1,2}:\d{2}$/;

export function parseHHMM(value) {
  if (typeof value !== "string" || !HHMM_RE.test(value)) {
    throw new Error(`Invalid HH:MM time value: ${value}`);
  }
  const [h, m] = value.split(":").map(Number);
  if (h > 23 || m > 59) {
    throw new Error(`Invalid HH:MM time value: ${value}`);
  }
  return h * 60 + m;
}

export function dateKeyInTz(date = new Date(), timeZone = "UTC") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function utcDateKey(date) {
  return dateKeyInTz(new Date(date), "UTC");
}

export function localDateKey(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function utcMidnight(dateKey) {
  if (typeof dateKey !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error(`Invalid date key: ${dateKey}`);
  }
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date key: ${dateKey}`);
  }
  return d;
}

export function endOfUtcDay(dateKey) {
  return new Date(utcMidnight(dateKey).getTime() + 86399999);
}

export function isWeekend(dateKey) {
  const day = utcMidnight(dateKey).getUTCDay();
  return day === 0 || day === 6;
}

export function minutesBetween(start, end) {
  return Math.max(0, parseHHMM(end) - parseHHMM(start));
}

export function hoursBetween(start, end) {
  return minutesBetween(start, end) / 60;
}

export function isLater(value, reference) {
  return parseHHMM(value) > parseHHMM(reference);
}
