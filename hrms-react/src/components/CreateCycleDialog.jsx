import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PerformanceReviewsAPI } from "../api";
import Button from "./Button";
import { translateApiError } from "../utils/apiError";

// Milestone 4 — ADMIN-only custom cycle creation. Same bespoke
// .modal-overlay/.modal pattern as PerformanceReviewDialog.jsx and
// ProposePromotionModal.jsx (no reusable <Modal> wrapper exists in this
// codebase). Visibility of the button that opens this dialog is gated by
// Performance.jsx on isAdmin; the real enforcement is the backend's admin
// middleware on POST /performance/cycles regardless.
function CreateCycleDialog({ onClose, onCreated }) {
  const { t } = useTranslation();

  const [label, setLabel] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await PerformanceReviewsAPI.createCycle({ label, start, end });
      onCreated?.(res.data);
      onClose?.();
    } catch (err) {
      setError(translateApiError(err, t) || t("performance.dialog.submitFailed", { defaultValue: "Failed to submit." }));
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "400px" }}>
        <div className="modal-header">
          <h2>{t("performance.createCycleDialog.title")}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label={t("common.actions.close", { defaultValue: "Close" })}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && <p className="form-error">{error}</p>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="cycle-label">{t("performance.createCycleDialog.labelField")}</label>
            <input id="cycle-label" type="text" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="cycle-start">{t("performance.createCycleDialog.startField")}</label>
            <input id="cycle-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="cycle-end">{t("performance.createCycleDialog.endField")}</label>
            <input id="cycle-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <div className="modal-actions">
            <Button variant="secondary" type="button" onClick={onClose}>
              {t("performance.createCycleDialog.cancel")}
            </Button>
            <Button variant="primary" type="submit" loading={submitting} disabled={!label.trim()}>
              {t("performance.createCycleDialog.create")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateCycleDialog;
