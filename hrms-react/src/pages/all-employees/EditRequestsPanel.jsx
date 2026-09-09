import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ProfileEditRequestsAPI } from "../../api";
import { formatDate } from "../../utils/format";
import { translateApiError } from "../../utils/apiError";
import Badge from "../../components/Badge";
import Button from "../../components/Button";

/* ─────────────────────────────────────────
   Edit Requests tab — full review UI: status
   filter tabs, review notes, approve/reject
   with loading state, resolved history. Real
   data via ProfileEditRequestsAPI (review is
   MANAGER+ADMIN per profileEditRequestRouter.js).
   Ported from the old Settings > Profile Edit
   Requests panel — the mockup puts this queue
   under Employees, not Settings, but keeps the
   same full pending/approved/rejected/all
   review experience.
───────────────────────────────────────── */
const REQUEST_STATUS_VARIANT = { pending: "warning", approved: "success", rejected: "danger" };

function RequestFieldRow({ label, from, to }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "var(--sp-3)",
      padding: "8px 0", borderBottom: "1px solid var(--bdr-subtle)",
      fontSize: "var(--fs-sm)", flexWrap: "wrap",
    }}>
      <span style={{ color: "var(--txt-secondary)", minWidth: "80px", flexShrink: 0, textTransform: "capitalize" }}>{label}</span>
      <span style={{ color: "var(--txt-disabled)", textDecoration: "line-through" }}>{from || "—"}</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--txt-secondary)" strokeWidth="2" aria-hidden="true">
        <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <span style={{ color: "var(--clr-success-700)", fontWeight: "var(--fw-medium)" }}>{to || "—"}</span>
    </div>
  );
}

