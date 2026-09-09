
/* ─────────────────────────────────────────
   Contract Mix — single stacked bar + legend
   (mockup's stackTrackStyle/contractSegments pattern)
───────────────────────────────────────── */
export function ContractMixBar({ segments, total }) {
  let acc = 0;
  return (
    <div>
      <div style={{ position: "relative", height: "22px", background: "var(--bg-surface-alt)", marginBottom: "16px", marginTop: "4px" }}>
        {segments.map((seg) => {
          const pct = total ? (seg.value / total) * 100 : 0;
          const el = (
            <div key={seg.label} style={{
              position: "absolute", left: `${acc}%`, top: 0, bottom: 0, width: `${pct}%`,
              background: seg.color, borderRight: "2px solid var(--bg-page)",
            }} />
          );
          acc += pct;
          return el;
        })}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {segments.map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: "9px" }}>
            <span style={{ width: "9px", height: "9px", background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: "12.5px", color: "var(--txt-secondary)", flex: 1 }}>{s.label}</span>
            <span style={{ fontSize: "12.5px", fontWeight: "var(--fw-bold)", color: "var(--txt-primary)" }}>{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
