import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { resolveStatus, buildMonthAttendance, buildDayData, isoOf } from "../../utils/attendance";
import AttendanceCalendarGrid from "../../components/AttendanceCalendarGrid";
import Badge from "../../components/Badge";
import { idsMatch } from "../../utils/id";
import Button from "../../components/Button";

// Task 4.3: per-employee attendance log/report view. Data already exists in
// the attendance collection (via StoreContext); this maps each recorded
// status to the Badge variant used elsewhere (Attendance.jsx's variantMap).
const ATTENDANCE_STATUS_VARIANT = {
  Present: "success",
  Late: "warning",
  "On Leave": "info",
  Absent: "danger",
  "No-show": "danger",
};

export function AttendanceReportCard({ employee, attendance, navigate, getAppNow, embedded = false }) {
  const { t } = useTranslation();
  const months = t("common.months", { returnObjects: true });
  const [showAll, setShowAll] = useState(false);

  const now = getAppNow ? getAppNow() : new Date();
  const [viewYear, setViewYear] = useState(() => now.getFullYear());
  const [viewMonth, setViewMonth] = useState(() => now.getMonth());
  const [selectedDay, setSelectedDay] = useState(null);

  const records = useMemo(
    () =>
      attendance
        .filter((r) => idsMatch(r.employeeId, employee.id))
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date)),
    [attendance, employee.id],
  );

  const counts = useMemo(() => {
    const c = {};
    records.forEach((r) => {
      c[r.status] = (c[r.status] ?? 0) + 1;
    });
    return c;
  }, [records]);

  const total = records.length;
  const presentLike = (counts["Present"] ?? 0) + (counts["Late"] ?? 0);
  const rate = total > 0 ? Math.round((presentLike / total) * 100) : null;
  const visible = showAll ? records : records.slice(0, 10);

  // 8.0e Day 7 — reuse the same month-calendar component/data helpers as
  // pages/Attendance.jsx, scoped to just this one employee.
  const monthPrefix = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-`;
  const monthExisting = useMemo(
    () => records.filter((r) => r.date.startsWith(monthPrefix)).map((r) => ({ ...r, status: resolveStatus(r) })),
    [records, monthPrefix],
  );
  const monthFull = useMemo(
    () => buildMonthAttendance(viewYear, viewMonth, [employee], monthExisting),
    [viewYear, viewMonth, employee, monthExisting],
  );
  const calendarDayData = useMemo(
    () => buildDayData(monthFull, [employee]),
    [monthFull, employee],
  );

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); } else setViewMonth((m) => m - 1);
    setSelectedDay(null);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); } else setViewMonth((m) => m + 1);
    setSelectedDay(null);
  };

  return (
    <div className={embedded ? undefined : "content-card"} style={embedded ? undefined : { marginTop: "20px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--sp-3)",
          flexWrap: "wrap",
          marginBottom: "var(--sp-4)",
        }}
      >
        <div>
          <h3 style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-semibold)", margin: 0 }}>
            {t("employees.viewEmployee.attendanceReport.title", { defaultValue: "Attendance Report" })}
          </h3>
          <p style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)", marginTop: "2px" }}>
            {t("employees.viewEmployee.attendanceReport.recordsOnFile", { count: total, defaultValue_one: "{{count}} record on file", defaultValue_other: "{{count}} records on file" })}
            {rate !== null ? t("employees.viewEmployee.attendanceReport.attendanceRateSuffix", { defaultValue: " · {{rate}}% attendance rate", rate }) : ""}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => navigate(`/attendance?employee=${employee.id}`)}
        >
          {t("employees.viewEmployee.attendanceReport.openFullCalendar", { defaultValue: "Open full calendar" })}
        </Button>
      </div>

      {total === 0 ? (
        <div
          style={{
            padding: "var(--sp-6)",
            textAlign: "center",
            color: "var(--txt-secondary)",
            fontSize: "var(--fs-sm)",
          }}
        >
          {t("employees.viewEmployee.attendanceReport.noRecords", { defaultValue: "No attendance records for this employee yet." })}
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: "var(--sp-3)", flexWrap: "wrap", marginBottom: "var(--sp-4)" }}>
            {Object.entries(counts).map(([label, count]) => (
              <Badge key={label} variant={ATTENDANCE_STATUS_VARIANT[label] ?? "neutral"} dot>
                {count} {t(`employees.viewEmployee.attendanceReport.statusLabels.${label}`, { defaultValue: label })}
              </Badge>
            ))}
          </div>

          <div style={{
            border: "1px solid var(--bdr-subtle)", borderRadius: "var(--radius-lg)",
            padding: "var(--sp-4)", marginBottom: "var(--sp-5)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--sp-4)" }}>
              <Button variant="secondary" size="sm" onClick={prevMonth}>‹</Button>
              <span style={{ fontSize: "var(--fs-sm)", fontWeight: "var(--fw-medium)", color: "var(--txt-primary)" }}>
                {months[viewMonth]} {viewYear}
              </span>
              <Button variant="secondary" size="sm" onClick={nextMonth}>›</Button>
            </div>
            <AttendanceCalendarGrid
              year={viewYear}
              month={viewMonth}
              dayData={calendarDayData}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
              todayStr={isoOf(now)}
              dotOnly
            />
          </div>

          <div className="table-wrap">
            <table className="data-table" style={{ fontSize: "var(--fs-sm)" }}>
              <thead>
                <tr>
                  <th>{t("employees.viewEmployee.attendanceReport.date", { defaultValue: "Date" })}</th>
                  <th>{t("employees.viewEmployee.attendanceReport.checkIn", { defaultValue: "Check In" })}</th>
                  <th>{t("employees.viewEmployee.attendanceReport.checkOut", { defaultValue: "Check Out" })}</th>
                  <th>{t("common.fieldLabels.status", { defaultValue: "Status" })}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.date}>
                    <td>{r.date}</td>
                    <td>{r.checkIn ?? "—"}</td>
                    <td>{r.checkOut ?? "—"}</td>
                    <td>
                      <Badge variant={ATTENDANCE_STATUS_VARIANT[r.status] ?? "neutral"} size="sm">
                        {t(`employees.viewEmployee.attendanceReport.statusLabels.${r.status}`, { defaultValue: r.status })}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {records.length > 10 && (
            <Button
              variant="secondary"
              size="sm"
              style={{ marginTop: "var(--sp-4)" }}
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll ? t("employees.viewEmployee.attendanceReport.showRecentOnly", { defaultValue: "Show recent only" }) : t("employees.viewEmployee.attendanceReport.showAllRecords", { defaultValue: "Show all {{count}} records", count: records.length })}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
