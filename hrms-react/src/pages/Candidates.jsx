import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useStore } from "../context/StoreContext";
import Avatar from "../components/Avatar";
import { CandidateStageBadge } from "../components/Badge";
import CandidateSidePanel from "../components/CandidateSidePanel";
import { idsMatch } from "../utils/id";
import Button from "../components/Button";

const STAGES = ["Applied", "Screening", "Interview", "Offer", "Hired", "Rejected"];

function StarRating({ rating }) {
  const full = Math.round(rating);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "2px" }}>
      {Array.from({ length: 5 }, (_, i) => (
        <svg key={i} width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.7 7-6.3-3.9-6.3 3.9 1.7-7L1.9 9.2l7.1-.6z"
            fill={i < full ? "var(--clr-warning-400)" : "var(--bdr-default)"}
          />
        </svg>
      ))}
      <span style={{ marginLeft: "4px", fontSize: "var(--fs-sm)", color: "var(--txt-secondary)" }}>
        {rating.toFixed(1)}
      </span>
    </span>
  );
}

/**
 * KanbanBoard — 8.0e Day 9. Native HTML5 drag-and-drop across the existing
 * STAGES values, no extra library. Dropping a card on a column calls the
 * same handleStageChange(id, stage) the list view's actions already use.
 */
function KanbanBoard({ candidates, getJobById, onStageChange, onSelectCandidate }) {
  const { t } = useTranslation();
  const [dragOverStage, setDragOverStage] = useState(null);

  const byStage = useMemo(() => {
    const map = {};
    STAGES.forEach((s) => { map[s] = []; });
    candidates.forEach((c) => {
      if (!map[c.stage]) map[c.stage] = [];
      map[c.stage].push(c);
    });
    return map;
  }, [candidates]);

  const handleDrop = (e, stage) => {
    e.preventDefault();
    setDragOverStage(null);
    const id = e.dataTransfer.getData("text/plain");
    if (id) onStageChange(id, stage);
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${STAGES.length}, minmax(220px, 1fr))`,
        gap: "var(--sp-4)",
        overflowX: "auto",
        paddingBottom: "var(--sp-2)",
      }}
    >
      {STAGES.map((stage) => {
        const items = byStage[stage] || [];
        const isOver = dragOverStage === stage;
        return (
          <div
            key={stage}
            onDragOver={(e) => { e.preventDefault(); setDragOverStage(stage); }}
            onDragLeave={() => setDragOverStage((s) => (s === stage ? null : s))}
            onDrop={(e) => handleDrop(e, stage)}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--sp-3)",
              minHeight: "120px",
              padding: "var(--sp-3)",
              borderRadius: "var(--radius-md)",
              background: isOver ? "var(--bg-primary-subtle)" : "var(--bg-surface-alt)",
              border: isOver ? "2px dashed var(--bdr-brand)" : "1px solid var(--bdr-subtle)",
              transition: "background 0.15s, border-color 0.15s",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "var(--fs-sm)", fontWeight: "var(--fw-medium)", color: "var(--txt-primary)" }}>
                {t(`common.candidateStages.${stage}`, { defaultValue: stage })}
              </span>
              <span style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)" }}>{items.length}</span>
            </div>

            {items.length === 0 ? (
              <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-disabled)", textAlign: "center", padding: "var(--sp-4) 0" }}>
                {t("candidates.kanban.dropHere")}
              </div>
            ) : (
              items.map((candidate) => {
                const job = getJobById(candidate.jobId);
                return (
                  <div
                    key={candidate.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", candidate.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onClick={() => onSelectCandidate(candidate.id)}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                      padding: "var(--sp-3)",
                      background: "var(--bg-surface)",
                      border: "1px solid var(--bdr-default)",
                      borderRadius: "var(--radius-md)",
                      cursor: "grab",
                      boxShadow: "var(--shadow-xs)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
                      <Avatar name={candidate.name} size="sm" />
                      <span style={{
                        fontSize: "var(--fs-sm)", fontWeight: "var(--fw-medium)", color: "var(--txt-primary)",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {candidate.name}
                      </span>
                    </div>
                    <div style={{
                      fontSize: "var(--fs-xs)", color: "var(--txt-secondary)",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      {job ? job.title : t("candidates.table.noRole")}
                    </div>
                    <StarRating rating={candidate.rating} />
                  </div>
                );
              })
            )}
          </div>
        );
      })}
    </div>
  );
}

function Candidates() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const jobIdParam = searchParams.get("job");

  const { candidates, updateCandidate, uploadCandidateCv, removeCandidate, getJobById } = useStore();

  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [selectedCandidateId, setSelectedCandidateId] = useState(null);
  // 8.0e Day 9 — Kanban board alongside the existing list view.
  const [viewMode, setViewMode] = useState("list"); // "list" | "kanban"

  const jobFilterId = jobIdParam || null;
  const jobFilter = jobFilterId ? getJobById(jobFilterId) : null;

  const stats = useMemo(() => {
    const inInterview = candidates.filter((c) => c.stage === "Interview").length;
    const offers = candidates.filter((c) => c.stage === "Offer").length;
    const hired = candidates.filter((c) => c.stage === "Hired").length;
    const avgRating =
      candidates.length === 0
        ? 0
        : candidates.reduce((sum, c) => sum + c.rating, 0) / candidates.length;
    return {
      total: candidates.length,
      inInterview,
      offers,
      hired,
      avgRating,
    };
  }, [candidates]);

  const filteredCandidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return candidates.filter((c) => {
      const job = getJobById(c.jobId);
      const roleTitle = job?.title ?? "";
      const matchesSearch =
        !q ||
        c.name.toLowerCase().includes(q) ||
        roleTitle.toLowerCase().includes(q);
      const matchesStage = stageFilter === "all" || c.stage === stageFilter;
      const matchesJob = !jobFilterId || idsMatch(c.jobId, jobFilterId);
      return matchesSearch && matchesStage && matchesJob;
    });
  }, [candidates, search, stageFilter, jobFilterId, getJobById]);

  const hasActiveFilters = Boolean(search) || stageFilter !== "all" || Boolean(jobFilterId);

  const handleReset = () => {
    setSearch("");
    setStageFilter("all");
    setSearchParams({});
  };

  const clearJobFilter = () => {
    setSearchParams({});
  };

  const handleStageChange = (id, stage) => {
    updateCandidate(id, { stage });
  };

  const handleDelete = (id) => {
    removeCandidate(id);
  };

  const selectedCandidate = candidates.find((c) => c.id === selectedCandidateId) ?? null;

  return (
    <div>
      <div className="toolbar" style={{ marginBottom: "var(--sp-5)" }}>
        <h2 style={{ flex: 1 }}>{t("candidates.title")}</h2>
        <div style={{ display: "flex", gap: "var(--sp-1)", padding: "3px", background: "var(--bg-surface-alt)", borderRadius: "var(--radius-sm)" }}>
          {[
            {
              v: "list", label: t("candidates.viewToggle.list"),
              icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="1" /><path d="M3 10h18M9 4v16" /></svg>,
            },
            {
              v: "kanban", label: t("candidates.viewToggle.kanban"),
              icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="5" height="16" rx="1" /><rect x="10" y="4" width="5" height="10" rx="1" /><rect x="17" y="4" width="5" height="13" rx="1" /></svg>,
            },
          ].map(({ v, label, icon }) => (
            <button key={v} type="button" onClick={() => { setViewMode(v); if (v === "kanban") setStageFilter("all"); }} style={{
              display: "inline-flex", alignItems: "center", gap: "6px",
              padding: "5px 14px", borderRadius: "0", border: "none",
              background: viewMode === v ? "var(--bg-surface)" : "transparent",
              color: viewMode === v ? "var(--txt-primary)" : "var(--txt-secondary)",
              fontFamily: "var(--font-family)", fontSize: "var(--fs-sm)", cursor: "pointer",
              fontWeight: viewMode === v ? "var(--fw-medium)" : "var(--fw-regular)",
              boxShadow: viewMode === v ? "var(--shadow-xs)" : "none", transition: "all 0.15s",
            }}>{icon}{label}</button>
          ))}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "var(--sp-4)",
          marginBottom: "var(--sp-5)",
        }}
      >
        <div className="stat-card">
          <div className="stat-card-label">{t("candidates.stats.total.title")}</div>
          <div className="stat-card-value">{stats.total}</div>
          <div className="stat-card-hint">{t("candidates.stats.total.hint")}</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">{t("candidates.stats.inInterview.title")}</div>
          <div className="stat-card-value">{stats.inInterview}</div>
          <div className="stat-card-hint">{t("candidates.stats.inInterview.hint")}</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">{t("candidates.stats.offers.title")}</div>
          <div className="stat-card-value">{stats.offers}</div>
          <div className="stat-card-hint">{t("candidates.stats.offers.hint")}</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">{t("candidates.stats.avgRating.title")}</div>
          <div className="stat-card-value">{stats.avgRating.toFixed(1)}</div>
          <div className="stat-card-hint">{t("candidates.stats.avgRating.hint")}</div>
        </div>
      </div>

      <div className="content-card">
        <div className="toolbar">
          <input
            type="text"
            className="search-input"
            placeholder={t("candidates.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {/* Kanban already splits by stage via its columns, so the stage
              filter only applies to the list view. */}
          {viewMode === "list" && (
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              style={{
                padding: "10px var(--sp-4)",
                border: "1px solid var(--bdr-default)",
                borderRadius: "var(--radius-md)",
                background: "var(--bg-surface)",
                color: "var(--txt-primary)",
                fontFamily: "var(--font-family)",
                fontSize: "var(--fs-md)",
              }}
            >
              <option value="all">{t("candidates.allStages")}</option>
              {STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {t(`common.candidateStages.${stage}`, { defaultValue: stage })}
                </option>
              ))}
            </select>
          )}

          {jobFilterId && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--sp-2)",
                padding: "10px var(--sp-4)",
                border: "1px solid var(--bdr-brand)",
                borderRadius: "var(--radius-md)",
                color: "var(--txt-primary-brand)",
                fontSize: "var(--fs-sm)",
                background: "var(--bg-primary-subtle)",
              }}
            >
              {t("candidates.jobFilter.label", { title: jobFilter ? jobFilter.title : t("candidates.jobFilter.unknown") })}
              <button
                type="button"
                onClick={clearJobFilter}
                aria-label={t("candidates.jobFilter.clear")}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--txt-primary-brand)",
                  fontSize: "var(--fs-md)",
                  padding: 0,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
          )}

          <Button
            variant="secondary"
            onClick={handleReset}
            disabled={!hasActiveFilters}
            title={t("candidates.resetTooltip")}
          >
            {t("candidates.reset")}
          </Button>
        </div>

        {filteredCandidates.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--txt-disabled)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
              </svg>
            </div>
            <div className="empty-state-title">{t("candidates.empty.title")}</div>
            <div className="empty-state-description">
              {hasActiveFilters
                ? t("candidates.empty.filtered")
                : t("candidates.empty.unfiltered")}
            </div>
            {hasActiveFilters && (
              <Button
                variant="secondary"
                onClick={handleReset}
              >
                {t("candidates.empty.clearFilters")}
              </Button>
            )}
          </div>
        ) : viewMode === "kanban" ? (
          <KanbanBoard
            candidates={filteredCandidates}
            getJobById={getJobById}
            onStageChange={handleStageChange}
            onSelectCandidate={setSelectedCandidateId}
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("candidates.table.candidate")}</th>
                <th>{t("candidates.table.roleAppliedFor")}</th>
                <th>{t("candidates.table.stage")}</th>
                <th>{t("candidates.table.rating")}</th>
                <th>{t("candidates.table.appliedDate")}</th>
                <th>{t("candidates.table.action")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredCandidates.map((candidate) => {
                const job = getJobById(candidate.jobId);
                return (
                  <tr key={candidate.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
                        <Avatar name={candidate.name} size="sm" />
                        <span style={{ fontWeight: "var(--fw-medium)" }}>{candidate.name}</span>
                      </div>
                    </td>
                    <td>{job ? job.title : t("candidates.table.noRole")}</td>
                    <td>
                      <CandidateStageBadge stage={candidate.stage} />
                    </td>
                    <td>
                      <StarRating rating={candidate.rating} />
                    </td>
                    <td>{candidate.appliedDate}</td>
                    <td>
                      <Button
                        variant="link"
                        onClick={() => setSelectedCandidateId(candidate.id)}
                      >
                        {t("candidates.table.view")}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {selectedCandidate && (
        <CandidateSidePanel
          candidate={selectedCandidate}
          jobTitle={getJobById(selectedCandidate.jobId)?.title}
          onClose={() => setSelectedCandidateId(null)}
          onStageChange={handleStageChange}
          onUploadCv={uploadCandidateCv}
          onDelete={(id) => {
            handleDelete(id);
            setSelectedCandidateId(null);
          }}
        />
      )}
    </div>
  );
}

export default Candidates;
