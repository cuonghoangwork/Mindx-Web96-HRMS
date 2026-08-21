import { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { PerformanceReviewsAPI } from "../api";
import Avatar from "../components/Avatar";
import Badge from "../components/Badge";
import PerformanceReviewDialog from "../components/PerformanceReviewDialog";

// Milestone 1 (see PERFORMANCE_REVIEWS_TASK_SPLIT.md) — cycles, roster,
// self/manager review submission. Competencies, goals, peer feedback,
// appeals, analytics, and the AI insight button land in later milestones.
const STATUS_VARIANT = { completed: "success", "self-only": "warning", "not-started": "danger" };

function statusOf(row) {
  if (row.selfRating != null && row.managerRating != null) return "completed";
  if (row.selfRating != null || row.managerRating != null) return "self-only";
  return "not-started";
}

function Performance() {
  const { t } = useTranslation();

  const [meta, setMeta] = useState(null);
  const [cycles, setCycles] = useState([]);
  const [selectedCycleKey, setSelectedCycleKey] = useState(null);
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [openReview, setOpenReview] = useState(null); // { employeeId, employeeName } | null

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

  const selectedCycle = cycles.find((c) => c.key === selectedCycleKey) ?? null;

  const statCells = useMemo(() => {
    const total = roster.length;
    const completed = roster.filter((r) => statusOf(r) === "completed").length;
    const selfOnly = roster.filter((r) => statusOf(r) === "self-only").length;
    const ratings = roster.map((r) => r.managerRating).filter((v) => v != null);
    const avgManagerRating = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : "—";
    return [
      { label: t("performance.stats.completed"), value: `${completed}/${total}`, trend: t("performance.stats.completedHint") },
      { label: t("performance.stats.selfOnly"), value: selfOnly, trend: t("performance.stats.selfOnlyHint") },
      { label: t("performance.stats.notStarted"), value: total - completed - selfOnly, trend: t("performance.stats.notStartedHint") },
      { label: t("performance.stats.avgManagerRating"), value: avgManagerRating, trend: t("performance.stats.avgManagerRatingHint") },
    ];
  }, [roster, t]);

  const filteredRoster = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter((r) => r.name.toLowerCase().includes(q) || (r.department ?? "").toLowerCase().includes(q));
  }, [roster, search]);

  const handleCloseDialog = () => setOpenReview(null);
  const handleSubmitted = () => loadRoster();

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
        </div>
      </div>

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
                          <Badge variant={STATUS_VARIANT[statusOf(r)]} size="sm">
                            {t(`performance.status.${statusOf(r)}`)}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {openReview && selectedCycleKey && (
        <PerformanceReviewDialog
          cycleKey={selectedCycleKey}
          employeeId={openReview.employeeId}
          employeeName={openReview.employeeName}
          cycleOpen={selectedCycle?.status === "Open"}
          meta={meta}
          onClose={handleCloseDialog}
          onSubmitted={handleSubmitted}
        />
      )}
    </div>
  );
}

export default Performance;
