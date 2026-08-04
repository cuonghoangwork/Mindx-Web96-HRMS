import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../context/StoreContext";
import Badge, { TypeBadge } from "../components/Badge";
import AddJobModal from "../components/AddJobModal";

const STATUS_VARIANT = {
  Open: "success",
  Filled: "primary",
  Closed: "neutral",
};

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Task 5.1 — pay range shown on the job card / details panel.
function formatSalaryRange(job) {
  const { salaryMin, salaryMax, salaryCurrency } = job;
  if (!salaryMin && !salaryMax) return null;
  const currency = salaryCurrency || "USD";
  const fmt = (n) => `${currency} ${Number(n).toLocaleString()}`;
  if (salaryMin && salaryMax && salaryMin !== salaryMax) return `${fmt(salaryMin)} – ${fmt(salaryMax)}`;
  return fmt(salaryMin || salaryMax);
}

function Jobs() {
  const navigate = useNavigate();
  const { departments, jobs, addJob, updateJob, removeJob, getApplicantCount } =
    useStore();
  const departmentNames = useMemo(
    () => departments.map((d) => d.name),
    [departments],
  );

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [expandedId, setExpandedId] = useState(null); // task 5.1 — details expand/collapse

  const stats = useMemo(() => {
    const open = jobs.filter((j) => j.status === "Open");
    const totalApplicants = jobs.reduce(
      (sum, j) => sum + getApplicantCount(j.id),
      0,
    );
    const filledCount = jobs.filter((j) => j.status === "Filled").length;
    return {
      openCount: open.length,
      totalApplicants,
      filledCount,
      totalJobs: jobs.length,
    };
  }, [jobs, getApplicantCount]);

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobs.filter((job) => {
      const matchesSearch =
        !q ||
        job.title.toLowerCase().includes(q) ||
        job.department.toLowerCase().includes(q) ||
        job.location.toLowerCase().includes(q);
      const matchesStatus =
        statusFilter === "all" || job.status === statusFilter;
      const matchesDepartment =
        departmentFilter === "all" || job.department === departmentFilter;
      return matchesSearch && matchesStatus && matchesDepartment;
    });
  }, [jobs, search, statusFilter, departmentFilter]);

  const hasActiveFilters =
    Boolean(search) || statusFilter !== "all" || departmentFilter !== "all";

  const handleReset = () => {
    setSearch("");
    setStatusFilter("all");
    setDepartmentFilter("all");
  };

  const [jobError, setJobError] = useState("");

  const handleSaveJob = async (job) => {
    setJobError("");
    try {
      if (job.id) {
        await updateJob(job.id, job);
      } else {
        await addJob(job);
      }
      setEditingJob(null);
      setModalOpen(false);
    } catch (err) {
      setJobError(err.message || "Failed to save job.");
    }
  };

  const handleDelete = (id) => {
    if (confirm("Delete this job posting? Linked candidates will remain in the pipeline but will show as unassigned.")) {
      removeJob(id);
    }
  };

  return (
    <div>
      {jobError && (
        <div className="form-error" style={{ marginBottom: "var(--sp-4)" }}>
          {jobError}
        </div>
      )}
      <div className="toolbar" style={{ marginBottom: "var(--sp-5)" }}>
        <h2 style={{ flex: 1 }}>Job Openings</h2>
        <button
          className="btn btn-primary"
          onClick={() => {
            setEditingJob(null);
            setModalOpen(true);
          }}
        >
          + Post New Job
        </button>
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
          <div className="stat-card-label">Open Positions</div>
          <div className="stat-card-value">{stats.openCount}</div>
          <div className="stat-card-hint">Currently hiring</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">Total Applicants</div>
          <div className="stat-card-value">{stats.totalApplicants}</div>
          <div className="stat-card-hint">Across all postings</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">Filled Roles</div>
          <div className="stat-card-value">{stats.filledCount}</div>
          <div className="stat-card-hint">Positions closed with a hire</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">Total Postings</div>
          <div className="stat-card-value">{stats.totalJobs}</div>
          <div className="stat-card-hint">All job openings</div>
        </div>
      </div>

      <div className="content-card">
        <div className="toolbar">
          <input
            type="text"
            className="search-input"
            placeholder="Search by title, department, location..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
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
            <option value="all">All Statuses</option>
            <option value="Open">Open</option>
            <option value="Filled">Filled</option>
            <option value="Closed">Closed</option>
          </select>

          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
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
            <option value="all">All Departments</option>
            {departmentNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

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

        {filteredJobs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--txt-disabled)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="2" y="7" width="20" height="14" rx="2" />
                <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
                <line x1="12" y1="12" x2="12" y2="16" />
                <line x1="10" y1="14" x2="14" y2="14" />
              </svg>
            </div>
            <div className="empty-state-title">No job openings found</div>
            <div className="empty-state-description">
              {hasActiveFilters
                ? "Try adjusting your search or filters to find what you're looking for."
                : "Post a new job to start building your hiring pipeline."}
            </div>
            {hasActiveFilters ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleReset}
              >
                Clear filters
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setModalOpen(true)}
              >
                + Post New Job
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}>
            {filteredJobs.map((job) => {
              const applicantCount = getApplicantCount(job.id);
              const salaryRange = formatSalaryRange(job);
              const hasDetails = Boolean(
                job.description || job.requirements?.length || job.benefits?.length ||
                job.companyInfo || job.applicationInstructions || salaryRange || job.deadline,
              );
              const isExpanded = expandedId === job.id;
              return (
                <div
                  key={job.id}
                  style={{
                    padding: "var(--sp-5)",
                    background: "var(--bg-surface-alt)",
                    borderRadius: "var(--radius-lg)",
                    border: "1px solid var(--bdr-subtle)",
                  }}
                >
                  <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    gap: "var(--sp-4)", flexWrap: "wrap",
                  }}>
                    <div style={{ minWidth: "200px" }}>
                      <h3 style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-semibold)" }}>
                        {job.title}
                      </h3>
                      <p
                        style={{
                          fontSize: "var(--fs-sm)",
                          color: "var(--txt-secondary)",
                          marginTop: "var(--sp-1)",
                        }}
                      >
                        {job.department} • {job.location} • Posted {formatDate(job.postedDate)}
                        {job.deadline ? ` • Apply by ${formatDate(job.deadline)}` : ""}
                      </p>
                      <div style={{ marginTop: "var(--sp-2)", display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
                        <Badge variant={STATUS_VARIANT[job.status] ?? "neutral"} size="sm" dot>
                          {job.status}
                        </Badge>
                        <TypeBadge type={job.type} size="sm" />
                        {salaryRange && <Badge variant="info" size="sm">{salaryRange}</Badge>}
                      </div>
                    </div>

                    <div style={{ textAlign: "right", display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
                      <div>
                        <div style={{ fontSize: "var(--fs-2xl)", fontWeight: "var(--fw-semibold)", color: "var(--txt-primary)" }}>
                          {applicantCount}
                        </div>
                        <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)" }}>
                          applicant{applicantCount === 1 ? "" : "s"}
                        </div>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: "8px 16px", fontSize: "var(--fs-xs)" }}
                          onClick={() => navigate(`/candidates?job=${job.id}`)}
                        >
                          View Applicants
                        </button>
                        <div style={{ display: "flex", gap: "var(--sp-2)" }}>
                          {hasDetails && (
                            <button
                              className="btn btn-secondary"
                              style={{ padding: "8px 16px", fontSize: "var(--fs-xs)" }}
                              onClick={() => setExpandedId(isExpanded ? null : job.id)}
                            >
                              {isExpanded ? "Hide Details" : "Details"}
                            </button>
                          )}
                          <button
                            className="btn btn-secondary"
                            style={{ padding: "8px 16px", fontSize: "var(--fs-xs)" }}
                            onClick={() => {
                              setEditingJob(job);
                              setModalOpen(true);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn-secondary"
                            style={{
                              padding: "8px 16px",
                              fontSize: "var(--fs-xs)",
                              color: "var(--txt-danger)",
                            }}
                            onClick={() => handleDelete(job.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{
                      marginTop: "var(--sp-4)", paddingTop: "var(--sp-4)",
                      borderTop: "1px solid var(--bdr-subtle)",
                      display: "flex", flexDirection: "column", gap: "var(--sp-3)",
                      fontSize: "var(--fs-sm)", color: "var(--txt-secondary)",
                    }}>
                      {job.description && (
                        <div>
                          <div style={{ fontWeight: "var(--fw-medium)", color: "var(--txt-primary)", marginBottom: "var(--sp-1)" }}>
                            Job Description
                          </div>
                          <p style={{ whiteSpace: "pre-wrap" }}>{job.description}</p>
                        </div>
                      )}
                      {job.requirements?.length > 0 && (
                        <div>
                          <div style={{ fontWeight: "var(--fw-medium)", color: "var(--txt-primary)", marginBottom: "var(--sp-1)" }}>
                            Requirements
                          </div>
                          <ul style={{ margin: 0, paddingLeft: "18px" }}>
                            {job.requirements.map((r, i) => <li key={i}>{r}</li>)}
                          </ul>
                        </div>
                      )}
                      {job.benefits?.length > 0 && (
                        <div>
                          <div style={{ fontWeight: "var(--fw-medium)", color: "var(--txt-primary)", marginBottom: "var(--sp-1)" }}>
                            Pay &amp; Benefits
                          </div>
                          <ul style={{ margin: 0, paddingLeft: "18px" }}>
                            {job.benefits.map((b, i) => <li key={i}>{b}</li>)}
                          </ul>
                        </div>
                      )}
                      {job.companyInfo && (
                        <div>
                          <div style={{ fontWeight: "var(--fw-medium)", color: "var(--txt-primary)", marginBottom: "var(--sp-1)" }}>
                            About the Company
                          </div>
                          <p style={{ whiteSpace: "pre-wrap" }}>{job.companyInfo}</p>
                        </div>
                      )}
                      {job.applicationInstructions && (
                        <div>
                          <div style={{ fontWeight: "var(--fw-medium)", color: "var(--txt-primary)", marginBottom: "var(--sp-1)" }}>
                            How to Apply
                          </div>
                          <p style={{ whiteSpace: "pre-wrap" }}>{job.applicationInstructions}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modalOpen && (
        <AddJobModal
          onClose={() => {
            setModalOpen(false);
            setEditingJob(null);
          }}
          onSave={handleSaveJob}
          job={editingJob}
          departments={departmentNames}
        />
      )}
    </div>
  );
}

export default Jobs;
