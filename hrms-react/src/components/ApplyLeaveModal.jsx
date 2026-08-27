import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Button from "./Button";
import { LeaveRequestsAPI } from "../api";
import { LEAVE_TYPES, leaveTypeLabel } from "../utils/leaveTypes";
import { translateApiError } from "../utils/apiError";

// Extracted out of Dashboard.jsx so ViewEmployee.jsx's own-profile view can
// offer the same "Apply for leave" action (LeaveRequestsAPI.create already
// resolves the request to the calling user's own linked employee record).
function ApplyLeaveModal({ onClose, onSubmit }) {
  const { t } = useTranslation();
  const [type, setType] = useState("annual");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [balances, setBalances] = useState(null);

  // Fetched once on open, purely to show "N days remaining" next to the
  // type picker — the backend re-validates the balance server-side
  // regardless, so a stale value here can't let an over-balance request
  // through, it can just show a momentarily outdated hint.
  useEffect(() => {
    LeaveRequestsAPI.balance()
      .then((res) => setBalances(res?.data?.balances ?? null))
      .catch(() => setBalances(null));
  }, []);

  const selectedBalance = balances?.find((b) => b.type === type);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!startDate || !endDate) {
      setError(t("applyLeaveModal.datesRequired", { defaultValue: "Start and end dates are required." }));
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({ type, startDate, endDate, reason });
      onClose();
    } catch (err) {
      setError(translateApiError(err, t) || t("applyLeaveModal.submitFailed", { defaultValue: "Failed to submit leave request." }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "440px" }}>
        <div className="modal-header">
          <h2>{t("applyLeaveModal.title", { defaultValue: "Apply for Leave" })}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label={t("common.actions.close", { defaultValue: "Close" })}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && <p className="form-error">{error}</p>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="leave-type">{t("applyLeaveModal.typeLabel", { defaultValue: "Leave Type *" })}</label>
            <select
              id="leave-type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              required
            >
              {LEAVE_TYPES.map((value) => (
                <option key={value} value={value}>{leaveTypeLabel(value, t)}</option>
              ))}
            </select>
            {selectedBalance && (
              <p style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", marginTop: "4px" }}>
                {selectedBalance.remaining === null
                  ? t("applyLeaveModal.unlimited", { defaultValue: "Unlimited" })
                  : t("applyLeaveModal.remaining", {
                      remaining: selectedBalance.remaining,
                      accrued: selectedBalance.accrued,
                      count: selectedBalance.accrued,
                      defaultValue_one: "{{remaining}} of {{accrued}} day remaining this year",
                      defaultValue_other: "{{remaining}} of {{accrued}} days remaining this year",
                    })}
              </p>
            )}
          </div>
          <div className="form-group">
            <label htmlFor="leave-start">{t("applyLeaveModal.startDateLabel", { defaultValue: "Start Date *" })}</label>
            <input
              type="date"
              id="leave-start"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="leave-end">{t("applyLeaveModal.endDateLabel", { defaultValue: "End Date *" })}</label>
            <input
              type="date"
              id="leave-end"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="leave-reason">{t("applyLeaveModal.reasonLabel", { defaultValue: "Reason" })}</label>
            <textarea
              id="leave-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("applyLeaveModal.reasonPlaceholder", { defaultValue: "Optional" })}
              style={{ resize: "vertical" }}
            />
          </div>
          <div className="modal-actions">
            <Button variant="secondary" type="button" onClick={onClose}>
              {t("common.actions.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button variant="primary" type="submit" loading={submitting}>
              {t("applyLeaveModal.submitButton", { defaultValue: "Submit Request" })}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ApplyLeaveModal;
