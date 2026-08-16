import { useTranslation } from "react-i18next";

/**
 * AttendanceCalendarGrid — month calendar with per-day attendance-rate bars
 * and status dots. Extracted from pages/Attendance.jsx (8.0e Day 7) so the
 * Employee Detail "Attendance" tab can reuse the same component instead of
 * duplicating it, per the sprint plan.
 *
 * Day/month names come from the common.days / common.months i18n arrays
 * (task 6.2) rather than a module-level constant, since they need to be
 * locale-aware.
 */
function AttendanceCalendarGrid({ year, month, dayData, selectedDay, onSelectDay, todayStr, dotOnly = false }) {
  const { t } = useTranslation();
  const days = t("common.days", { returnObjects: true });
  const firstDow = new Date(year, month, 1).getDay();
  const daysCount = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: firstDow + daysCount }, (_, i) =>
    i < firstDow ? null : i - firstDow + 1
  );
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px", marginBottom: "4px" }}>
        {days.map((d) => (
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

          // dotOnly: single status dot instead of the rate bar/percentage —
          // used by ViewEmployee's per-employee Attendance tab (mockup's
          // minimal calendar), where dayData is scoped to one employee so
          // there's only ever one status to show, not an aggregate rate.
          const dotColor = data?.present > 0 ? "var(--clr-success-500)"
            : data?.late > 0 ? "var(--clr-warning-500)"
            : data?.leave > 0 ? "var(--clr-info-500)"
            : data?.absent > 0 ? "var(--clr-danger-400)"
            : null;

          return (
            <div
              key={day}
              onClick={() => !isWeekend && onSelectDay(isSelected ? null : dateStr)}
              style={dotOnly ? {
                cursor: isWeekend ? "default" : "pointer",
                opacity: isWeekend ? 0.4 : 1,
                padding: "6px 4px",
                minHeight: "36px",
                display: "flex", flexDirection: "column", alignItems: "center", gap: "5px",
                borderRadius: isSelected ? "var(--radius-sm)" : "0",
                background: isSelected ? "var(--bg-primary-subtle)" : "transparent",
                border: isSelected ? "1px solid var(--bdr-brand)" : "1px solid transparent",
              } : {
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

              {dotOnly ? (
                dotColor && !isWeekend && (
                  <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: dotColor }} />
                )
              ) : (
                data && !isWeekend && (
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
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default AttendanceCalendarGrid;
