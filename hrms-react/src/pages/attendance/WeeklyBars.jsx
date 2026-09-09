import { isoOf } from "../../utils/attendance";

/* ═══════════════════════════════════════════
   Weekly bar chart — % checked-in per day, click to select
═══════════════════════════════════════════ */
export function WeeklyBars({ weekDates, dayData, selectedDay, onSelectDay, days }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "var(--sp-3)", height: "130px" }}>
      {weekDates.map((date) => {
        const dateStr = isoOf(date);
        const dow = date.getDay();
        const isWeekend = dow === 0 || dow === 6;
        const data = dayData[dateStr];
        const pct = data ? Math.round(((data.present + data.late) / data.total) * 100) : 0;
        const isSelected = dateStr === selectedDay;

        return (
          <div
            key={dateStr}
            onClick={() => !isWeekend && data && onSelectDay(dateStr)}
            style={{
              flex: 1, height: "100%", display: "flex", flexDirection: "column",
              alignItems: "center", gap: "var(--sp-2)",
              cursor: isWeekend || !data ? "default" : "pointer",
              opacity: isWeekend ? 0.4 : 1,
            }}
          >
            <div style={{ fontSize: "var(--fs-xs)", fontWeight: "var(--fw-semibold)", color: "var(--txt-secondary)" }}>
              {data ? `${pct}%` : "—"}
            </div>
            <div style={{ width: "100%", flex: 1, display: "flex", alignItems: "flex-end", background: "var(--bg-surface-sub)" }}>
              {data && (
                <div style={{
                  height: `${Math.max(pct, 4)}%`, width: "100%",
                  background: isSelected ? "var(--clr-primary-400)" : "var(--txt-primary)",
                  opacity: isSelected ? 1 : 0.5,
                  transition: "background 0.15s, opacity 0.15s",
                }} />
              )}
            </div>
            <div style={{
              fontSize: "var(--fs-xs)", fontWeight: isSelected ? "var(--fw-bold)" : "var(--fw-medium)",
              color: isSelected ? "var(--txt-primary-brand)" : "var(--txt-disabled)",
              textTransform: "uppercase",
            }}>
              {days[dow]}
            </div>
          </div>
        );
      })}
    </div>
  );
}
