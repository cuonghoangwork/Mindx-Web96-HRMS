/** Attendance helpers shared by the Attendance page and the employee Attendance tab. */
import { numericSeed, idsMatch } from "./id";

/**
 * Local YYYY-MM-DD key. Never `toISOString().slice(0, 10)` — that converts
 * to UTC first and rolls a local midnight back a day in UTC+7. Every
 * attendance date key goes through here.
 */
export function isoOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Must match the backend's SCHEDULER_TZ — the server evaluates every date rule in this zone. */
export const APP_TIMEZONE = import.meta.env.VITE_APP_TIMEZONE || "Asia/Ho_Chi_Minh";

/**
 * "HH:MM" in APP_TIMEZONE, not the browser's zone — a clock-in from a
 * laptop abroad must record company time. hourCycle "h23" because
 * hour12:false renders midnight as "24:00", which the backend rejects.
 */
export function hhmmOf(date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

/**
 * "HH:MM" → minutes, or null when unparseable (callers are rendering; a bad
 * stored time should mean "no chip", not a blank page). `allowEndOfDay`
 * accepts "24:00", a legal overtime *end* but never a start.
 */
export function hhmmToMinutes(value, { allowEndOfDay = false } = {}) {
  if (allowEndOfDay && value === "24:00") return 24 * 60;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value ?? "");
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Display status; "Present" past 9am reads as "Late". */
export function resolveStatus(record) {
  let s = record.status;
  if (record.checkIn && s === "Present") {
    if (Number(record.checkIn.split(":")[0]) >= 9) s = "Late";
  }
  return s;
}

/** Fills the month with deterministic mock rows where no real record exists (weekends skipped). */
export function buildMonthAttendance(year, month, employees, existing) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const result = [...existing];
  const existingKeys = new Set(existing.map((r) => `${r.employeeId}-${r.date}`));

  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dow = new Date(year, month, day).getDay();
    if (dow === 0 || dow === 6) continue;

    employees.forEach((emp) => {
      const key = `${emp.id}-${date}`;
      if (existingKeys.has(key)) return;

      const seed = (numericSeed(emp.id) * 17 + day * 7) % 100;
      let status, checkIn, checkOut;

      if (seed < 5) {
        status = "On Leave"; checkIn = null; checkOut = null;
      } else if (seed < 10) {
        status = seed < 7 ? "On Leave" : "Present";
        if (status === "Present" && seed < 8) {
          checkIn = null; checkOut = null;
        } else {
          const late = seed > 85;
          const h = late ? 9 + Math.floor(seed / 30) : 8;
          const m = (seed * 3) % 60;
          checkIn = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
          checkOut = `${String(h + 8 + (seed % 2)).padStart(2, "0")}:${String((m + 15) % 60).padStart(2, "0")}`;
        }
      } else {
        const late = seed > 82;
        const h = late ? 9 + Math.floor((seed - 82) / 6) : 8 + ((seed % 2));
        const m = (seed * 3) % 60;
        checkIn = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        checkOut = `${String(Math.min(h + 8 + (seed % 2), 20)).padStart(2, "0")}:${String((m + 15) % 60).padStart(2, "0")}`;
        status = "Present";
      }

      result.push({ employeeId: emp.id, date, checkIn, checkOut, status });
    });
  }
  return result;
}

/** Groups a month's attendance records by date into calendar-cell aggregates. */
export function buildDayData(fullMonth, employees) {
  const map = {};
  fullMonth.forEach((r) => {
    if (!map[r.date]) map[r.date] = { present: 0, late: 0, leave: 0, absent: 0, total: 0, records: [] };
    const s = resolveStatus(r);
    if (s === "Present") map[r.date].present++;
    else if (s === "Late") map[r.date].late++;
    else if (s === "On Leave") map[r.date].leave++;
    else map[r.date].absent++;
    map[r.date].total++;
    map[r.date].records.push({ ...r, status: s, name: employees.find((e) => idsMatch(e.id, r.employeeId))?.name ?? `#${r.employeeId}` });
  });
  return map;
}
