/**
 * attendance.js — shared attendance helpers.
 *
 * Extracted from pages/Attendance.jsx (8.0e Day 7) so the Employee Detail
 * "Attendance" tab (ViewEmployee.jsx) can reuse the same month-calendar data
 * shape/mock-fill logic instead of duplicating it, per the sprint plan's
 * "reuse existing calendar component" instruction for that tab.
 */
import { numericSeed, idsMatch } from "./id";

/**
 * Formats a Date as a local YYYY-MM-DD key. Deliberately NOT
 * `date.toISOString().split("T")[0]` — that converts to UTC first, which
 * silently rolls back to the previous calendar day for any local-midnight
 * Date once the local zone is ahead of UTC (e.g. Asia/Ho_Chi_Minh, UTC+7:
 * local midnight is 17:00 UTC the day before). Every attendance date key
 * in the app must go through this so a given calendar day always maps to
 * the same key regardless of time of day or how the Date was constructed.
 */
export function isoOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * The timezone the company operates in. Must match the backend's SCHEDULER_TZ,
 * because the server evaluates the overtime cutoff and every date-key rule in
 * that zone.
 */
export const APP_TIMEZONE = import.meta.env.VITE_APP_TIMEZONE || "Asia/Ho_Chi_Minh";

/**
 * "HH:MM" wall clock in APP_TIMEZONE.
 *
 * Deliberately NOT `date.getHours()` — that reads the *browser's* zone. A
 * clock-in sent from a laptop in another timezone would record the wrong
 * time against a company-timezone rule; it is the same class of bug as the
 * server-side `new Date().getHours()` the overtime cutoff had to avoid, just
 * one layer up.
 *
 * hourCycle "h23" is explicit: hour12:false renders midnight as "24:00" in
 * some runtimes, and the backend's parseHHMM rejects that.
 */
export function hhmmOf(date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

/** Derives display status from a raw attendance record — flags "Present" as "Late" past 9am. */
export function resolveStatus(record) {
  let s = record.status;
  if (record.checkIn && s === "Present") {
    if (Number(record.checkIn.split(":")[0]) >= 9) s = "Late";
  }
  return s;
}

/**
 * Fills a full month's worth of attendance for the given employees with
 * deterministic mock data for any employee/day combination that doesn't
 * already have a real record (weekends are skipped).
 */
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
