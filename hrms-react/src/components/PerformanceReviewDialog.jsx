import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { PerformanceReviewsAPI } from "../api";
import Button from "./Button";

// Milestone 1 only — self/manager rating + comments. Competencies, goals,
// peer feedback, appeals, and the AI insight button land in later
// milestones once frontend UI for them is built (the backend already
// supports them — see PERFORMANCE_REVIEWS_API_CONTRACT.md).
//
// canEditSelf/canEditManager come from the `permissions` object the server
// returns alongside the review (§2.3 of the contract) rather than being
// guessed client-side — deciding canEditManager requires the orphan-manager
// query, which needs per-department MANAGER-user data this component never
// receives.
function PerformanceReviewDialog({ cycleKey, employeeId, employeeName, meta, onClose, onSubmitted }) {
  const { t } = useTranslation();

  const [review, setReview] = useState(null);
  const [permissions, setPermissions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selfRating, setSelfRating] = useState("");
  const [selfComments, setSelfComments] = useState("");
  const [managerRating, setManagerRating] = useState("");
  const [managerComments, setManagerComments] = useState("");
  const [submittingSelf, setSubmittingSelf] = useState(false);
  const [submittingManager, setSubmittingManager] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    PerformanceReviewsAPI.getReview(cycleKey, employeeId)
      .then((res) => {
        if (cancelled) return;
        const rec = res.data ?? null;
        setReview(rec);
        setPermissions(res.permissions ?? null);
        setSelfRating(rec?.selfRating != null ? String(rec.selfRating) : "");
        setSelfComments(rec?.selfComments ?? "");
        setManagerRating(rec?.managerRating != null ? String(rec.managerRating) : "");
        setManagerComments(rec?.managerComments ?? "");
      })
      .catch((err) => { if (!cancelled) setError(err.message || t("performance.dialog.loadFailed")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [cycleKey, employeeId, t]);

  const canEditSelf = Boolean(permissions?.canEditSelf);
  const canEditManager = Boolean(permissions?.canEditManager);

  const hasSelfSubmitted = Boolean(review?.selfSubmittedDate);
  const hasManagerSubmitted = Boolean(review?.managerSubmittedDate);

  const ratingLabel = (n) => {
    if (n === "" || n === null || n === undefined) return "";
    const fallback = meta?.ratingLabels?.[n] ?? "";
    return `${n} — ${t(`performance.ratingLabels.${n}`, { defaultValue: fallback })}`;
  };

  const handleSubmitSelf = async (e) => {
    e.preventDefault();
    setSubmittingSelf(true);
    setError("");
    try {
      const res = await PerformanceReviewsAPI.submitSelf(cycleKey, employeeId, {
        selfRating: Number(selfRating) || null,
        selfComments,
      });
      setReview(res.data ?? review);
      onSubmitted?.();
    } catch (err) {
      setError(err.message || t("performance.dialog.submitFailed"));
    }
    setSubmittingSelf(false);
  };

  const handleSubmitManager = async (e) => {
    e.preventDefault();
    setSubmittingManager(true);
    setError("");
    try {
      const res = await PerformanceReviewsAPI.submitManager(cycleKey, employeeId, {
        managerRating: Number(managerRating) || null,
        managerComments,
      });
      setReview(res.data ?? review);
      onSubmitted?.();
    } catch (err) {
      setError(err.message || t("performance.dialog.submitFailed"));
    }
    setSubmittingManager(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "480px" }}>
        <div className="modal-header">
          <h2>{employeeName}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label={t("common2.close", { defaultValue: "Close" })}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && <p className="form-error">{error}</p>}

        {loading ? (
          <p style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)" }}>{t("performance.dialog.loading")}</p>
        ) : (
          <>
            <section>
              <h3 style={{ fontSize: "var(--fs-xs)", fontWeight: "var(--fw-bold)", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--txt-secondary)", marginTop: "var(--sp-4)", marginBottom: "var(--sp-2)" }}>
                {t("performance.dialog.selfSection")}
              </h3>
              {canEditSelf ? (
                <form onSubmit={handleSubmitSelf}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="perf-self-rating">{t("performance.dialog.ratingLabel")}</label>
                    <select id="perf-self-rating" value={selfRating} onChange={(e) => setSelfRating(e.target.value)}>
                      <option value="">{t("performance.dialog.selectRating")}</option>
                      {(meta?.ratingOptions ?? []).map((n) => (
                        <option key={n} value={n}>{ratingLabel(n)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="perf-self-comments">{t("performance.dialog.commentsLabel")}</label>
                    <textarea id="perf-self-comments" rows={3} value={selfComments}
                      onChange={(e) => setSelfComments(e.target.value)} style={{ resize: "vertical" }} />
                  </div>
                  <Button variant="primary" type="submit" size="sm" loading={submittingSelf}>
                    {t("performance.dialog.submitSelf")}
                  </Button>
                </form>
              ) : hasSelfSubmitted ? (
                <>
                  <p style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-bold)", margin: 0 }}>{ratingLabel(String(review.selfRating))}</p>
                  <p style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)", lineHeight: 1.5 }}>{review.selfComments}</p>
                </>
              ) : (
                <p style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)" }}>{t("performance.dialog.notSubmittedYet")}</p>
              )}
            </section>

            <section>
              <h3 style={{ fontSize: "var(--fs-xs)", fontWeight: "var(--fw-bold)", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--txt-secondary)", marginTop: "var(--sp-4)", marginBottom: "var(--sp-2)" }}>
                {t("performance.dialog.managerSection")}
              </h3>
              {canEditManager ? (
                <form onSubmit={handleSubmitManager}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="perf-manager-rating">{t("performance.dialog.ratingLabel")}</label>
                    <select id="perf-manager-rating" value={managerRating} onChange={(e) => setManagerRating(e.target.value)}>
                      <option value="">{t("performance.dialog.selectRating")}</option>
                      {(meta?.ratingOptions ?? []).map((n) => (
                        <option key={n} value={n}>{ratingLabel(n)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="perf-manager-comments">{t("performance.dialog.commentsLabel")}</label>
                    <textarea id="perf-manager-comments" rows={3} value={managerComments}
                      onChange={(e) => setManagerComments(e.target.value)} style={{ resize: "vertical" }} />
                  </div>
                  <Button variant="primary" type="submit" size="sm" loading={submittingManager}>
                    {t("performance.dialog.submitManager")}
                  </Button>
                </form>
              ) : hasManagerSubmitted ? (
                <>
                  <p style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-bold)", margin: 0 }}>{ratingLabel(String(review.managerRating))}</p>
                  <p style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)", lineHeight: 1.5 }}>{review.managerComments}</p>
                </>
              ) : (
                <p style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)" }}>{t("performance.dialog.notSubmittedYet")}</p>
              )}
            </section>
          </>
        )}

        <div className="modal-actions">
          <Button variant="secondary" type="button" onClick={onClose}>{t("performance.dialog.closeButton")}</Button>
        </div>
      </div>
    </div>
  );
}

export default PerformanceReviewDialog;
