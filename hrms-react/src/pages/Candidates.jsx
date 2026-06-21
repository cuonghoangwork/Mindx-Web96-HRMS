import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useStore } from "../context/StoreContext";
import Avatar from "../components/Avatar";
import { CandidateStageBadge } from "../components/Badge";
import CandidateSidePanel from "../components/CandidateSidePanel";
import { idsMatch } from "../utils/id";

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

function Candidates() {
  const [searchParams, setSearchParams] = useSearchParams();
  const jobIdParam = searchParams.get("job");

  const { candidates, jobs, updateCandidate, removeCandidate, getJobById } = useStore();

  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [selectedCandidateId, setSelectedCandidateId] = useState(null);

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
        <h2 style={{ flex: 1 }}>Candidates</h2>
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
          <div className="stat-card-label">Total Candidates</div>
          <div className="stat-card-value">{stats.total}</div>
          <div className="stat-card-hint">In the pipeline</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">In Interview</div>
          <div className="stat-card-value">{stats.inInterview}</div>
          <div className="stat-card-hint">Active interview stage</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">Offers Extended</div>
          <div className="stat-card-value">{stats.offers}</div>
          <div className="stat-card-hint">Awaiting response</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">Avg. Rating</div>
          <div className="stat-card-value">{stats.avgRating.toFixed(1)}</div>
          <div className="stat-card-hint">Across all candidates</div>
        </div>
      </div>

      <div className="content-card">
        <div className="toolbar">
          <input
            type="text"
            className="search-input"
            placeholder="Search by name or role..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

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
            <option value="all">All Stages</option>
            {STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {stage}
              </option>
            ))}
          </select>

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
              Job: {jobFilter ? jobFilter.title : "Unknown / Removed"}
              <button
                type="button"
                onClick={clearJobFilter}
                aria-label="Clear job filter"
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

          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleReset}
            disabled={!hasActiveFilters}
            title="Reset search and filters"
          >
            Reset
          </button>
        </div>

        {filteredCandidates.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🧑‍💼</div>
            <div className="empty-state-title">No candidates found</div>
            <div className="empty-state-description">
              {hasActiveFilters
                ? "Try adjusting your search or filters to find what you're looking for."
                : "Candidates will appear here once they apply to a job opening."}
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleReset}
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Role Applied For</th>
                <th>Stage</th>
                <th>Rating</th>
                <th>Applied Date</th>
                <th>Action</th>
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
                    <td>{job ? job.title : "—"}</td>
                    <td>
                      <CandidateStageBadge stage={candidate.stage} />
                    </td>
                    <td>
                      <StarRating rating={candidate.rating} />
                    </td>
                    <td>{candidate.appliedDate}</td>
                    <td>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: "8px 16px", fontSize: "var(--fs-xs)" }}
                        onClick={() => setSelectedCandidateId(candidate.id)}
                      >
                        View
                      </button>
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
