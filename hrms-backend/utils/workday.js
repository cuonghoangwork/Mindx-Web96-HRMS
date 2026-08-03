export const WORKDAY_END = process.env.WORKDAY_END || "18:00";
export const WORKDAY_LATE_AFTER = process.env.WORKDAY_LATE_AFTER || "09:15";

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
