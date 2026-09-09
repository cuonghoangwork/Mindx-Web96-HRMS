import { useTranslation } from "react-i18next";
import { fmtMoneyK } from "../../utils/payroll";

export function TypeDonut({ segments, total, currency, fxRate }) {
  const { t } = useTranslation();
  const sum = segments.reduce((acc, s) => acc + s.value, 0) || 1;
  let offset = 0;
  const circumference = 2 * Math.PI * 32;
  return (
    <div>
      <div style={{ position: "relative", width: "96px", height: "96px", margin: "0 auto var(--sp-4)" }}>
        <svg width="96" height="96" viewBox="0 0 96 96" style={{ transform: "rotate(-90deg)" }}>
          {segments.map((s) => {
            const len = (s.value / sum) * circumference;
            const el = (
              <circle
                key={s.label}
                cx="48" cy="48" r="32" fill="none"
                stroke={s.color} strokeWidth="13"
                strokeDasharray={`${len} ${circumference - len}`}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return el;
          })}
        </svg>
        <div style={{
          position: "absolute", inset: 0, display: "grid", placeItems: "center",
          flexDirection: "column", textAlign: "center",
        }}>
          <div>
            <div style={{ fontSize: "var(--fs-xl)", fontWeight: "var(--fw-semibold)", color: "var(--txt-primary)" }}>{total}</div>
            <div style={{ fontSize: "var(--fs-2xs)", color: "var(--txt-secondary)" }}>{t("payroll.charts.staffLabel", { defaultValue: "staff" })}</div>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {segments.map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", fontSize: "var(--fs-xs)" }}>
            <span style={{ width: "9px", height: "9px", borderRadius: "2px", background: s.color, flexShrink: 0 }} />
            <span style={{ flex: 1, color: "var(--txt-secondary)" }}>{s.label}</span>
            <span style={{ color: "var(--txt-primary)" }}>{fmtMoneyK(s.total, currency, fxRate)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
