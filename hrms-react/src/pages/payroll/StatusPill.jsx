import { useTranslation } from "react-i18next";

const STATUS_STYLE = {
  draft: { bg: "var(--bg-warning-subtle)", color: "var(--txt-warning)", border: "var(--bdr-warning)" },
  approved: { bg: "var(--bg-info-subtle)", color: "var(--txt-info)", border: "var(--bdr-info)" },
  paid: { bg: "var(--bg-success-subtle)", color: "var(--txt-success)", border: "var(--bdr-success)" },
};

export function StatusPill({ status }) {
  const { t } = useTranslation();
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.draft;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "5px",
      padding: "3px 10px", borderRadius: "var(--radius-full)",
      fontSize: "var(--fs-xs)", fontWeight: "var(--fw-medium)",
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      textTransform: "capitalize",
    }}>
      <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "currentColor" }} />
      {t(`common.payrollStatus.${status}`, { defaultValue: status })}
    </span>
  );
}
