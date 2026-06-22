import { useState, useMemo, useEffect } from "react";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import Avatar from "../components/Avatar";
import Badge from "../components/Badge";
import { idsMatch, compareIds, numericSeed } from "../utils/id";

/* ─── helpers ─── */
const fmt = (v) => {
  if (!v) return "—";
  const [h, m] = v.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};

const resolveStatus = (record) => {
  let s = record.status;
  if (record.checkIn && s === "Present") {
    if (Number(record.checkIn.split(":")[0]) >= 9) s = "Late";
  }
  return s;
};

const variantMap = (s) =>
  ({ Present: "success", Late: "warning", "On Leave": "info" })[s] ?? "danger";

/* ─── Generate rich mock attendance for a full month ─── */
function buildMonthAttendance(year, month, employees, existing) {
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

/* ─── Month calendar grid ─── */
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function CalendarGrid({ year, month, dayData, selectedDay, onSelectDay, todayStr }) {
  const firstDow = new Date(year, month, 1).getDay();
  const daysCount = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: firstDow + daysCount }, (_, i) =>
    i < firstDow ? null : i - firstDow + 1
  );
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px", marginBottom: "4px" }}>
        {DAYS.map((d) => (
          <div key={d} style={{
            textAlign: "center", fontSize: "var(--fs-xs)", fontWeight: "var(--fw-medium)",
            color: "var(--txt-secondary)", padding: "4px 0",
          }}>{d}</div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "3px" }}>
        {cells.map((day, idx) => {
          if (!day) return <div key={`empty-${idx}`} />;
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dow = new Date(year, month, day).getDay();
          const isWeekend = dow === 0 || dow === 6;
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === selectedDay;
          const data = dayData[dateStr];

          const rate = data
            ? Math.round(((data.present + data.late) / data.total) * 100)
            : null;

          const barColor = rate == null ? "transparent"
            : rate >= 90 ? "var(--clr-success-500)"
            : rate >= 75 ? "var(--clr-warning-500)"
            : "var(--clr-danger-400)";

          return (
            <div
              key={day}
              onClick={() => !isWeekend && onSelectDay(isSelected ? null : dateStr)}
              style={{
                borderRadius: "var(--radius-sm)",
                border: isSelected
                  ? "2px solid var(--bdr-brand)"
                  : isToday
                  ? "2px solid var(--clr-primary-300)"
                  : "1px solid var(--bdr-subtle)",
                background: isSelected ? "var(--bg-primary-subtle)"
                  : isToday ? "var(--bg-surface)"
                  : "var(--bg-surface)",
                cursor: isWeekend ? "default" : "pointer",
                opacity: isWeekend ? 0.4 : 1,
                padding: "5px 6px",
                minHeight: "52px",
                display: "flex", flexDirection: "column", gap: "3px",
                transition: "border-color 0.15s",
              }}
            >
              <div style={{
                fontSize: "var(--fs-xs)", fontWeight: isToday ? "var(--fw-semibold)" : "var(--fw-regular)",
                color: isSelected ? "var(--txt-primary-brand)"
                  : isToday ? "var(--clr-primary-400)"
                  : "var(--txt-primary)",
                lineHeight: 1,
              }}>{day}</div>

              {data && !isWeekend && (
                <>
                  <div style={{
                    height: "3px", borderRadius: "var(--radius-full)",
                    background: "var(--bg-surface-sub)",
                  }}>
                    <div style={{
                      height: "3px", borderRadius: "var(--radius-full)",
                      background: barColor, width: `${rate}%`,
                    }} />
                  </div>
                  <div style={{
                    fontSize: "9px", color: "var(--txt-secondary)",
                    lineHeight: 1, marginTop: "1px",
                  }}>
                    {rate}%
                  </div>
                  <div style={{ display: "flex", gap: "2px", flexWrap: "wrap", marginTop: "1px" }}>
                    {data.present > 0 && <span style={{ width: "4px", height: "4px", borderRadius: "50%", background: "var(--clr-success-500)" }} />}
                    {data.late > 0 && <span style={{ width: "4px", height: "4px", borderRadius: "50%", background: "var(--clr-warning-500)" }} />}
                    {data.leave > 0 && <span style={{ width: "4px", height: "4px", borderRadius: "50%", background: "var(--clr-info-500)" }} />}
                    {data.absent > 0 && <span style={{ width: "4px", height: "4px", borderRadius: "50%", background: "var(--clr-danger-400)" }} />}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Day detail panel ─── */
function DayPanel({ dateStr, rows, onClose }) {
  if (!dateStr || rows.length === 0) return (
    <div style={{
      background: "var(--bg-surface-alt)", borderRadius: "var(--radius-md)",
      padding: "var(--sp-5)", textAlign: "center",
      color: "var(--txt-secondary)", fontSize: "var(--fs-sm)",
    }}>
      Select a date to view attendance details
    </div>
  );

  const d = new Date(dateStr + "T00:00:00");
  const label = `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;

  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--bdr-subtle)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "var(--sp-4) var(--sp-5)",
        borderBottom: "1px solid var(--bdr-subtle)",
        background: "var(--bg-surface-alt)",
      }}>
        <div>
          <div style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-semibold)", color: "var(--txt-primary)" }}>{label}</div>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", marginTop: "2px" }}>
            {rows.length} records
          </div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--txt-secondary)", fontSize: "18px", lineHeight: 1 }}>×</button>
      </div>

      <div style={{ display: "flex", gap: "var(--sp-2)", padding: "var(--sp-3) var(--sp-5)", flexWrap: "wrap", borderBottom: "1px solid var(--bdr-subtle)" }}>
        {[["Present","success"],["Late","warning"],["On Leave","info"],["Absent","danger"]].map(([s, v]) => {
          const count = rows.filter((r) => r.status === s).length;
          return count > 0 && (
            <Badge key={s} variant={v} dot size="sm">{count} {s}</Badge>
          );
        })}
      </div>

      <div style={{ maxHeight: "360px", overflowY: "auto" }}>
        <table className="data-table" style={{ fontSize: "var(--fs-sm)" }}>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Check In</th>
              <th>Check Out</th>
              <th>Hours</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const hours = r.checkIn && r.checkOut
                ? (() => {
                    const [h1, m1] = r.checkIn.split(":").map(Number);
                    const [h2, m2] = r.checkOut.split(":").map(Number);
                    const diff = (h2 * 60 + m2) - (h1 * 60 + m1);
                    return `${Math.floor(diff / 60)}h ${diff % 60}m`;
                  })()
                : "—";
              return (
                <tr key={r.employeeId}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
                      <Avatar name={r.name} size="xs" />
                      <span>{r.name}</span>
                    </div>
                  </td>
                  <td style={{ color: r.status === "Late" ? "var(--txt-warning)" : "var(--txt-primary)" }}>
                    {fmt(r.checkIn)}
                  </td>
                  <td>{fmt(r.checkOut)}</td>
                  <td style={{ color: "var(--txt-secondary)" }}>{hours}</td>
                  <td><Badge variant={variantMap(r.status)} size="sm">{r.status}</Badge></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Clock In / Clock Out widget
═══════════════════════════════════════════════ */
/**
 * ClockInOutWidget
 *
 * Calls the real backend POST /attendance/check-in and /check-out endpoints.
 * Employee is auto-selected by matching the logged-in user's email against the
 * employees list. Admins/managers can change the selection via a dropdown.
 * The check-in/check-out time is derived from getAppNow() so it respects the
 * demo clock (HeaderDateTime).
 */
function ClockInOutWidget({ employees, attendance, getAppNow, clockIn, clockOut, currentUser }) {
  // Find the employee record linked to the logged-in user (match by email).
  const myEmployee = employees.find(
    (e) => e.email && currentUser?.email && e.email.toLowerCase() === currentUser.email.toLowerCase()
  ) || employees[0] || null;

  const [selectedEmpId, setSelectedEmpId] = useState(() => myEmployee?.id ?? "");
  const [loading, setLoading] = useState(null); // "in" | "out" | null
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Sync default selection when employees list loads (it might be empty on first render)
  useEffect(() => {
    if (!selectedEmpId && myEmployee?.id) {
      setSelectedEmpId(myEmployee.id);
    }
  }, [myEmployee, selectedEmpId]);

  // Auto-dismiss success message after 4 s
  useEffect(() => {
    if (!success) return;
    const id = setTimeout(() => setSuccess(""), 4000);
    return () => clearTimeout(id);
  }, [success]);

  const now = getAppNow();
  const todayStr = now.toISOString().split("T")[0];
  const currentTimeHHMM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  // Find today's attendance record for the selected employee
  const todayRecord = attendance.find(
    (r) => idsMatch(r.employeeId, selectedEmpId) && r.date === todayStr
  ) ?? null;

  const hasCheckedIn = Boolean(todayRecord?.checkIn);
  const hasCheckedOut = Boolean(todayRecord?.checkOut);

  // Derive display status from today's record
  const todayStatus = todayRecord
    ? resolveStatus({ ...todayRecord, status: todayRecord.status || "Present" })
    : null;

  const selectedEmployee = employees.find((e) => idsMatch(e.id, selectedEmpId)) ?? null;

  const handleClockIn = async () => {
    if (!selectedEmpId) { setError("Please select an employee."); return; }
    setLoading("in"); setError(""); setSuccess("");
    try {
      await clockIn(selectedEmpId, todayStr, currentTimeHHMM);
      setSuccess(`Clocked in at ${fmt(currentTimeHHMM)}`);
    } catch (err) {
      setError(err.message || "Failed to clock in. Is the backend running?");
    } finally {
      setLoading(null);
    }
  };

  const handleClockOut = async () => {
    if (!selectedEmpId) { setError("Please select an employee."); return; }
    setLoading("out"); setError(""); setSuccess("");
    try {
      await clockOut(selectedEmpId, todayStr, currentTimeHHMM);
      setSuccess(`Clocked out at ${fmt(currentTimeHHMM)}`);
    } catch (err) {
      setError(err.message || "Failed to clock out. Is the backend running?");
    } finally {
      setLoading(null);
    }
  };

  // Spinner SVG (inline so no extra import needed)
  const Spinner = () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"
      style={{ animation: "att-spin 0.7s linear infinite", flexShrink: 0 }}>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <style>{`@keyframes att-spin { to { transform: rotate(360deg) } }`}</style>
    </svg>
  );

  return (
    <div className="content-card" style={{ padding: "var(--sp-5) var(--sp-6)" }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", marginBottom: "var(--sp-5)" }}>
        {/* Clock icon */}
        <span style={{
          width: "36px", height: "36px", borderRadius: "var(--radius-md)",
          background: "var(--bg-primary-subtle)", color: "var(--clr-primary-400)",
          display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }} aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 3" />
          </svg>
        </span>
        <div>
          <div style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-semibold)", color: "var(--txt-primary)", lineHeight: 1 }}>
            Clock In / Clock Out
          </div>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", marginTop: "3px" }}>
            Today · {DAYS[now.getDay()]}, {MONTHS[now.getMonth()]} {now.getDate()}, {now.getFullYear()} · {fmt(currentTimeHHMM)}
          </div>
        </div>
      </div>

      {/* Controls row */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: "var(--sp-4)", flexWrap: "wrap" }}>

        {/* Employee selector */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)", minWidth: "200px", flex: 1, maxWidth: "320px" }}>
          <label style={{ fontSize: "var(--fs-xs)", fontWeight: "var(--fw-medium)", color: "var(--txt-secondary)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
            Employee
          </label>
          {employees.length === 0 ? (
            <div style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)", padding: "10px var(--sp-4)", border: "1px solid var(--bdr-default)", borderRadius: "var(--radius-md)" }}>
              Loading employees…
            </div>
          ) : (
            <select
              value={selectedEmpId}
              onChange={(e) => { setSelectedEmpId(e.target.value); setError(""); setSuccess(""); }}
              style={{
                padding: "10px var(--sp-4)",
                border: "1px solid var(--bdr-default)",
                borderRadius: "var(--radius-md)",
                background: "var(--bg-surface)",
                color: "var(--txt-primary)",
                fontFamily: "var(--font-family)",
                fontSize: "var(--fs-md)",
                outline: "none",
                cursor: "pointer",
              }}
            >
              <option value="">Select employee…</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}{emp.email === currentUser?.email ? " (you)" : ""}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Today's record summary */}
        <div style={{
          flex: 1,
          display: "flex", gap: "var(--sp-4)", flexWrap: "wrap",
          padding: "var(--sp-3) var(--sp-4)",
          background: "var(--bg-surface-alt)",
          border: "1px solid var(--bdr-subtle)",
          borderRadius: "var(--radius-md)",
          alignItems: "center",
          minWidth: "240px",
        }}>
          <RecordField label="Check In" value={todayRecord?.checkIn ? fmt(todayRecord.checkIn) : "—"} highlight={hasCheckedIn} />
          <div style={{ width: "1px", height: "32px", background: "var(--bdr-subtle)", flexShrink: 0 }} />
          <RecordField label="Check Out" value={todayRecord?.checkOut ? fmt(todayRecord.checkOut) : "—"} />
          <div style={{ width: "1px", height: "32px", background: "var(--bdr-subtle)", flexShrink: 0 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
            <span style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Status</span>
            {todayStatus
              ? <Badge variant={variantMap(todayStatus)} size="sm" dot>{todayStatus}</Badge>
              : <span style={{ fontSize: "var(--fs-sm)", color: "var(--txt-disabled)" }}>No record</span>
            }
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: "var(--sp-3)", flexShrink: 0 }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleClockIn}
            disabled={loading !== null || hasCheckedIn || !selectedEmpId}
            title={hasCheckedIn ? "Already clocked in today" : "Clock in now"}
            style={{ gap: "var(--sp-2)", minWidth: "110px" }}
          >
            {loading === "in" ? <Spinner /> : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 3" />
              </svg>
            )}
            {loading === "in" ? "Clocking…" : "Clock In"}
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleClockOut}
            disabled={loading !== null || !hasCheckedIn || hasCheckedOut || !selectedEmpId}
            title={
              !hasCheckedIn ? "Must clock in first"
              : hasCheckedOut ? "Already clocked out today"
              : "Clock out now"
            }
            style={{ gap: "var(--sp-2)", minWidth: "115px" }}
          >
            {loading === "out" ? <Spinner /> : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            )}
            {loading === "out" ? "Clocking…" : "Clock Out"}
          </button>
        </div>
      </div>

      {/* Feedback row */}
      {(error || success) && (
        <div style={{ marginTop: "var(--sp-3)", display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
          {error && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: "var(--sp-2)",
              fontSize: "var(--fs-sm)", color: "var(--txt-danger)",
              padding: "var(--sp-2) var(--sp-3)",
              background: "var(--bg-danger-subtle)", border: "1px solid var(--bdr-danger)",
              borderRadius: "var(--radius-md)",
            }}>
              <svg width="13" height="13" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M6 1L11 10H1L6 1Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                <path d="M6 5V7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                <circle cx="6" cy="8.5" r="0.6" fill="currentColor"/>
              </svg>
              {error}
            </span>
          )}
          {success && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: "var(--sp-2)",
              fontSize: "var(--fs-sm)", color: "var(--txt-success)",
              padding: "var(--sp-2) var(--sp-3)",
              background: "var(--bg-success-subtle)", border: "1px solid var(--bdr-success)",
              borderRadius: "var(--radius-md)",
            }}>
              <svg width="13" height="13" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M3.5 6L5.5 8L8.5 4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {success}
            </span>
          )}
        </div>
      )}

      {/* State hints below buttons */}
      {selectedEmployee && (
        <div style={{ marginTop: "var(--sp-3)", display: "flex", gap: "var(--sp-3)", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
            <Avatar name={selectedEmployee.name} src={selectedEmployee.avatar} size="xs" />
            <span style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)" }}>
              {selectedEmployee.name} · {selectedEmployee.department} · {selectedEmployee.designation}
            </span>
          </div>
          {hasCheckedIn && !hasCheckedOut && (
            <span style={{ fontSize: "var(--fs-xs)", color: "var(--txt-success)", fontWeight: "var(--fw-medium)" }}>
              ● Active since {fmt(todayRecord.checkIn)}
            </span>
          )}
          {hasCheckedOut && (
            <span style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)" }}>
              Shift complete · {
                (() => {
                  const [h1, m1] = todayRecord.checkIn.split(":").map(Number);
                  const [h2, m2] = todayRecord.checkOut.split(":").map(Number);
                  const diff = (h2 * 60 + m2) - (h1 * 60 + m1);
                  return `${Math.floor(diff / 60)}h ${diff % 60}m worked`;
                })()
              }
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* Small labelled field used inside the record summary */
function RecordField({ label, value, highlight }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
      <span style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
        {label}
      </span>
      <span style={{
        fontSize: "var(--fs-md)", fontWeight: "var(--fw-medium)",
        color: highlight ? "var(--clr-success-600)" : "var(--txt-primary)",
      }}>
        {value}
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════ */
function Attendance() {
  const { attendance, employees, getAppNow, clockIn, clockOut } = useStore();
  const { user: currentUser } = useAuth();

  const today = getAppNow();
  const [viewYear, setViewYear] = useState(2026);
  const [viewMonth, setViewMonth] = useState(0);
  const [view, setView] = useState("calendar");
  const [selectedDay, setSelectedDay] = useState(null);
  const [empFilter, setEmpFilter] = useState("all");

  /* ── Enrich attendance with employee names + Late status ── */
  const enriched = useMemo(() => attendance.map((r) => {
    const emp = employees.find((e) => idsMatch(e.id, r.employeeId));
    return { ...r, name: emp?.name ?? `Employee #${r.employeeId}`, status: resolveStatus(r) };
  }), [attendance, employees]);

  /* ── Build full month data (fill gaps with mock) ── */
  const fullMonth = useMemo(
    () => buildMonthAttendance(viewYear, viewMonth, employees, enriched),
    [viewYear, viewMonth, employees, enriched]
  );

  /* ── Per-day aggregate for calendar cells ── */
  const dayData = useMemo(() => {
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
  }, [fullMonth, employees]);

  /* ── Filtered rows for table view ── */
  const tableRows = useMemo(() => {
    const prefix = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-`;
    return fullMonth
      .filter((r) => r.date.startsWith(prefix) && (empFilter === "all" || idsMatch(r.employeeId, empFilter)))
      .map((r) => ({ ...r, status: resolveStatus(r), name: employees.find((e) => idsMatch(e.id, r.employeeId))?.name ?? `#${r.employeeId}` }))
      .sort((a, b) => b.date.localeCompare(a.date) || compareIds(a.employeeId, b.employeeId));
  }, [fullMonth, viewYear, viewMonth, empFilter, employees]);

  /* ── Month summary stats ── */
  const monthKey = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-`;
  const monthRecs = Object.entries(dayData)
    .filter(([d]) => d.startsWith(monthKey))
    .map(([, v]) => v);
  const totalRecs = monthRecs.reduce((s, d) => s + d.total, 0);
  const totalPresent = monthRecs.reduce((s, d) => s + d.present + d.late, 0);
  const avgRate = totalRecs > 0 ? Math.round((totalPresent / totalRecs) * 100) : 0;
  const workdays = Object.keys(dayData).filter((d) => d.startsWith(monthKey)).length;

  /* ── Selected day rows ── */
  const selectedRows = selectedDay ? (dayData[selectedDay]?.records ?? []) : [];

  const prevMonth = () => { if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); } else setViewMonth(m => m - 1); setSelectedDay(null); };
  const nextMonth = () => { if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); } else setViewMonth(m => m + 1); setSelectedDay(null); };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-5)" }}>

      {/* ── CLOCK IN / CLOCK OUT WIDGET ── */}
      <ClockInOutWidget
        employees={employees}
        attendance={attendance}
        getAppNow={getAppNow}
        clockIn={clockIn}
        clockOut={clockOut}
        currentUser={currentUser}
      />

      {/* ── HEADER ── */}
      <div className="content-card" style={{ padding: "var(--sp-4) var(--sp-6)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-4)", flexWrap: "wrap" }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: "var(--fs-2xl)", fontWeight: "var(--fw-semibold)", margin: 0 }}>Attendance</h2>
            <p style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)", marginTop: "2px" }}>
              {MONTHS[viewMonth]} {viewYear} · {workdays} working days · {avgRate}% avg rate
            </p>
          </div>

          {/* Month nav */}
          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={prevMonth}>‹</button>
            <span style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-medium)", minWidth: "140px", textAlign: "center" }}>
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={nextMonth}>›</button>
          </div>

          {/* View toggle */}
          <div style={{ display: "flex", gap: "var(--sp-1)", padding: "3px", background: "var(--bg-surface-alt)", borderRadius: "var(--radius-sm)" }}>
            {[["calendar", "📅 Calendar"], ["table", "📋 Table"]].map(([v, label]) => (
              <button key={v} type="button" onClick={() => setView(v)} style={{
                padding: "5px 14px", borderRadius: "6px", border: "none",
                background: view === v ? "var(--bg-surface)" : "transparent",
                color: view === v ? "var(--txt-primary)" : "var(--txt-secondary)",
                fontFamily: "var(--font-family)", fontSize: "var(--fs-sm)", cursor: "pointer",
                fontWeight: view === v ? "var(--fw-medium)" : "var(--fw-regular)",
                boxShadow: view === v ? "var(--shadow-xs)" : "none", transition: "all 0.15s",
              }}>{label}</button>
            ))}
          </div>
        </div>

        {/* Summary chips */}
        <div style={{ display: "flex", gap: "var(--sp-3)", marginTop: "var(--sp-3)", flexWrap: "wrap" }}>
          {[
            { label: "Present", value: monthRecs.reduce((s, d) => s + d.present, 0), variant: "success" },
            { label: "Late", value: monthRecs.reduce((s, d) => s + d.late, 0), variant: "warning" },
            { label: "On Leave", value: monthRecs.reduce((s, d) => s + d.leave, 0), variant: "info" },
            { label: "Absent", value: monthRecs.reduce((s, d) => s + d.absent, 0), variant: "danger" },
          ].map((s) => (
            <Badge key={s.label} variant={s.variant} dot>
              {s.value} {s.label}
            </Badge>
          ))}
          <span style={{ marginLeft: "auto", fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", alignSelf: "center" }}>
            Click a date to view details
          </span>
        </div>
      </div>

      {/* ── CALENDAR VIEW ── */}
      {view === "calendar" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "var(--sp-5)", alignItems: "start" }}>
          <div className="content-card">
            {/* Legend */}
            <div style={{ display: "flex", gap: "var(--sp-4)", marginBottom: "var(--sp-4)", flexWrap: "wrap" }}>
              {[
                { color: "var(--clr-success-500)", label: "≥90%" },
                { color: "var(--clr-warning-500)", label: "≥75%" },
                { color: "var(--clr-danger-400)", label: "<75%" },
              ].map((l) => (
                <div key={l.label} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                  <span style={{ width: "10px", height: "4px", borderRadius: "2px", background: l.color, display: "inline-block" }} />
                  <span style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)" }}>{l.label}</span>
                </div>
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--clr-success-500)", display: "inline-block" }} />
                <span style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)" }}>Present</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--clr-warning-500)", display: "inline-block" }} />
                <span style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)" }}>Late</span>
              </div>
            </div>

            <CalendarGrid
              year={viewYear} month={viewMonth}
              dayData={dayData}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
              todayStr={today.toISOString().split("T")[0]}
            />
          </div>

          {/* Day detail */}
          <DayPanel
            dateStr={selectedDay}
            rows={selectedRows}
            onClose={() => setSelectedDay(null)}
          />
        </div>
      )}

      {/* ── TABLE VIEW ── */}
      {view === "table" && (
        <div className="content-card">
          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", marginBottom: "var(--sp-5)", flexWrap: "wrap" }}>
            <select
              value={empFilter} onChange={(e) => setEmpFilter(e.target.value)}
              style={{
                padding: "7px var(--sp-3)", border: "1px solid var(--bdr-default)",
                borderRadius: "var(--radius-md)", background: "var(--bg-surface)",
                color: "var(--txt-primary)", fontFamily: "var(--font-family)",
                fontSize: "var(--fs-sm)", outline: "none", cursor: "pointer",
              }}
            >
              <option value="all">All Employees</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <span style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)", marginLeft: "auto" }}>
              {tableRows.length} records
            </span>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Date</th>
                  <th>Day</th>
                  <th>Check In</th>
                  <th>Check Out</th>
                  <th>Hours</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.slice(0, 50).map((r) => {
                  const dow = new Date(r.date + "T00:00:00").getDay();
                  const hours = r.checkIn && r.checkOut
                    ? (() => {
                        const [h1, m1] = r.checkIn.split(":").map(Number);
                        const [h2, m2] = r.checkOut.split(":").map(Number);
                        const diff = (h2 * 60 + m2) - (h1 * 60 + m1);
                        return `${Math.floor(diff / 60)}h${diff % 60 > 0 ? ` ${diff % 60}m` : ""}`;
                      })()
                    : "—";
                  return (
                    <tr key={`${r.employeeId}-${r.date}`}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
                          <Avatar name={r.name} size="xs" />
                          <span style={{ fontWeight: "var(--fw-medium)" }}>{r.name}</span>
                        </div>
                      </td>
                      <td style={{ fontSize: "var(--fs-sm)" }}>{r.date}</td>
                      <td style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)" }}>{DAYS[dow]}</td>
                      <td style={{ color: r.status === "Late" ? "var(--txt-warning)" : "var(--txt-primary)" }}>
                        {fmt(r.checkIn)}
                      </td>
                      <td>{fmt(r.checkOut)}</td>
                      <td style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)" }}>{hours}</td>
                      <td><Badge variant={variantMap(r.status)} size="sm">{r.status}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {tableRows.length > 50 && (
            <p style={{ textAlign: "center", fontSize: "var(--fs-sm)", color: "var(--txt-secondary)", marginTop: "var(--sp-4)" }}>
              Showing first 50 of {tableRows.length} records
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default Attendance;
