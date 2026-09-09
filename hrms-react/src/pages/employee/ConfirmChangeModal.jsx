import { useTranslation } from "react-i18next";
import Button from "../../components/Button";

export function ConfirmChangeModal({ change, employeeName, onConfirm, onCancel }) {
  const { t } = useTranslation();
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t("employees.viewEmployee.confirmChangeModal.title", { defaultValue: "Confirm change" })}</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onCancel}
            aria-label={t("common.actions.close", { defaultValue: "Close" })}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <p style={{ fontSize: "14px", color: "var(--text-muted)" }}>
          {t("employees.viewEmployee.confirmChangeModal.updatePromptPrefix", { defaultValue: "Update" })} <strong>{change.label}</strong> {t("employees.viewEmployee.confirmChangeModal.updatePromptMiddle", { defaultValue: "for" })}{" "}
          <strong>{employeeName}</strong>{t("employees.viewEmployee.confirmChangeModal.updatePromptSuffix", { defaultValue: "?" })}
        </p>

        <div className="confirm-change-summary">
          <div>
            <span className="detail-label">{t("employees.viewEmployee.confirmChangeModal.current", { defaultValue: "Current" })}</span>
            <span className="detail-value">{change.from}</span>
          </div>
          <span className="confirm-change-arrow" aria-hidden="true">
            →
          </span>
          <div>
            <span className="detail-label">{t("employees.viewEmployee.confirmChangeModal.new", { defaultValue: "New" })}</span>
            <span className="detail-value">{change.to}</span>
          </div>
        </div>

        <div className="modal-actions">
          <Button
            variant="secondary"
            onClick={onCancel}
          >
            {t("common.actions.cancel", { defaultValue: "Cancel" })}
          </Button>
          <Button variant="primary" onClick={onConfirm}>
            {t("common.actions.confirm", { defaultValue: "Confirm" })}
          </Button>
        </div>
      </div>
    </div>
  );
}
