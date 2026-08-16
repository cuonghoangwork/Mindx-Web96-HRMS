import { useEffect, useState } from "react";
import Button from "./Button";
import { LeaveRequestsAPI } from "../api";
import { LEAVE_TYPES, LEAVE_TYPE_LABELS } from "../utils/leaveTypes";

// Extracted out of Dashboard.jsx so ViewEmployee.jsx's own-profile view can
// offer the same "Apply for leave" action (LeaveRequestsAPI.create already
// resolves the request to the calling user's own linked employee record).
function ApplyLeaveModal({ onClose, onSubmit }) {
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
      setError("Start and end dates are required.");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({ type, startDate, endDate, reason });
      onClose();
    } catch (err) {
      setError(err.message || "Failed to submit leave request.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "440px" }}>
        <div className="modal-header">
          <h2>Apply for Leave</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && <p className="form-error">{error}</p>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="leave-type">Leave Type *</label>
            <select
              id="leave-type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              required
            >
              {LEAVE_TYPES.map((value) => (
                <option key={value} value={value}>{LEAVE_TYPE_LABELS[value]}</option>
              ))}
            </select>
            {selectedBalance && (
              <p style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", marginTop: "4px" }}>
                {selectedBalance.remaining === null
                  ? "Unlimited"
                  : `${selectedBalance.remaining} of ${selectedBalance.accrued} day${selectedBalance.accrued === 1 ? "" : "s"} remaining this year`}
              </p>
            )}
          </div>
          <div className="form-group">
            <label htmlFor="leave-start">Start Date *</label>
            <input
              type="date"
              id="leave-start"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="leave-end">End Date *</label>
            <input
              type="date"
              id="leave-end"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="leave-reason">Reason</label>
            <textarea
              id="leave-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Optional"
              style={{ resize: "vertical" }}
            />
          </div>
          <div className="modal-actions">
            <Button variant="secondary" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={submitting}>
              Submit Request
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ApplyLeaveModal;
