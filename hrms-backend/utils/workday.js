export const WORKDAY_END = process.env.WORKDAY_END || "18:00";
export const WORKDAY_LATE_AFTER = process.env.WORKDAY_LATE_AFTER || "09:15";

/** The company's zone — the single definition every calendar-day rule reads (DECISIONS.md D10). */
export const APP_TIMEZONE = process.env.SCHEDULER_TZ || "Asia/Ho_Chi_Minh";

/** The zone's UTC offset at an instant — sampled, not assumed constant, since SCHEDULER_TZ is configurable. */
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
 * Wall-clock fields in `timeZone` (as Date.UTC would encode them) → the real
 * instant. Never reads the host clock. The offset is applied twice on
 * purpose: it must be sampled near the answer, which for a DST zone can sit
 * on the other side of a transition from the naive input.
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
