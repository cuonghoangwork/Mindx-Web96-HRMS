import { useTranslation } from "react-i18next";
import { fmtMoneyK } from "../../utils/payroll";

export function DeptChart({ data, currency, fxRate }) {
  const { t } = useTranslation();
  const max = Math.max(...data.map((d) => d.total), 1);
  if (!data.length) {
    return (
      <div style={{ color: "var(--txt-secondary)", fontSize: "var(--fs-sm)", padding: "var(--sp-4) 0" }}>
        {t("payroll.charts.noDeptData", { defaultValue: "No department data for this period." })}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
      {data.map((d) => (
        <div key={d.name} style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
          <span style={{
            width: "88px", flexShrink: 0, textAlign: "right", fontSize: "var(--fs-xs)",
            color: "var(--txt-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{d.name}</span>
          <div style={{ flex: 1, height: "10px", background: "var(--bg-surface-sub)" }}>
            <div style={{
              height: "10px", background: d.color,
              width: `${Math.round((d.total / max) * 100)}%`, transition: "width 0.5s ease",
            }} />
          </div>
          <span style={{ width: "92px", textAlign: "right", fontSize: "var(--fs-xs)", color: "var(--txt-primary)" }}>
            {fmtMoneyK(d.total, currency, fxRate)}
          </span>
          <span style={{ width: "28px", textAlign: "right", fontSize: "var(--fs-xs)", color: "var(--txt-secondary)" }}>
            {d.count}
          </span>
        </div>
      ))}
    </div>
  );
}
