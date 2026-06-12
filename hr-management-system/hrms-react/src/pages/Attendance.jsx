import { useState, useMemo } from "react";
import { useStore } from "../context/StoreContext";
import Avatar from "../components/Avatar";
import Badge from "../components/Badge";

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

const STATUS_COLOR = {
  Present:    "var(--clr-success-500)",
  Late:       "var(--clr-warning-500)",
  "On Leave": "var(--clr-info-500)",
  Absent:     "var(--clr-danger-400)",
};
const STATUS_BG = {
  Present:    "var(--bg-success-subtle)",
  Late:       "var(--bg-warning-subtle)",
  "On Leave": "var(--bg-info-subtle)",
  Absent:     "var(--bg-danger-subtle)",
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
    const dow  = new Date(year, month, day).getDay(); // 0=Sun
    if (dow === 0 || dow === 6) continue; // skip weekends

    employees.forEach((emp) => {
      const key = `${emp.id}-${date}`;
      if (existingKeys.has(key)) return;

      // Deterministic pseudo-random based on emp.id + day
      const seed = (emp.id * 17 + day * 7) % 100;
      let status, checkIn, checkOut;

      if (seed < 5) {
        status = "On Leave"; checkIn = null; checkOut = null;
      } else if (seed < 10) {
        status = "Present"; checkIn = null; checkOut = null; // absent (no check-in)
        status = "Present"; // mark as absent via no checkIn
        // Actually mark absent
        status = seed < 7 ? "On Leave" : "Present";
        if (status === "Present" && seed < 8) {
          checkIn = null; checkOut = null;
        } else {
          const late = seed > 85;
          const h = late ? 9 + Math.floor(seed / 30) : 8;
          const m = (seed * 3) % 60;
          checkIn  = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
          checkOut = `${String(h + 8 + (seed % 2)).padStart(2,"0")}:${String((m + 15) % 60).padStart(2,"0")}`;
        }
      } else {
        const late = seed > 82;
        const h    = late ? 9 + Math.floor((seed - 82) / 6) : 8 + ((seed % 2));
        const m    = (seed * 3) % 60;
        checkIn    = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
        checkOut   = `${String(Math.min(h + 8 + (seed % 2), 20)).padStart(2,"0")}:${String((m + 15) % 60).padStart(2,"0")}`;
        status     = "Present";
      }

      result.push({ employeeId: emp.id, date, checkIn, checkOut, status });
    });
  }
  return result;
}

