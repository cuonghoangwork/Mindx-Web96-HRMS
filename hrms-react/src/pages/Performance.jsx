import { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { PerformanceReviewsAPI } from "../api";
import { useAuth } from "../context/AuthContext";
import Avatar from "../components/Avatar";
import Badge from "../components/Badge";
import CreateCycleDialog from "../components/CreateCycleDialog";
import PerformanceReviewDialog from "../components/PerformanceReviewDialog";

// Milestones 1-4 (see PERFORMANCE_REVIEWS_TASK_SPLIT.md) — cycles, roster,
// self/manager review submission, competencies, goals, peer feedback,
// appeals, cycle management, analytics. The AI insight button lands in a
// later milestone.
//
// Status comes from the roster row's own `status` field (one of
// meta.reviewStatuses) rather than being re-derived from selfRating/
// managerRating client-side — the two ratings can be submitted in either
// order, so "only one rating present" doesn't tell you which one.
//
// One map (not two parallel ones) so a status can't drift out of sync with
// itself; an unrecognized status (a future addition to meta.reviewStatuses
// this map hasn't been updated for) falls back to a neutral badge with the
// raw status string instead of a broken i18n key.
const STATUS_DISPLAY = {
  "Not started": { key: "notStarted", variant: "danger" },
  "Self submitted": { key: "selfSubmitted", variant: "warning" },
  "Manager submitted": { key: "managerSubmitted", variant: "warning" },
  Completed: { key: "completed", variant: "success" },
};

// Reuses Dashboard.jsx's .stat-card-trend/.up/.down CSS classes (global in
// index.css, otherwise unused on this page) rather than inventing new ones.
// `invert` flips which sign counts as "good" — a lower appeal rate is the
// improvement, unlike every rating/completion delta where higher is better.
function formatDelta(value, { invert = false, percent = false } = {}) {
  if (value === null || value === undefined) return { text: "—", cls: "" };
  if (value === 0) return { text: percent ? "0%" : "0", cls: "" };
  const shown = percent ? Math.round(value * 100) : value;
  const sign = value > 0 ? "+" : "";
  const arrow = value > 0 ? "↑" : "↓";
  const good = invert ? value < 0 : value > 0;
  return { text: `${arrow} ${sign}${shown}${percent ? "%" : ""}`, cls: good ? "up" : "down" };
}

// isAdmin here only gates button *visibility* — the real enforcement is the
// backend's admin middleware on POST/PATCH /performance/cycles. Unlike
// PerformanceReviewDialog's canEdit* flags (which need server-side lookups
// like the orphan-manager check), "is this user ADMIN" needs no extra data,
// so there's no guessing risk in reading it from useAuth() here.

function Performance() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();

  const [meta, setMeta] = useState(null);
  const [cycles, setCycles] = useState([]);
  const [selectedCycleKey, setSelectedCycleKey] = useState(null);
  const [roster, setRoster] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [openReview, setOpenReview] = useState(null); // { employeeId, employeeName } | null
  const [showCreateCycle, setShowCreateCycle] = useState(false);
  const [togglingCycle, setTogglingCycle] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([PerformanceReviewsAPI.meta(), PerformanceReviewsAPI.cycles()])
      .then(([metaRes, cyclesRes]) => {
        if (cancelled) return;
        const cycleList = cyclesRes.items ?? cyclesRes.data ?? [];
        setMeta(metaRes.data ?? null);
        setCycles(cycleList);
        const openCycle = cycleList.find((c) => c.status === "Open");
        setSelectedCycleKey((openCycle ?? cycleList[cycleList.length - 1])?.key ?? null);
      })
      .catch((err) => { if (!cancelled) setError(err.message || t("performance.loadFailed")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [t]);

  const loadRoster = useCallback(() => {
    if (!selectedCycleKey) return;
    setError("");
    PerformanceReviewsAPI.roster(selectedCycleKey)
      .then((res) => setRoster(res.items ?? res.data ?? []))
      .catch((err) => setError(err.message || t("performance.loadFailed")));
  }, [selectedCycleKey, t]);

  useEffect(() => { loadRoster(); }, [loadRoster]);

  const loadAnalytics = useCallback(() => {
    if (!selectedCycleKey) return;
    PerformanceReviewsAPI.analytics(selectedCycleKey)
      .then((res) => setAnalytics(res.data ?? null))
      .catch(() => setAnalytics(null));
  }, [selectedCycleKey]);

  useEffect(() => { loadAnalytics(); }, [loadAnalytics]);

  // ADMIN/HR only server-side — a 403 for anyone else just means no
  // comparison card renders, same silent-to-null handling as loadAnalytics.
  // Keeps the whole response (not just `.data`, unlike loadAnalytics) since
  // the previous cycle's label lives at the top level while its stats and
  // the computed deltas live under `data`.
  const loadComparison = useCallback(() => {
    if (!selectedCycleKey) return;
    PerformanceReviewsAPI.comparison(selectedCycleKey)
      .then((res) => setComparison(res))
      .catch(() => setComparison(null));
  }, [selectedCycleKey]);

  useEffect(() => { loadComparison(); }, [loadComparison]);

  const selectedCycle = cycles.find((c) => c.key === selectedCycleKey) ?? null;

  const handleCycleCreated = (cycle) => {
    if (!cycle) return;
    setCycles((prev) => [cycle, ...prev]);
    setSelectedCycleKey(cycle.key);
  };

  const handleToggleCycleStatus = () => {
    if (!selectedCycle) return;
    const nextStatus = selectedCycle.status === "Open" ? "Closed" : "Open";
    setTogglingCycle(true);
    setError("");
    PerformanceReviewsAPI.setCycleStatus(selectedCycle.key, nextStatus)
      .then((res) => {
        const updated = res.data;
        if (updated) setCycles((prev) => prev.map((c) => (c.key === updated.key ? updated : c)));
        loadAnalytics();
        loadComparison();
      })
      .catch((err) => setError(err.message || t("performance.loadFailed")))
      .finally(() => setTogglingCycle(false));
  };

  const statCells = useMemo(() => {
    const total = roster.length;
    const completed = roster.filter((r) => r.status === "Completed").length;
    const notStarted = roster.filter((r) => r.status === "Not started").length;
    const inProgress = total - completed - notStarted;
    const ratings = roster.map((r) => r.managerRating).filter((v) => v != null);
    const avgManagerRating = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : "—";
    return [
      { label: t("performance.stats.completed"), value: `${completed}/${total}`, trend: t("performance.stats.completedHint") },
      { label: t("performance.stats.inProgress"), value: inProgress, trend: t("performance.stats.inProgressHint") },
      { label: t("performance.stats.notStarted"), value: notStarted, trend: t("performance.stats.notStartedHint") },
      { label: t("performance.stats.avgManagerRating"), value: avgManagerRating, trend: t("performance.stats.avgManagerRatingHint") },
    ];
  }, [roster, t]);

  const filteredRoster = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter((r) => r.name.toLowerCase().includes(q) || (r.department ?? "").toLowerCase().includes(q));
  }, [roster, search]);

  const ratingOptions = meta?.ratingOptions ?? [1, 2, 3, 4, 5];
  const ratingLabel = (n) => t(`performance.ratingLabels.${n}`, { defaultValue: meta?.ratingLabels?.[n] ?? String(n) });

  const ratingDistBars = useMemo(() => {
    const build = (dist) => {
      const counts = ratingOptions.map((n) => dist?.[n] ?? 0);
      const max = Math.max(1, ...counts);
      return ratingOptions.map((n, i) => ({ n, count: counts[i], pct: (counts[i] / max) * 100 }));
    };
    return {
      self: build(analytics?.ratingDistribution?.self),
      manager: build(analytics?.ratingDistribution?.manager),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analytics, meta]);

  const hasAnalyticsData = Boolean(analytics && analytics.totals.employees > analytics.totals.notStarted);
  const competencyRows = analytics?.competencyAverages ?? [];
  const deptCompareRows = analytics?.deptCompare ?? null;

  const handleCloseDialog = () => setOpenReview(null);
  const handleSubmitted = () => { loadRoster(); loadAnalytics(); loadComparison(); };

  if (loading) {
    return <p style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)" }}>{t("performance.loading")}</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-5)" }}>
      <div className="content-card">
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", flexWrap: "wrap" }}>
          <h2 style={{ fontSize: "var(--fs-2xl)", fontWeight: "var(--fw-semibold)", color: "var(--txt-primary)", margin: 0 }}>
            {t("performance.title")}
          </h2>
        </div>
        <div style={{ display: "flex", gap: "var(--sp-2)", marginTop: "var(--sp-4)", flexWrap: "wrap" }}>
          {cycles.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setSelectedCycleKey(c.key)}
              style={{
                fontFamily: "var(--font-family)", fontWeight: "var(--fw-bold)", fontSize: "var(--fs-sm)",
                padding: "9px 16px", cursor: "pointer",
                background: c.key === selectedCycleKey ? "var(--txt-primary)" : "transparent",
                color: c.key === selectedCycleKey ? "var(--bg-surface)" : "var(--txt-primary)",
                border: "1px solid " + (c.key === selectedCycleKey ? "var(--txt-primary)" : "var(--bdr-default)"),
              }}
            >
              {c.label}{c.status === "Open" && ` (${t("performance.open")})`}
            </button>
          ))}
          {isAdmin && selectedCycle && (
            <button
              type="button"
              onClick={handleToggleCycleStatus}
              disabled={togglingCycle}
              style={{
                fontFamily: "var(--font-family)", fontWeight: "var(--fw-bold)", fontSize: "var(--fs-sm)",
                padding: "9px 16px", cursor: togglingCycle ? "default" : "pointer",
                background: "transparent", color: "var(--txt-primary)", border: "1px solid var(--bdr-default)",
                opacity: togglingCycle ? 0.6 : 1,
              }}
            >
              {selectedCycle.status === "Open" ? t("performance.toolbar.closeCycle") : t("performance.toolbar.reopenCycle")}
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowCreateCycle(true)}
              style={{
                fontFamily: "var(--font-family)", fontWeight: "var(--fw-bold)", fontSize: "var(--fs-sm)",
                padding: "9px 16px", cursor: "pointer",
                background: "transparent", color: "var(--txt-primary)", border: "1px dashed var(--bdr-default)",
              }}
            >
              {t("performance.toolbar.newCustomCycle")}
            </button>
          )}
        </div>
      </div>

      {selectedCycle?.status === "Closed" && (
        <div className="form-error" style={{ background: "var(--bg-warning-subtle)", color: "var(--txt-warning)", border: "1px solid var(--bdr-warning)" }}>
          {t("performance.toolbar.closedNote")}
        </div>
      )}

      {error && <p className="form-error">{error}</p>}

      {!error && (
        <>
          <div className="stat-strip">
            {statCells.map((c) => (
              <div key={c.label} className="stat-cell" style={{ cursor: "default" }}>
                <div className="stat-cell-label">{c.label}</div>
                <div className="stat-cell-value">{c.value}</div>
                <div className="stat-cell-trend">{c.trend}</div>
              </div>
            ))}
          </div>

          <div className="content-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--sp-3)", marginBottom: "var(--sp-5)", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {t("performance.rosterLabel")}
                </div>
                <h3 style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-semibold)", margin: 0 }}>
                  {selectedCycle?.label ?? ""}
                </h3>
              </div>
              <input
                type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder={t("common2.searchEmployeesPlaceholder", { defaultValue: "Search employees…" })}
                style={{
                  fontFamily: "var(--font-family)", fontSize: "var(--fs-sm)", padding: "9px var(--sp-4)",
                  background: "var(--bg-surface)", color: "var(--txt-primary)",
                  border: "1px solid var(--bdr-default)", borderRadius: "var(--radius-md)", width: "240px",
                }}
              />
            </div>

            {filteredRoster.length === 0 ? (
              <div className="empty-state">
                <h3 className="empty-state-title">{t("performance.empty.title")}</h3>
                <p className="empty-state-description">{t("performance.empty.description")}</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t("performance.table.employee")}</th>
                      <th>{t("performance.table.department")}</th>
                      <th>{t("performance.table.selfRating")}</th>
                      <th>{t("performance.table.managerRating")}</th>
                      <th>{t("performance.table.status")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRoster.map((r) => (
                      <tr
                        key={r.employeeId}
                        style={{ cursor: "pointer" }}
                        onClick={() => setOpenReview({ employeeId: r.employeeId, employeeName: r.name })}
                      >
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
                            <Avatar name={r.name} size="xs" />
                            <div style={{ fontWeight: "var(--fw-medium)" }}>{r.name}</div>
                          </div>
                        </td>
                        <td style={{ color: "var(--txt-secondary)" }}>{r.department ?? "—"}</td>
                        <td style={{ color: "var(--txt-secondary)" }}>{r.selfRating ?? "—"}</td>
                        <td style={{ color: "var(--txt-secondary)" }}>{r.managerRating ?? "—"}</td>
                        <td>
                          <Badge variant={STATUS_DISPLAY[r.status]?.variant ?? "neutral"} size="sm">
                            {t(`performance.status.${STATUS_DISPLAY[r.status]?.key}`, { defaultValue: r.status })}
                          </Badge>
                          {r.hasAppeal && (
                            <Badge
                              variant={r.appealStatus === "Resolved" ? "success" : "warning"}
                              size="sm"
                              style={{ marginLeft: "var(--sp-2)" }}
                            >
                              {t(`performance.dialog.appealStatus.${r.appealStatus}`, { defaultValue: r.appealStatus })}
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {hasAnalyticsData && (
            <>
              <h3 style={{ fontSize: "var(--fs-xs)", fontWeight: "var(--fw-bold)", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--txt-secondary)", margin: 0 }}>
                {t("performance.analytics.title")}
              </h3>

              <div style={{ display: "grid", gridTemplateColumns: deptCompareRows?.length > 1 ? "1.3fr 1fr" : "1fr", gap: "var(--sp-5)" }}>
                <div className="content-card">
                  <h3 style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-semibold)", margin: 0 }}>{t("performance.analytics.ratingDistTitle")}</h3>
                  <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", marginBottom: "var(--sp-4)" }}>{t("performance.analytics.ratingDistSub")}</div>
                  <div style={{ display: "flex", gap: "var(--sp-5)" }}>
                    {[
                      { key: "self", bars: ratingDistBars.self },
                      { key: "manager", bars: ratingDistBars.manager },
                    ].map((group) => (
                      <div key={group.key} style={{ flex: 1 }}>
                        <div style={{ fontSize: "var(--fs-xs)", fontWeight: "var(--fw-bold)", color: "var(--txt-secondary)", textTransform: "uppercase", marginBottom: "var(--sp-2)" }}>
                          {t(`performance.analytics.${group.key}`)}
                        </div>
                        <div style={{ display: "flex", alignItems: "flex-end", gap: "var(--sp-2)", height: "90px" }}>
                          {group.bars.map((bar) => (
                            <div key={bar.n} title={ratingLabel(bar.n)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end" }}>
                              <div style={{ fontSize: "10px", color: "var(--txt-secondary)", marginBottom: "2px" }}>{bar.count}</div>
                              <div style={{ width: "100%", height: "70px", display: "flex", alignItems: "flex-end", background: "var(--bg-surface-sub)" }}>
                                <div style={{ width: "100%", height: `${bar.pct}%`, background: "var(--bg-primary)" }} />
                              </div>
                              <div style={{ fontSize: "10px", color: "var(--txt-secondary)", marginTop: "2px" }}>{bar.n}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {deptCompareRows?.length > 1 && (
                  <div className="content-card">
                    <h3 style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-semibold)", margin: 0 }}>{t("performance.analytics.deptCompareTitle")}</h3>
                    <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", marginBottom: "var(--sp-4)" }}>{t("performance.analytics.deptCompareSub")}</div>
                    {deptCompareRows.map((d) => (
                      <div key={d.departmentId ?? d.department} style={{ marginBottom: "var(--sp-3)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--fs-sm)", marginBottom: "4px" }}>
                          <span>{d.department ?? "—"}</span>
                          <span style={{ color: "var(--txt-secondary)" }}>{d.avgManager ?? "—"}</span>
                        </div>
                        <div style={{ height: "6px", background: "var(--bg-surface-sub)" }}>
                          <div style={{ height: "100%", width: `${((d.avgManager ?? 0) / 5) * 100}%`, background: "var(--bg-primary)" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="content-card">
                <h3 style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-semibold)", margin: 0 }}>{t("performance.analytics.competencyTitle")}</h3>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", marginBottom: "var(--sp-4)" }}>{t("performance.analytics.competencySub")}</div>
                {competencyRows.map((row) => (
                  <div key={row.key} style={{ padding: "8px 0", borderBottom: "1px solid var(--bdr-subtle)" }}>
                    <div style={{ fontSize: "var(--fs-sm)", fontWeight: "var(--fw-medium)", marginBottom: "6px" }}>
                      {t(`performance.competencies.${row.key}`, { defaultValue: row.key })}
                    </div>
                    {[
                      { label: t("performance.analytics.self"), value: row.self },
                      { label: t("performance.analytics.manager"), value: row.manager },
                    ].map((line) => (
                      <div key={line.label} style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", marginBottom: "3px" }}>
                        <span style={{ fontSize: "10px", color: "var(--txt-secondary)", width: "56px", flexShrink: 0 }}>{line.label}</span>
                        <div style={{ flex: 1, height: "6px", background: "var(--bg-surface-sub)" }}>
                          <div style={{ height: "100%", width: `${((line.value ?? 0) / 5) * 100}%`, background: "var(--bg-primary)" }} />
                        </div>
                        <span style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", width: "24px", textAlign: "right", flexShrink: 0 }}>{line.value ?? "—"}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {comparison && (
                <div className="content-card">
                  <h3 style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-semibold)", margin: 0 }}>{t("performance.comparison.title")}</h3>
                  <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", marginBottom: "var(--sp-4)" }}>
                    {comparison.previous
                      ? t("performance.comparison.sub", { label: comparison.previous.label })
                      : t("performance.comparison.noPrevious")}
                  </div>

                  {comparison.previous && (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "var(--sp-4)", marginBottom: "var(--sp-5)" }}>
                        {[
                          { label: t("performance.comparison.avgRatingDelta"), delta: formatDelta(comparison.data.deltas.avgManagerDelta) },
                          { label: t("performance.comparison.completionRateDelta"), delta: formatDelta(comparison.data.deltas.completionRateDelta, { percent: true }) },
                          { label: t("performance.comparison.appealRateDelta"), delta: formatDelta(comparison.data.deltas.appealRateDelta, { percent: true, invert: true }) },
                        ].map((row) => (
                          <div key={row.label}>
                            <div style={{ fontSize: "10px", fontWeight: "var(--fw-bold)", color: "var(--txt-secondary)", textTransform: "uppercase", marginBottom: "4px" }}>
                              {row.label}
                            </div>
                            <div className={`stat-card-trend ${row.delta.cls}`} style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-semibold)" }}>
                              {row.delta.text}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div style={{ fontSize: "var(--fs-xs)", fontWeight: "var(--fw-bold)", color: "var(--txt-secondary)", textTransform: "uppercase", marginBottom: "var(--sp-2)" }}>
                        {t("performance.comparison.competencyDelta")}
                      </div>
                      {comparison.data.deltas.competencyDeltas.map((row) => {
                        const managerDelta = formatDelta(row.managerDelta);
                        return (
                          <div key={row.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--bdr-subtle)" }}>
                            <span style={{ fontSize: "var(--fs-sm)" }}>{t(`performance.competencies.${row.key}`, { defaultValue: row.key })}</span>
                            <span className={`stat-card-trend ${managerDelta.cls}`}>{managerDelta.text}</span>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}

      {openReview && selectedCycleKey && (
        <PerformanceReviewDialog
          cycleKey={selectedCycleKey}
          employeeId={openReview.employeeId}
          employeeName={openReview.employeeName}
          meta={meta}
          onClose={handleCloseDialog}
          onSubmitted={handleSubmitted}
        />
      )}

      {showCreateCycle && (
        <CreateCycleDialog onClose={() => setShowCreateCycle(false)} onCreated={handleCycleCreated} />
      )}
    </div>
  );
}

export default Performance;
