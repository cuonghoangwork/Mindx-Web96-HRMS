import { APP_TIMEZONE, localDateKey, utcDateKey, zonedWallClockToUtc } from "./workday.js";

const DAY_MS = 86_400_000;

const pad = (n) => String(n).padStart(2, "0");

export function monthPrefix(year, month) {
  return `${year}-${pad(month)}`;
}

export function monthQueryWindowUtc(year, month) {
  return {
    lo: new Date(Date.UTC(year, month - 1, 1) - 2 * DAY_MS),
    hi: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999) + 2 * DAY_MS),
  };
}

/**
 * The last instant of the payroll month, as a real UTC timestamp.
 *
 * The month ends when it ends *for the company*, which is why this is not
 * plain Date.UTC(). It used to be, and the difference was not cosmetic: the
 * only caller compares an employee's `createdAt` against this to decide
 * whether they were on the roster (utils/payrollGeneration.js). With a UTC
 * boundary, anyone hired between 00:00 and 06:59 on the 1st of a month —
 * still 07:00-behind "yesterday" in UTC — was handed a payslip for the month
 * BEFORE they started. In Asia/Ho_Chi_Minh that is a seven-hour window on
 * the first morning of every month.
 */
export function periodEndUtc(year, month, timeZone = APP_TIMEZONE) {
  return zonedWallClockToUtc(Date.UTC(year, month, 0, 23, 59, 59, 999), timeZone);
}

export function attendanceDateKey(date) {
  const d = new Date(date);
  const isUtcMidnight =
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0;
  return isUtcMidnight ? utcDateKey(d) : localDateKey(d);
}

export function isWeekendKey(dateKey) {
  const dow = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  return dow === 0 || dow === 6;
}

export function leaveDayKeys({ startDate, endDate }, skipKeys = new Set()) {
  const keys = [];
  const cur = new Date(startDate);
  const last = new Date(endDate);
  if (Number.isNaN(cur.getTime()) || Number.isNaN(last.getTime())) return keys;
  cur.setHours(0, 0, 0, 0);
  last.setHours(0, 0, 0, 0);
  while (cur <= last) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) {
      const key = localDateKey(cur);
      if (!skipKeys.has(key)) keys.push(key);
    }
    cur.setDate(cur.getDate() + 1);
  }
  return keys;
}

export function collectLeaveKeys(requests, year, month, skipKeys = new Set()) {
  const prefix = monthPrefix(year, month);
  const set = new Set();
  for (const request of requests || []) {
    for (const key of leaveDayKeys(request, skipKeys)) {
      if (key.startsWith(prefix)) set.add(key);
    }
  }
  return set;
}

export function collectOnLeaveCoverageKeys(attendanceRows, year, month) {
  const prefix = monthPrefix(year, month);
  const set = new Set();
  for (const row of attendanceRows || []) {
    for (const key of [utcDateKey(row.date), localDateKey(row.date)]) {
      if (key.startsWith(prefix)) set.add(key);
    }
  }
  return set;
}

export function collectAbsentKeys(attendanceRows, year, month, excludeKeys = new Set()) {
  const prefix = monthPrefix(year, month);
  const set = new Set();
  for (const row of attendanceRows || []) {
    const key = attendanceDateKey(row.date);
    if (!key.startsWith(prefix)) continue;
    if (isWeekendKey(key)) continue;
    if (excludeKeys.has(key)) continue;
    set.add(key);
  }
  return set;
}

export function holidayKeySet(holidays) {
  const set = new Set();
  for (const holiday of holidays || []) {
    set.add(utcDateKey(holiday.date));
    set.add(localDateKey(holiday.date));
  }
  return set;
}

export function groupByEmployee(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const key = String(row.employee);
    const bucket = map.get(key);
    if (bucket) bucket.push(row);
    else map.set(key, [row]);
  }
  return map;
}
