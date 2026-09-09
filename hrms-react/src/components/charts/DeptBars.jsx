
/* ─────────────────────────────────────────
   Headcount by Department — horizontal bar chart
───────────────────────────────────────── */
const DEPT_COLORS = [
  "var(--clr-primary-400)",
  "var(--clr-success-500)",
  "var(--clr-warning-500)",
  "var(--clr-info-500)",
  "var(--clr-primary-300)",
  "var(--clr-success-400)",
];

export function DeptBars({ departments, getEmployeeCountByDepartment }) {
  const data = departments
    .map((d, i) => ({
      name: d.name,
      count: getEmployeeCountByDepartment(d.name),
      color: DEPT_COLORS[i % DEPT_COLORS.length],
    }))
    .sort((a, b) => b.count - a.count);

  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {data.map((d) => (
        <div key={d.name} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{
            fontSize: "var(--fs-xs)", color: "var(--txt-secondary)",
            width: "80px", flexShrink: 0, textAlign: "right",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>{d.name}</span>
          <div style={{
            flex: 1, height: "8px", background: "var(--bg-surface-sub)",
          }}>
            <div style={{
              height: "8px",
              background: d.color,
              width: `${Math.round((d.count / max) * 100)}%`,
              transition: "width 0.5s ease",
            }} />
          </div>
          <span style={{
            fontSize: "var(--fs-xs)", fontWeight: "var(--fw-medium)",
            color: "var(--txt-primary)", minWidth: "20px", textAlign: "right",
          }}>{d.count}</span>
        </div>
      ))}
    </div>
  );
}
