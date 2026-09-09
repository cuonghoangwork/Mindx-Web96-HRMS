import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useLanguage } from "../../context/LanguageContext";
import { NoShowReviewsAPI } from "../../api";
import { formatDate } from "../../utils/format";
import { translateApiError } from "../../utils/apiError";
import Avatar from "../../components/Avatar";
import Badge from "../../components/Badge";
import Button from "../../components/Button";

/* ═══════════════════════════════════════════
   No-show queue — moved here from Settings.jsx (mockup puts this
   review queue as the Attendance page's second tab, not a Settings
   section). Same NoShowReviewsAPI the Settings panel used to call —
   real backend-generated flags (task 4.7), just relocated.
═══════════════════════════════════════════ */
export function NoShowQueueTab() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterStatus, setFilterStatus] = useState("pending");
  const [reviewingId, setReviewingId] = useState(null);
  const [note, setNote] = useState("");
  const [actionLoading, setActionLoading] = useState(null);
  const [toast, setToast] = useState("");

  const loadRequests = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await NoShowReviewsAPI.list({ status: filterStatus });
      setRequests(res.items ?? []);
    } catch (err) {
      setError(translateApiError(err, t) || t("settings.noShowReview.loadFailed"));
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
    setActionLoading(decision);
    try {
      await NoShowReviewsAPI.review(requestId, decision, note);
      setToast(decision === "approved" ? t("settings.noShowReview.confirmSuccess") : t("settings.noShowReview.dismissSuccess"));
      setReviewingId(null);
      setNote("");
      loadRequests();
    } catch (err) {
      setToast(`Error: ${translateApiError(err, t)}`);
    }
    setActionLoading(null);
  };

  return (
    <div className="content-card">
      <div style={{ marginBottom: "var(--sp-5)" }}>
        <h3 className="panel-title">
          {t("settings.sections.noShowReviewQueue.title")}
        </h3>
        <p className="hint-sm">
          {t("settings.sections.noShowReviewQueue.description")}
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", marginBottom: "var(--sp-5)", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "var(--sp-1)", padding: "3px", background: "var(--bg-surface-alt)", borderRadius: "var(--radius-sm)" }}>
          {["pending", "approved", "rejected", "all"].map((s) => (
            <button
              key={s} type="button"
              onClick={() => { setFilterStatus(s); setReviewingId(null); }}
              style={{
                padding: "5px 12px", borderRadius: "6px", border: "none", cursor: "pointer",
                background: filterStatus === s ? "var(--bg-surface)" : "transparent",
                color: filterStatus === s ? "var(--txt-primary)" : "var(--txt-secondary)",
                fontFamily: "var(--font-family)", fontSize: "var(--fs-xs)",
                fontWeight: filterStatus === s ? "var(--fw-medium)" : "var(--fw-regular)",
                boxShadow: filterStatus === s ? "var(--shadow-xs)" : "none",
              }}
            >{t(`settings.statusFilter.${s}`)}</button>
          ))}
        </div>
        <Button variant="secondary" size="sm" onClick={loadRequests}>{t("settings.refresh")}</Button>
        <span style={{ marginLeft: "auto", fontSize: "var(--fs-xs)", color: "var(--txt-secondary)" }}>
          {t("settings.noShowReview.flagCount", { count: requests.length })}
        </span>
      </div>

      {toast && (
        <div style={{
          marginBottom: "var(--sp-4)", padding: "var(--sp-3) var(--sp-4)",
          background: toast.startsWith("Error") ? "var(--bg-danger-subtle)" : "var(--bg-success-subtle)",
          border: `1px solid ${toast.startsWith("Error") ? "var(--bdr-danger)" : "var(--bdr-success)"}`,
          borderRadius: "var(--radius-md)", fontSize: "var(--fs-sm)",
          color: toast.startsWith("Error") ? "var(--txt-danger)" : "var(--txt-success)",
        }}>{toast}</div>
      )}
      {error && (
        <div style={{
          marginBottom: "var(--sp-4)", padding: "var(--sp-3) var(--sp-4)",
          background: "var(--bg-danger-subtle)", border: "1px solid var(--bdr-danger)",
          borderRadius: "var(--radius-md)", color: "var(--txt-danger)", fontSize: "var(--fs-sm)",
        }}>{error}</div>
      )}

      {loading ? (
        <div style={{ padding: "var(--sp-6)", textAlign: "center", color: "var(--txt-secondary)", fontSize: "var(--fs-sm)" }}>
          {t("settings.noShowReview.loadingFlags")}
        </div>
      ) : requests.length === 0 ? (
        <div style={{ padding: "var(--sp-8)", textAlign: "center", color: "var(--txt-secondary)", fontSize: "var(--fs-sm)" }}>
          {filterStatus !== "all"
            ? t("settings.noShowReview.noFlagsFiltered", { status: t(`settings.statusFilter.${filterStatus}`) })
            : t("settings.noShowReview.noFlags")}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
          {requests.map((req) => {
            const isOpen = reviewingId === req.id;
            return (
              <div key={req.id} style={{
                border: `1px solid ${isOpen ? "var(--bdr-brand)" : "var(--bdr-subtle)"}`,
                borderRadius: "var(--radius-md)", padding: "var(--sp-4)",
                background: "var(--bg-surface-alt)", transition: "border-color 0.15s",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", flexWrap: "wrap" }}>
                  <Avatar name={req.employeeName ?? "?"} size="sm" />
                  <div style={{ flex: 1, minWidth: "180px" }}>
                    <div style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-medium)", color: "var(--txt-primary)" }}>
                      {req.employeeName} <span style={{ color: "var(--txt-secondary)", fontWeight: "var(--fw-regular)" }}>({req.employeeCode})</span>
                    </div>
                    <div className="hint-xs">
                      {t("settings.noShowReview.recordLine", { count: req.noShowCount, date: formatDate(req.flaggedAt ?? req.createdAt, language) })}
                    </div>
                  </div>
                  <Badge variant={req.status === "pending" ? "warning" : req.status === "approved" ? "success" : "danger"} size="sm">
                    {t(`settings.statusFilter.${req.status}`) || req.status}
                  </Badge>
                  {req.status === "pending" && (
                    <Button
                      variant="secondary" size="sm"
                      onClick={() => { setReviewingId(isOpen ? null : req.id); setNote(""); }}
                    >{isOpen ? t("settings.close") : t("settings.review")}</Button>
                  )}
                </div>

                {isOpen && (
                  <div style={{ marginTop: "var(--sp-4)", paddingTop: "var(--sp-4)", borderTop: "1px solid var(--bdr-subtle)" }}>
                    <div style={{
                      marginBottom: "var(--sp-4)", padding: "var(--sp-3) var(--sp-4)",
                      background: "var(--bg-warning-subtle)", border: "1px solid var(--bdr-warning)",
                      borderRadius: "var(--radius-md)", color: "var(--txt-warning)", fontSize: "var(--fs-sm)",
                    }}>
                      {t("settings.noShowReview.autoStatusWarning")}
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor={`noshow-note-${req.id}`}>
                        {t("settings.reviewNoteLabel")} <span style={{ color: "var(--txt-secondary)", fontWeight: "var(--fw-regular)" }}>{t("settings.optional")}</span>
                      </label>
                      <textarea
                        id={`noshow-note-${req.id}`} rows={2} value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder={t("settings.noShowReview.notePlaceholder")}
                        style={{ resize: "vertical" }}
                      />
                    </div>
                    <div style={{ display: "flex", gap: "var(--sp-3)", flexWrap: "wrap" }}>
                      <Button variant="success" disabled={actionLoading !== null} onClick={() => handleReview(req.id, "approved")}>
                        {actionLoading === "approved" ? t("settings.savingEllipsis") : t("settings.noShowReview.confirmPattern")}
                      </Button>
                      <Button variant="danger" disabled={actionLoading !== null} onClick={() => handleReview(req.id, "rejected")}>
                        {actionLoading === "rejected" ? t("settings.savingEllipsis") : t("settings.noShowReview.dismiss")}
                      </Button>
                    </div>
                  </div>
                )}

                {req.status !== "pending" && req.reviewNote && (
                  <div style={{
                    marginTop: "var(--sp-3)", paddingTop: "var(--sp-3)",
                    borderTop: "1px solid var(--bdr-subtle)", fontStyle: "italic",
                    fontSize: "var(--fs-sm)", color: "var(--txt-secondary)",
                  }}>{t("settings.adminNote", { note: req.reviewNote })}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