export function EditRequestsPanel({ onChanged }) {
  const { t } = useTranslation();
  const [requests, setRequests]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [filterStatus, setFilter]     = useState("pending");
  const [reviewingId, setReviewingId] = useState(null);
  const [note, setNote]               = useState("");
  const [actionLoading, setActionL]   = useState(null);
  const [toast, setToast]             = useState("");

  const statusLabel = (s) => t(`employees.allEmployees.editRequests.tabs.${s}`, { defaultValue: s });

  const loadRequests = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await ProfileEditRequestsAPI.list({ status: filterStatus });
      setRequests(res.items ?? []);
    } catch (err) {
      setError(translateApiError(err, t) || t("employees.allEmployees.editRequests.loadFailed", { defaultValue: "Failed to load requests." }));
    }
    setLoading(false);
  }, [filterStatus, t]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  const handleReview = async (requestId, decision) => {
    setActionL(decision);
    try {
      await ProfileEditRequestsAPI.review(requestId, decision, note);
      setToast(decision === "approved" ? t("employees.allEmployees.editRequests.toastApproved", { defaultValue: "Profile update approved and applied." }) : t("employees.allEmployees.editRequests.toastRejected", { defaultValue: "Request rejected." }));
      setReviewingId(null);
      setNote("");
      loadRequests();
      onChanged?.();
    } catch (err) {
      setToast(t("employees.allEmployees.editRequests.toastErrorPrefix", { defaultValue: "Error: {{message}}", message: translateApiError(err, t) }));
    }
    setActionL(null);
  };

  return (
    <div className="content-card">
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", marginBottom: "var(--sp-5)", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "var(--sp-1)", padding: "3px", background: "var(--bg-surface-alt)", borderRadius: "var(--radius-sm)" }}>
          {["pending", "approved", "rejected", "all"].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => { setFilter(s); setReviewingId(null); }}
              style={{
                padding: "5px 12px", borderRadius: "6px", border: "none", cursor: "pointer",
                background: filterStatus === s ? "var(--bg-surface)" : "transparent",
                color: filterStatus === s ? "var(--txt-primary)" : "var(--txt-secondary)",
                fontFamily: "var(--font-family)", fontSize: "var(--fs-xs)",
                fontWeight: filterStatus === s ? "var(--fw-medium)" : "var(--fw-regular)",
                boxShadow: filterStatus === s ? "var(--shadow-xs)" : "none",
                textTransform: "capitalize",
              }}
            >
              {statusLabel(s)}
            </button>
          ))}
        </div>
        <Button variant="secondary" size="sm" onClick={loadRequests}>{t("employees.allEmployees.editRequests.refresh", { defaultValue: "Refresh" })}</Button>
        <span style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", marginLeft: "auto" }}>
          {t("employees.allEmployees.editRequests.requestCount", { count: requests.length, defaultValue_one: "{{count}} request", defaultValue_other: "{{count}} requests" })}
        </span>
      </div>

      {toast && (
        <div style={{
          marginBottom: "var(--sp-4)", padding: "var(--sp-3) var(--sp-4)",
          background: toast.startsWith("Error") ? "var(--bg-danger-subtle)" : "var(--bg-success-subtle)",
          border: `1px solid ${toast.startsWith("Error") ? "var(--bdr-danger)" : "var(--bdr-success)"}`,
          borderRadius: "var(--radius-md)",
          color: toast.startsWith("Error") ? "var(--txt-danger)" : "var(--txt-success)",
          fontSize: "var(--fs-sm)",
        }}>
          {toast}
        </div>
      )}

      {error && (
        <div style={{ padding: "var(--sp-3) var(--sp-4)", background: "var(--bg-danger-subtle)", border: "1px solid var(--bdr-danger)", borderRadius: "var(--radius-md)", color: "var(--txt-danger)", fontSize: "var(--fs-sm)", marginBottom: "var(--sp-4)" }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: "var(--sp-5)", textAlign: "center", color: "var(--txt-secondary)", fontSize: "var(--fs-sm)" }}>
          {t("employees.allEmployees.editRequests.loading", { defaultValue: "Loading requests…" })}
        </div>
      ) : requests.length === 0 ? (
        <div className="empty-state">
          <h3 className="empty-state-title">
            {filterStatus === "all" ? t("employees.allEmployees.editRequests.noRequestsAll", { defaultValue: "No requests" }) : t("employees.allEmployees.editRequests.noRequestsFiltered", { defaultValue: "No {{status}} requests", status: statusLabel(filterStatus) })}
          </h3>
          <p className="empty-state-description">
            {t("employees.allEmployees.editRequests.emptyDescription", { defaultValue: "Profile edit requests submitted by employees will show up here for review." })}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
          {requests.map((req) => {
            const isOpen = reviewingId === req.id;
            return (
              <div key={req.id} style={{
                background: "var(--bg-surface)",
                border: `1px solid ${isOpen ? "var(--bdr-brand)" : "var(--bdr-subtle)"}`,
                borderRadius: "var(--radius-md)",
                overflow: "hidden",
                transition: "border-color 0.15s",
              }}>
                {/* Request header */}
                <div style={{
                  display: "flex", alignItems: "center", gap: "var(--sp-4)",
                  padding: "var(--sp-4) var(--sp-5)",
                  background: isOpen ? "var(--bg-primary-subtle)" : "var(--bg-surface-alt)",
                  flexWrap: "wrap",
                }}>
                  <div style={{
                    width: "36px", height: "36px", borderRadius: "50%",
                    background: "var(--bg-primary)", color: "var(--txt-on-brand)",
                    display: "grid", placeItems: "center",
                    fontSize: "var(--fs-sm)", fontWeight: "var(--fw-semibold)",
                    flexShrink: 0,
                  }}>
                    {(req.employeeName?.[0] ?? "?").toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-medium)", color: "var(--txt-primary)" }}>
                      {req.employeeName ?? t("employees.allEmployees.editRequests.unknownEmployee", { defaultValue: "Unknown employee" })}
                    </div>
                    <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", marginTop: "2px" }}>
                      {Object.keys(req.changes || {}).join(", ")} · {formatDate(req.createdAt)}
                    </div>
                  </div>
                  <Badge variant={REQUEST_STATUS_VARIANT[req.status] ?? "neutral"} pill dot>{statusLabel(req.status)}</Badge>
                  {req.status === "pending" && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => { setReviewingId(isOpen ? null : req.id); setNote(""); }}
                    >
                      {isOpen ? t("common.actions.close", { defaultValue: "Close" }) : t("employees.allEmployees.editRequests.review", { defaultValue: "Review" })}
                    </Button>
                  )}
                </div>

                {/* Expanded detail + action */}
                {isOpen && (
                  <div style={{ padding: "var(--sp-5)", borderTop: "1px solid var(--bdr-subtle)" }}>
                    <div style={{ marginBottom: "var(--sp-4)" }}>
                      <div style={{ fontSize: "var(--fs-xs)", fontWeight: "var(--fw-semibold)", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--txt-secondary)", marginBottom: "var(--sp-2)" }}>
                        {t("employees.allEmployees.editRequests.requestedChanges", { defaultValue: "Requested changes" })}
                      </div>
                      {Object.entries(req.changes || {}).map(([field, { from, to }]) => (
                        <RequestFieldRow key={field} label={field} from={from} to={to} />
                      ))}
                    </div>

                    <div className="form-group" style={{ marginBottom: "var(--sp-4)" }}>
                      <label className="form-label" htmlFor={`edit-req-note-${req.id}`}>
                        {t("employees.allEmployees.editRequests.reviewNoteLabel", { defaultValue: "Review note" })} <span style={{ fontWeight: "var(--fw-regular)", color: "var(--txt-secondary)" }}>{t("employees.allEmployees.editRequests.optional", { defaultValue: "(optional)" })}</span>
                      </label>
                      <textarea
                        id={`edit-req-note-${req.id}`}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={2}
                        placeholder={t("employees.allEmployees.editRequests.reviewNotePlaceholder", { defaultValue: "Add a note for the employee…" })}
                        style={{ resize: "vertical" }}
                      />
                    </div>

                    <div style={{ display: "flex", gap: "var(--sp-3)" }}>
                      <Button
                        variant="success"
                        disabled={actionLoading !== null}
                        onClick={() => handleReview(req.id, "approved")}
                      >
                        {actionLoading === "approved" ? t("employees.allEmployees.editRequests.approving", { defaultValue: "Approving…" }) : t("employees.allEmployees.editRequests.approveApply", { defaultValue: "Approve & apply" })}
                      </Button>
                      <Button
                        variant="danger"
                        disabled={actionLoading !== null}
                        onClick={() => handleReview(req.id, "rejected")}
                      >
                        {actionLoading === "rejected" ? t("employees.allEmployees.editRequests.rejecting", { defaultValue: "Rejecting…" }) : t("common.actions.reject", { defaultValue: "Reject" })}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Show review outcome for non-pending */}
                {req.status !== "pending" && req.reviewNote && (
                  <div style={{
                    padding: "var(--sp-3) var(--sp-5)",
                    borderTop: "1px solid var(--bdr-subtle)",
                    fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", fontStyle: "italic",
                  }}>
                    {t("employees.allEmployees.editRequests.hrNotePrefix", { defaultValue: "HR note:" })} {req.reviewNote}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