/* ─── Month calendar grid ─── */
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function CalendarGrid({ year, month, dayData, selectedDay, onSelectDay }) {
  const firstDow   = new Date(year, month, 1).getDay();
  const daysCount  = new Date(year, month + 1, 0).getDate();
  const cells      = Array.from({ length: firstDow + daysCount }, (_, i) =>
    i < firstDow ? null : i - firstDow + 1
  );
  // Pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      {/* Day headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px", marginBottom: "4px" }}>
        {DAYS.map((d) => (
          <div key={d} style={{
            textAlign: "center", fontSize: "var(--fs-xs)", fontWeight: "var(--fw-medium)",
            color: "var(--txt-secondary)", padding: "4px 0",
          }}>{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "3px" }}>
        {cells.map((day, idx) => {
          if (!day) return <div key={`empty-${idx}`} />;
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dow     = new Date(year, month, day).getDay();
          const isWeekend = dow === 0 || dow === 6;
          const isToday   = dateStr === new Date().toISOString().split("T")[0];
          const isSelected = dateStr === selectedDay;
          const data      = dayData[dateStr];

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
              {/* Day number */}
              <div style={{
                fontSize: "var(--fs-xs)", fontWeight: isToday ? "var(--fw-semibold)" : "var(--fw-regular)",
                color: isSelected ? "var(--txt-primary-brand)"
                  : isToday ? "var(--clr-primary-400)"
                  : "var(--txt-primary)",
                lineHeight: 1,
              }}>{day}</div>

              {/* Mini bar + rate */}
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

                  {/* Dot indicators */}
                  <div style={{ display: "flex", gap: "2px", flexWrap: "wrap", marginTop: "1px" }}>
                    {data.present > 0 && <span style={{ width: "4px", height: "4px", borderRadius: "50%", background: "var(--clr-success-500)" }} />}
                    {data.late    > 0 && <span style={{ width: "4px", height: "4px", borderRadius: "50%", background: "var(--clr-warning-500)" }} />}
                    {data.leave   > 0 && <span style={{ width: "4px", height: "4px", borderRadius: "50%", background: "var(--clr-info-500)" }} />}
                    {data.absent  > 0 && <span style={{ width: "4px", height: "4px", borderRadius: "50%", background: "var(--clr-danger-400)" }} />}
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
      {/* Header */}
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

      {/* Summary chips */}
      <div style={{ display: "flex", gap: "var(--sp-2)", padding: "var(--sp-3) var(--sp-5)", flexWrap: "wrap", borderBottom: "1px solid var(--bdr-subtle)" }}>
        {[["Present","success"],["Late","warning"],["On Leave","info"],["Absent","danger"]].map(([s, v]) => {
          const count = rows.filter((r) => r.status === s).length;
          return count > 0 && (
            <Badge key={s} variant={v} dot size="sm">{count} {s}</Badge>
          );
        })}
      </div>

      {/* Table */}
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

/* ═══════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════ */
function Attendance() {
  const { attendance, employees } = useStore();

  const today      = new Date();
  const [viewYear,  setViewYear]  = useState(2024); // use data year
  const [viewMonth, setViewMonth] = useState(0);    // January 2024 has our data
  const [view,      setView]      = useState("calendar"); // "calendar" | "table"
  const [selectedDay, setSelectedDay] = useState(null);
  const [empFilter,   setEmpFilter]   = useState("all");

  /* ── Enrich attendance with employee names + Late status ── */
  const enriched = useMemo(() => attendance.map((r) => {
    const emp = employees.find((e) => e.id === r.employeeId);
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
      if      (s === "Present")  map[r.date].present++;
      else if (s === "Late")     map[r.date].late++;
      else if (s === "On Leave") map[r.date].leave++;
      else                       map[r.date].absent++;
      map[r.date].total++;
      map[r.date].records.push({ ...r, status: s, name: employees.find((e) => e.id === r.employeeId)?.name ?? `#${r.employeeId}` });
    });
    return map;
  }, [fullMonth, employees]);

  /* ── Filtered rows for table view ── */
  const tableRows = useMemo(() => {
    const prefix = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-`;
    return fullMonth
      .filter((r) => r.date.startsWith(prefix) && (empFilter === "all" || r.employeeId === Number(empFilter)))
      .map((r) => ({ ...r, status: resolveStatus(r), name: employees.find((e) => e.id === r.employeeId)?.name ?? `#${r.employeeId}` }))
      .sort((a, b) => b.date.localeCompare(a.date) || a.employeeId - b.employeeId);
  }, [fullMonth, viewYear, viewMonth, empFilter, employees]);

  /* ── Month summary stats ── */
  const monthKey  = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-`;
  const monthRecs = Object.entries(dayData)
    .filter(([d]) => d.startsWith(monthKey))
    .map(([, v]) => v);
  const totalRecs    = monthRecs.reduce((s, d) => s + d.total, 0);
  const totalPresent = monthRecs.reduce((s, d) => s + d.present + d.late, 0);
  const avgRate      = totalRecs > 0 ? Math.round((totalPresent / totalRecs) * 100) : 0;
  const workdays     = Object.keys(dayData).filter((d) => d.startsWith(monthKey)).length;

  /* ── Selected day rows ── */
  const selectedRows = selectedDay ? (dayData[selectedDay]?.records ?? []) : [];

  const prevMonth = () => { if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); } else setViewMonth(m => m - 1); setSelectedDay(null); };
  const nextMonth = () => { if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); } else setViewMonth(m => m + 1); setSelectedDay(null); };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-5)" }}>

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
            { label: "Present",  value: monthRecs.reduce((s,d)=>s+d.present,0), variant: "success" },
            { label: "Late",     value: monthRecs.reduce((s,d)=>s+d.late,0),    variant: "warning" },
            { label: "On Leave", value: monthRecs.reduce((s,d)=>s+d.leave,0),   variant: "info" },
            { label: "Absent",   value: monthRecs.reduce((s,d)=>s+d.absent,0),  variant: "danger" },
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
                { color: "var(--clr-danger-400)",  label: "<75%" },
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
                  const dow    = new Date(r.date + "T00:00:00").getDay();
                  const hours  = r.checkIn && r.checkOut
                    ? (() => {
                        const [h1,m1] = r.checkIn.split(":").map(Number);
                        const [h2,m2] = r.checkOut.split(":").map(Number);
                        const diff = (h2*60+m2)-(h1*60+m1);
                        return `${Math.floor(diff/60)}h${diff%60>0?` ${diff%60}m`:""}`;
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
