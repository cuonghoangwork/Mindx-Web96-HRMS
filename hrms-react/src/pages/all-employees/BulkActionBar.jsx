import { useTranslation } from "react-i18next";
import Button from "../../components/Button";

/* ─────────────────────────────────────────
   Bulk Action Bar
───────────────────────────────────────── */
export function BulkActionBar({ count, onExport, onDelete, onStatusChange, onClear, canDelete }) {
  const { t } = useTranslation();
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "var(--sp-3)",
      padding: "var(--sp-3) var(--sp-4)",
      background: "var(--bg-primary-subtle)",
      border: "1px solid var(--bdr-brand)",
      borderRadius: "var(--radius-md)",
      marginBottom: "var(--sp-4)",
      flexWrap: "wrap",
    }}>
      <span style={{ fontSize: "var(--fs-sm)", fontWeight: "var(--fw-medium)", color: "var(--txt-primary-brand)", marginRight: "var(--sp-2)" }}>
        {t("employees.allEmployees.bulkBar.selected", { defaultValue: "{{count}} selected", count })}
      </span>

      <Button variant="secondary" size="sm" onClick={onExport}>
        ↓ {t("employees.allEmployees.toolbar.exportCsv", { defaultValue: "Export CSV" })}
      </Button>

      <div style={{ display: "flex", gap: "var(--sp-2)", alignItems: "center" }}>
        <span className="meta-xs">{t("employees.allEmployees.bulkBar.setStatus", { defaultValue: "Set status:" })}</span>
        {["Active", "On Leave", "Terminated"].map((s) => (
          <Button variant="secondary" size="sm" key={s} onClick={() => onStatusChange(s)}>
            {t(`common.employeeStatus.${s}`, { defaultValue: s })}
          </Button>
        ))}
      </div>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
        {canDelete && (
          <Button variant="danger" size="sm" onClick={onDelete}>
            {t("employees.allEmployees.bulkBar.deleteSelected", { defaultValue: "Delete selected" })}
          </Button>
        )}

        <button
          type="button" onClick={onClear}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--txt-secondary)", fontSize: "18px", lineHeight: 1,
            padding: "2px 4px",
          }}
          aria-label={t("employees.allEmployees.bulkBar.clearSelectionAria", { defaultValue: "Clear selection" })}
        >×</button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   Pending Promotions — job-title/level/salary
   change requests awaiting admin review.
   Real data via PromotionRequestsAPI (already
   used in Settings > Promotions); surfaced here
   too since the mockup puts it on the roster page.
───────────────────────────────────────── */
