import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { PerformanceReviewsAPI } from "../api";
import { useLanguage } from "../context/LanguageContext";
import { formatDate } from "../utils/format";
import Badge from "./Badge";
import Button from "./Button";

// Milestones 1-5 — self/manager rating, competencies, goals, peer feedback,
// appeals, AI insight. The AI call itself (prompt + LLM) happens entirely
// server-side (see PERFORMANCE_REVIEWS_API_CONTRACT.md) — this component
// only triggers it and renders the returned text.
//
// All the *can*/canEdit* flags come from the `permissions` object the server
// returns alongside the review (§2.3 of the contract) rather than being
// guessed client-side — e.g. canEditManager requires the orphan-manager
// query, and canFileAppeal requires the 14-day-window math, both of which
// need data this component never receives.
function PerformanceReviewDialog({ cycleKey, employeeId, employeeName, meta, onClose, onSubmitted }) {
  const { t } = useTranslation();
  const { language } = useLanguage();

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

  const [savingCompetency, setSavingCompetency] = useState(false);
  const [savingGoalId, setSavingGoalId] = useState(null);
  const [goalTextDraft, setGoalTextDraft] = useState("");
  const [addingGoal, setAddingGoal] = useState(false);
  const [peerNameDraft, setPeerNameDraft] = useState("");
  const [peerRelationDraft, setPeerRelationDraft] = useState("");
  const [peerCommentsDraft, setPeerCommentsDraft] = useState("");
  const [addingPeerFeedback, setAddingPeerFeedback] = useState(false);
  const [showAppealForm, setShowAppealForm] = useState(false);
  const [appealReasonDraft, setAppealReasonDraft] = useState("");
  const [appealDetailDraft, setAppealDetailDraft] = useState("");
  const [filingAppeal, setFilingAppeal] = useState(false);
  const [appealResolveRatingDraft, setAppealResolveRatingDraft] = useState("");
  const [appealResolverNoteDraft, setAppealResolverNoteDraft] = useState("");
  const [resolvingAppeal, setResolvingAppeal] = useState(false);

  const [aiInsightLoading, setAiInsightLoading] = useState(false);
  const [aiInsightError, setAiInsightError] = useState(false);
  const [aiInsightText, setAiInsightText] = useState("");

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
  const canEditCompetencySelf = Boolean(permissions?.canEditCompetencySelf);
  const canEditCompetencyManager = Boolean(permissions?.canEditCompetencyManager);
  const canAddGoals = Boolean(permissions?.canAddGoals);
  const canAddPeerFeedback = Boolean(permissions?.canAddPeerFeedback);
  const canFileAppeal = Boolean(permissions?.canFileAppeal);
  const canResolveAppeal = Boolean(permissions?.canResolveAppeal);

  const hasSelfSubmitted = Boolean(review?.selfSubmittedDate);
  const hasManagerSubmitted = Boolean(review?.managerSubmittedDate);

  const ratingLabel = (n) => {
    if (n === "" || n === null || n === undefined) return "";
    const fallback = meta?.ratingLabels?.[n] ?? "";
    return `${n} — ${t(`performance.ratingLabels.${n}`, { defaultValue: fallback })}`;
  };

  const competencyLabel = (key) =>
    t(`performance.competencies.${key}`, { defaultValue: meta?.competencyLabels?.[key] ?? key });

  const goalStatusFor = (progress) => {
    if (progress >= 100) return { key: "done", variant: "success" };
    if (progress > 0) return { key: "inProgress", variant: "warning" };
    return { key: "notStarted", variant: "neutral" };
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

  const handleSetCompetency = async (key, value) => {
    setSavingCompetency(true);
    setError("");
    try {
      const res = await PerformanceReviewsAPI.setCompetency(cycleKey, employeeId, { key, value });
      setReview(res.data ?? review);
    } catch (err) {
      setError(err.message || t("performance.dialog.submitFailed"));
    }
    setSavingCompetency(false);
  };

  const handleGoalProgressChange = async (goalId, progress) => {
    setSavingGoalId(goalId);
    setError("");
    try {
      const res = await PerformanceReviewsAPI.updateGoal(cycleKey, employeeId, goalId, { progress });
      setReview(res.data ?? review);
    } catch (err) {
      setError(err.message || t("performance.dialog.submitFailed"));
    }
    setSavingGoalId(null);
  };

  const handleAddGoal = async (e) => {
    e.preventDefault();
    setAddingGoal(true);
    setError("");
    try {
      const res = await PerformanceReviewsAPI.addGoal(cycleKey, employeeId, { text: goalTextDraft, progress: 0 });
      setReview(res.data ?? review);
      setGoalTextDraft("");
    } catch (err) {
      setError(err.message || t("performance.dialog.submitFailed"));
    }
    setAddingGoal(false);
  };

  const handleAddPeerFeedback = async (e) => {
    e.preventDefault();
    setAddingPeerFeedback(true);
    setError("");
    try {
      const res = await PerformanceReviewsAPI.addPeerFeedback(cycleKey, employeeId, {
        name: peerNameDraft,
        relation: peerRelationDraft,
        comments: peerCommentsDraft,
      });
      setReview(res.data ?? review);
      setPeerNameDraft("");
      setPeerRelationDraft("");
      setPeerCommentsDraft("");
    } catch (err) {
      setError(err.message || t("performance.dialog.submitFailed"));
    }
    setAddingPeerFeedback(false);
  };

  const handleFileAppeal = async (e) => {
    e.preventDefault();
    setFilingAppeal(true);
    setError("");
    try {
      const reasonCategory = appealReasonDraft || meta?.appealReasonCategories?.[0] || "other";
      const res = await PerformanceReviewsAPI.fileAppeal(cycleKey, employeeId, {
        reasonCategory,
        detail: appealDetailDraft,
      });
      setReview(res.data ?? review);
      setShowAppealForm(false);
      setAppealReasonDraft("");
      setAppealDetailDraft("");
      onSubmitted?.();
    } catch (err) {
      setError(err.message || t("performance.dialog.submitFailed"));
    }
    setFilingAppeal(false);
  };

  const handleResolveAppeal = async (resolution) => {
    setResolvingAppeal(true);
    setError("");
    try {
      const res = await PerformanceReviewsAPI.resolveAppeal(cycleKey, employeeId, {
        resolution,
        resolvedRating: resolution === "Adjusted" ? Number(appealResolveRatingDraft) : undefined,
        resolverNote: appealResolverNoteDraft,
      });
      setReview(res.data ?? review);
      setAppealResolveRatingDraft("");
      setAppealResolverNoteDraft("");
      onSubmitted?.();
    } catch (err) {
      setError(err.message || t("performance.dialog.submitFailed"));
    }
    setResolvingAppeal(false);
  };

  const handleAskAI = async () => {
    setAiInsightLoading(true);
    setAiInsightError(false);
    setAiInsightText("");
    try {
      const res = await PerformanceReviewsAPI.askAI(cycleKey, employeeId);
      setAiInsightText(res.text ?? "");
    } catch {
      // Never surface the raw server error here — it may leak config details
      // (e.g. "GEMINI_API_KEY is unset"); the UI only ever shows a static,
      // translated "unavailable" message, matching the original demo.
      setAiInsightError(true);
    }
    setAiInsightLoading(false);
  };

  const sectionTitleStyle = { fontSize: "var(--fs-xs)", fontWeight: "var(--fw-bold)", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--txt-secondary)", marginTop: "var(--sp-4)", marginBottom: "var(--sp-2)" };
  const readonlyCommentsStyle = { fontSize: "var(--fs-sm)", color: "var(--txt-secondary)", lineHeight: 1.5 };
  const dotStyle = (filled, editable) => ({
    width: "14px", height: "14px", borderRadius: "50%", boxSizing: "border-box",
    cursor: editable ? "pointer" : "default",
    background: filled ? "var(--bg-primary)" : "transparent",
    border: "2px solid " + (filled ? "var(--bg-primary)" : "var(--bdr-default)"),
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "480px" }}>
        <div className="modal-header">
          <h2>{employeeName}</h2>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
            {!loading && review && (
              <Button variant="secondary" size="sm" type="button" onClick={handleAskAI} loading={aiInsightLoading}>
                {t("performance.dialog.askAi")}
              </Button>
            )}
            <button type="button" className="modal-close" onClick={onClose} aria-label={t("common2.close", { defaultValue: "Close" })}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {error && <p className="form-error">{error}</p>}

        {(aiInsightLoading || aiInsightError || aiInsightText) && (
          <div style={{ marginTop: "var(--sp-3)", padding: "var(--sp-3)", background: "var(--bg-primary-subtle)", border: "1px solid var(--bdr-brand)" }}>
            <div style={{ fontSize: "var(--fs-xs)", fontWeight: "var(--fw-bold)", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--txt-primary-brand)", marginBottom: "var(--sp-2)" }}>
              {t("performance.dialog.aiInsightTitle")}
            </div>
            <div style={{ fontSize: "var(--fs-sm)", color: "var(--txt-primary)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
              {aiInsightLoading ? t("performance.dialog.aiThinking") : aiInsightError ? t("performance.dialog.aiUnavailable") : aiInsightText}
            </div>
          </div>
        )}

        {loading ? (
          <p style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)" }}>{t("performance.dialog.loading")}</p>
        ) : (
          <>
            <section>
              <h3 style={sectionTitleStyle}>
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
                  <p style={readonlyCommentsStyle}>{review.selfComments}</p>
                </>
              ) : (
                <p style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)" }}>{t("performance.dialog.notSubmittedYet")}</p>
              )}
            </section>

            <section>
              <h3 style={sectionTitleStyle}>{t("performance.dialog.competenciesTitle")}</h3>
              {(meta?.competencies ?? []).map((key) => {
                const value = review?.competencies?.[key] ?? { self: null, manager: null };
                return (
                  <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid var(--bdr-subtle)" }}>
                    <div style={{ fontSize: "var(--fs-sm)", fontWeight: "var(--fw-medium)" }}>{competencyLabel(key)}</div>
                    <div style={{ display: "flex", gap: "var(--sp-5)" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--sp-1)" }}>
                        <div style={{ display: "flex", gap: "4px" }}>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <div
                              key={n}
                              role={canEditCompetencySelf ? "button" : undefined}
                              aria-label={canEditCompetencySelf ? `${competencyLabel(key)} — ${t("performance.dialog.selfColumn")} ${n}` : undefined}
                              style={dotStyle(n <= (value.self ?? 0), canEditCompetencySelf)}
                              onClick={canEditCompetencySelf && !savingCompetency ? () => handleSetCompetency(key, n) : undefined}
                            />
                          ))}
                        </div>
                        <div style={{ fontSize: "10px", fontWeight: "var(--fw-bold)", color: "var(--txt-secondary)", textTransform: "uppercase" }}>{t("performance.dialog.selfColumn")}</div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--sp-1)" }}>
                        <div style={{ display: "flex", gap: "4px" }}>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <div
                              key={n}
                              role={canEditCompetencyManager ? "button" : undefined}
                              aria-label={canEditCompetencyManager ? `${competencyLabel(key)} — ${t("performance.dialog.managerColumn")} ${n}` : undefined}
                              style={dotStyle(n <= (value.manager ?? 0), canEditCompetencyManager)}
                              onClick={canEditCompetencyManager && !savingCompetency ? () => handleSetCompetency(key, n) : undefined}
                            />
                          ))}
                        </div>
                        <div style={{ fontSize: "10px", fontWeight: "var(--fw-bold)", color: "var(--txt-secondary)", textTransform: "uppercase" }}>{t("performance.dialog.managerColumn")}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </section>

            <section>
              <h3 style={sectionTitleStyle}>{t("performance.dialog.goalsTitle")}</h3>
              {(review?.goals ?? []).length === 0 && (
                <p style={readonlyCommentsStyle}>{t("performance.dialog.noGoalsYet")}</p>
              )}
              {(review?.goals ?? []).map((goal) => {
                const status = goalStatusFor(goal.progress);
                return (
                  <div key={goal.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--bdr-subtle)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "var(--sp-3)", marginBottom: "6px" }}>
                      <div style={{ fontSize: "var(--fs-sm)", fontWeight: "var(--fw-medium)" }}>{goal.text}</div>
                      <Badge variant={status.variant} size="sm">{t(`performance.dialog.goalStatus.${status.key}`)}</Badge>
                    </div>
                    <div style={{ height: "6px", background: "var(--bg-surface-sub)" }}>
                      <div style={{ height: "100%", width: `${goal.progress}%`, background: "var(--bg-primary)" }} />
                    </div>
                    {canAddGoals && (
                      <input
                        type="range" min="0" max="100" step={meta?.goalProgressStep ?? 10}
                        value={goal.progress}
                        disabled={savingGoalId === goal.id}
                        onChange={(e) => handleGoalProgressChange(goal.id, Number(e.target.value))}
                        style={{ width: "100%", marginTop: "6px" }}
                      />
                    )}
                  </div>
                );
              })}
              {canAddGoals && (
                <form onSubmit={handleAddGoal} style={{ display: "flex", gap: "var(--sp-2)", marginTop: "var(--sp-3)", alignItems: "center" }}>
                  <input
                    type="text" value={goalTextDraft} onChange={(e) => setGoalTextDraft(e.target.value)}
                    placeholder={t("performance.dialog.goalPlaceholder")}
                    style={{ flex: 1, fontFamily: "var(--font-family)", fontSize: "var(--fs-sm)", padding: "8px 10px", border: "1px solid var(--bdr-default)", background: "var(--bg-surface)", color: "var(--txt-primary)" }}
                  />
                  <Button variant="secondary" type="submit" size="sm" loading={addingGoal} disabled={!goalTextDraft.trim()}>
                    {t("performance.dialog.addGoal")}
                  </Button>
                </form>
              )}
            </section>

            <section>
              <h3 style={sectionTitleStyle}>
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
                  <p style={readonlyCommentsStyle}>{review.managerComments}</p>
                </>
              ) : (
                <p style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)" }}>{t("performance.dialog.notSubmittedYet")}</p>
              )}
            </section>

            {(canFileAppeal || review?.appeal) && (
              <section>
                <h3 style={sectionTitleStyle}>{t("performance.dialog.appealTitle")}</h3>

                {review?.appeal && (
                  <div style={{ padding: "var(--sp-3)", background: "var(--bg-surface-alt)", border: "1px solid var(--bdr-subtle)", marginBottom: "var(--sp-2)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--sp-2)", marginBottom: "6px" }}>
                      <div style={{ fontSize: "var(--fs-sm)", fontWeight: "var(--fw-bold)" }}>
                        {t(`performance.dialog.appealReasons.${review.appeal.reasonCategory}`, { defaultValue: review.appeal.reasonCategory })}
                      </div>
                      <Badge variant={review.appeal.status === "Resolved" ? "success" : "warning"} size="sm">
                        {t(`performance.dialog.appealStatus.${review.appeal.status}`, { defaultValue: review.appeal.status })}
                      </Badge>
                    </div>
                    <p style={readonlyCommentsStyle}>{review.appeal.detail}</p>
                    {review.appeal.status === "Resolved" && (
                      <p style={{ ...readonlyCommentsStyle, marginTop: "6px" }}>
                        {review.appeal.resolution === "Adjusted"
                          ? t("performance.dialog.appealResolutionAdjusted", { rating: review.appeal.resolvedRating })
                          : t("performance.dialog.appealResolutionUpheld")}
                      </p>
                    )}
                    {review.appeal.resolverNote && (
                      <p style={{ ...readonlyCommentsStyle, marginTop: "6px" }}>{review.appeal.resolverNote}</p>
                    )}
                  </div>
                )}

                {canFileAppeal && !review?.appeal && (
                  showAppealForm ? (
                    <form onSubmit={handleFileAppeal}>
                      <div className="form-group">
                        <label className="form-label" htmlFor="perf-appeal-reason">{t("performance.dialog.appealReasonLabel")}</label>
                        <select
                          id="perf-appeal-reason"
                          value={appealReasonDraft || meta?.appealReasonCategories?.[0] || ""}
                          onChange={(e) => setAppealReasonDraft(e.target.value)}
                        >
                          {(meta?.appealReasonCategories ?? []).map((cat) => (
                            <option key={cat} value={cat}>{t(`performance.dialog.appealReasons.${cat}`, { defaultValue: cat })}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label" htmlFor="perf-appeal-detail">{t("performance.dialog.appealDetailPlaceholder")}</label>
                        <textarea id="perf-appeal-detail" rows={3} value={appealDetailDraft}
                          onChange={(e) => setAppealDetailDraft(e.target.value)} style={{ resize: "vertical" }} />
                      </div>
                      <div style={{ display: "flex", gap: "var(--sp-2)" }}>
                        <Button variant="secondary" type="button" size="sm" onClick={() => setShowAppealForm(false)}>
                          {t("performance.dialog.appealCancel")}
                        </Button>
                        <Button variant="primary" type="submit" size="sm" loading={filingAppeal} disabled={!appealDetailDraft.trim()}>
                          {t("performance.dialog.appealSubmit")}
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <>
                      {review?.appealDeadline && (
                        <p style={{ ...readonlyCommentsStyle, marginBottom: "var(--sp-2)" }}>
                          {t("performance.dialog.appealDeadlineHint", { date: formatDate(review.appealDeadline, language) })}
                        </p>
                      )}
                      <Button variant="secondary" type="button" size="sm" onClick={() => setShowAppealForm(true)}>
                        {t("performance.dialog.appealBtn")}
                      </Button>
                    </>
                  )
                )}

                {canResolveAppeal && (
                  <div style={{ marginTop: "var(--sp-3)" }}>
                    <div className="form-group">
                      <label className="form-label" htmlFor="perf-appeal-resolve-rating">{t("performance.dialog.appealNewRatingLabel")}</label>
                      <select id="perf-appeal-resolve-rating" value={appealResolveRatingDraft} onChange={(e) => setAppealResolveRatingDraft(e.target.value)}>
                        <option value="">{t("performance.dialog.selectRating")}</option>
                        {(meta?.ratingOptions ?? []).map((n) => (
                          <option key={n} value={n}>{ratingLabel(n)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="perf-appeal-resolver-note">{t("performance.dialog.appealResolverNotePlaceholder")}</label>
                      <textarea id="perf-appeal-resolver-note" rows={2} value={appealResolverNoteDraft}
                        onChange={(e) => setAppealResolverNoteDraft(e.target.value)} style={{ resize: "vertical" }} />
                    </div>
                    <div style={{ display: "flex", gap: "var(--sp-2)" }}>
                      <Button variant="secondary" type="button" size="sm" loading={resolvingAppeal} onClick={() => handleResolveAppeal("Upheld")}>
                        {t("performance.dialog.appealUphold")}
                      </Button>
                      <Button variant="primary" type="button" size="sm" loading={resolvingAppeal} disabled={!appealResolveRatingDraft} onClick={() => handleResolveAppeal("Adjusted")}>
                        {t("performance.dialog.appealAdjustAndResolve")}
                      </Button>
                    </div>
                  </div>
                )}
              </section>
            )}

            <section>
              <h3 style={sectionTitleStyle}>{t("performance.dialog.peerFeedbackTitle")}</h3>
              {(review?.peerFeedback ?? []).length === 0 && (
                <p style={readonlyCommentsStyle}>{t("performance.dialog.noPeerFeedbackYet")}</p>
              )}
              {(review?.peerFeedback ?? []).map((p) => (
                <div key={p.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--bdr-subtle)" }}>
                  <div style={{ display: "flex", gap: "var(--sp-2)", alignItems: "baseline" }}>
                    <span style={{ fontSize: "var(--fs-sm)", fontWeight: "var(--fw-bold)" }}>{p.name}</span>
                    <span style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)" }}>{p.relation}</span>
                  </div>
                  <p style={readonlyCommentsStyle}>{p.comments}</p>
                </div>
              ))}
              {canAddPeerFeedback && (
                <form onSubmit={handleAddPeerFeedback} style={{ marginTop: "var(--sp-3)" }}>
                  <div style={{ display: "flex", gap: "var(--sp-2)" }}>
                    <input
                      type="text" value={peerNameDraft} onChange={(e) => setPeerNameDraft(e.target.value)}
                      placeholder={t("performance.dialog.peerNamePlaceholder")}
                      style={{ flex: 1, fontFamily: "var(--font-family)", fontSize: "var(--fs-sm)", padding: "8px 10px", border: "1px solid var(--bdr-default)", background: "var(--bg-surface)", color: "var(--txt-primary)" }}
                    />
                    <input
                      type="text" value={peerRelationDraft} onChange={(e) => setPeerRelationDraft(e.target.value)}
                      placeholder={t("performance.dialog.peerRelationPlaceholder")}
                      style={{ flex: 1, fontFamily: "var(--font-family)", fontSize: "var(--fs-sm)", padding: "8px 10px", border: "1px solid var(--bdr-default)", background: "var(--bg-surface)", color: "var(--txt-primary)" }}
                    />
                  </div>
                  <textarea
                    rows={2} value={peerCommentsDraft} onChange={(e) => setPeerCommentsDraft(e.target.value)}
                    placeholder={t("performance.dialog.peerCommentsPlaceholder")}
                    style={{ width: "100%", marginTop: "var(--sp-2)", fontFamily: "var(--font-family)", fontSize: "var(--fs-sm)", padding: "8px 10px", boxSizing: "border-box", border: "1px solid var(--bdr-default)", background: "var(--bg-surface)", color: "var(--txt-primary)", resize: "vertical" }}
                  />
                  <Button variant="secondary" type="submit" size="sm" loading={addingPeerFeedback}
                    disabled={!peerNameDraft.trim() || !peerCommentsDraft.trim()} style={{ marginTop: "var(--sp-2)" }}>
                    {t("performance.dialog.addFeedback")}
                  </Button>
                </form>
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
