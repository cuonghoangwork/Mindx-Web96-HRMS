
/* ═══════════════════════════════════════════
   Monthly heatmap — alpha-shaded rate cells, click to select
═══════════════════════════════════════════ */
export function MonthlyHeatmap({ year, month, dayData, selectedDay, onSelectDay, todayStr, weekdayLabels }) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay();

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push({ blank: true, key: `b${i}` });
  for (let d = 1; d <= daysInMonth; d++) {
    const dateISO = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dow = new Date(year, month, d).getDay();
    const isWeekend = dow === 0 || dow === 6;
    const data = dayData[dateISO];
    const rate = data && !isWeekend ? Math.round(((data.present + data.late) / data.total) * 100) : null;
    cells.push({ blank: false, key: dateISO, dateISO, day: d, rate, isWeekend, isToday: dateISO === todayStr, isSelected: dateISO === selectedDay });
  }
  while (cells.length % 7 !== 0) cells.push({ blank: true, key: `e${cells.length}` });

  const alphaFor = (rate) => 0.06 + (rate / 100) * 0.3;

  return (
    <div style={{ border: "1px solid var(--bdr-subtle)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid var(--bdr-subtle)" }}>
        {weekdayLabels.map((l) => (
          <div key={l} style={{ padding: "var(--sp-2) 0", fontSize: "var(--fs-2xs)", fontWeight: "var(--fw-bold)", color: "var(--txt-disabled)", textAlign: "center", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {l}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
        {cells.map((c) => (
          <div
            key={c.key}
            onClick={() => !c.blank && c.rate !== null && onSelectDay(c.dateISO)}
            style={{
              minHeight: "62px", padding: "var(--sp-2) var(--sp-3)",
              display: "flex", flexDirection: "column", justifyContent: "space-between",
              borderRight: "1px solid var(--bdr-subtle)", borderBottom: "1px solid var(--bdr-subtle)",
              cursor: !c.blank && c.rate !== null ? "pointer" : "default",
              background: c.blank ? "transparent"
                : c.isSelected ? "var(--bg-primary-subtle)"
                : c.rate !== null ? `rgba(47, 111, 237, ${alphaFor(c.rate)})`
                : "transparent",
              boxShadow: c.isSelected ? "inset 0 0 0 2px var(--bdr-brand)"
                : c.isToday ? "inset 0 0 0 2px var(--clr-primary-300)" : "none",
            }}
          >
            {!c.blank && (
              <>
                <div style={{ fontSize: "var(--fs-xs)", fontWeight: "var(--fw-bold)", color: c.isToday ? "var(--txt-primary-brand)" : "var(--txt-primary)" }}>
                  {c.day}
                </div>
                {c.rate !== null && (
                  <div style={{ height: "4px", background: "var(--bg-surface-sub)" }}>
                    <div style={{ height: "4px", width: `${c.rate}%`, background: "var(--clr-primary-400)" }} />
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
