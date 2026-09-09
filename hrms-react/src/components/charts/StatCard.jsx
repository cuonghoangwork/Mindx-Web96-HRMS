import { Sparkline } from './Sparkline'

/* ─────────────────────────────────────────
   StatCard with sparkline
───────────────────────────────────────── */
export function StatCard({ title, value, hint, trend, trendUp, sparkData, accentColor = "var(--clr-primary-400)" }) {
  return (
    <div className="stat-card">
      <div className="stat-card-label">{title}</div>
      <div className="stat-card-value" style={{ color: accentColor }}>{value}</div>
      {trend && (
        <div className={`stat-card-trend ${trendUp ? "up" : "down"}`}>
          <span>{trendUp ? "↑" : "↓"}</span> {trend}
        </div>
      )}
      {hint && <div className="stat-card-hint">{hint}</div>}
      {sparkData && (
        <div style={{ marginTop: "var(--sp-2)" }}>
          <Sparkline data={sparkData} color={accentColor} />
        </div>
      )}
    </div>
  );
}
