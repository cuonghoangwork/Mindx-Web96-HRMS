import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useStore } from "../context/StoreContext";
import { useLanguage } from "../context/LanguageContext";
import { formatDate as formatDateLocalized } from "../utils/format";
import Badge, { TypeBadge } from "../components/Badge";
import AddJobModal from "../components/AddJobModal";
import Button from "../components/Button";
import { translateApiError } from "../utils/apiError";

const STATUS_VARIANT = {
  Open: "success",
  Filled: "primary",
  Closed: "neutral",
};

// Task 6.6 — was previously pinned to "en-US" regardless of the app's
// language toggle; now delegates to utils/format.js so postings display
// with the selected language's date convention.
function formatDate(dateStr, language) {
  return formatDateLocalized(dateStr, language, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Task 5.1 — pay range shown on the job card / details panel.
// Task 6.6 — currency grouping follows the posting's own currency (same
// convention as Payroll.jsx's fmtMoney: VND groups the Vietnamese way,
// everything else groups the US way), not the UI language toggle.
function formatSalaryRange(job) {
  const { salaryMin, salaryMax, salaryCurrency } = job;
  if (!salaryMin && !salaryMax) return null;
  const currency = salaryCurrency || "USD";
  const numberLocale = currency === "VND" ? "vi-VN" : "en-US";
  const fmt = (n) => `${currency} ${Number(n).toLocaleString(numberLocale)}`;
  if (salaryMin && salaryMax && salaryMin !== salaryMax) return `${fmt(salaryMin)} – ${fmt(salaryMax)}`;
  return fmt(salaryMin || salaryMax);
}

function Jobs() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { language } = useLanguage();
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
      setJobError(translateApiError(err, t) || t("jobs.saveFailed", { defaultValue: "Failed to save job." }));
    }
  };

  const handleDelete = (id) => {
    if (confirm(t("jobs.confirmDelete", { defaultValue: "Delete this job posting? Linked candidates will remain in the pipeline but will show as unassigned." }))) {
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
        <h2 style={{ flex: 1 }}>{t("jobs.heading", { defaultValue: "Job Openings" })}</h2>
        <Button
          variant="primary"
          onClick={() => {
            setEditingJob(null);
            setModalOpen(true);
          }}
        >
          {t("jobs.postNewJob", { defaultValue: "+ Post New Job" })}
        </Button>
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
          <div className="stat-card-label">{t("jobs.stats.openPositions", { defaultValue: "Open Positions" })}</div>
          <div className="stat-card-value">{stats.openCount}</div>
          <div className="stat-card-hint">{t("jobs.stats.currentlyHiring", { defaultValue: "Currently hiring" })}</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">{t("jobs.stats.totalApplicants", { defaultValue: "Total Applicants" })}</div>
          <div className="stat-card-value">{stats.totalApplicants}</div>
          <div className="stat-card-hint">{t("jobs.stats.acrossPostings", { defaultValue: "Across all postings" })}</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">{t("jobs.stats.filledRoles", { defaultValue: "Filled Roles" })}</div>
          <div className="stat-card-value">{stats.filledCount}</div>
          <div className="stat-card-hint">{t("jobs.stats.positionsClosedWithHire", { defaultValue: "Positions closed with a hire" })}</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">{t("jobs.stats.totalPostings", { defaultValue: "Total Postings" })}</div>
          <div className="stat-card-value">{stats.totalJobs}</div>
          <div className="stat-card-hint">{t("jobs.stats.allJobOpenings", { defaultValue: "All job openings" })}</div>
        </div>
      </div>

      <div className="content-card">
        <div className="toolbar">
          <input
            type="text"
            className="search-input"
            placeholder={t("jobs.searchPlaceholder", { defaultValue: "Search by title, department, location..." })}
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
            <option value="all">{t("jobs.allStatuses", { defaultValue: "All Statuses" })}</option>
            <option value="Open">{t("common.jobStatus.Open", { defaultValue: "Open" })}</option>
            <option value="Filled">{t("common.jobStatus.Filled", { defaultValue: "Filled" })}</option>
            <option value="Closed">{t("common.jobStatus.Closed", { defaultValue: "Closed" })}</option>
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
            <option value="all">{t("jobs.allDepartments", { defaultValue: "All Departments" })}</option>
            {departmentNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          <Button
            variant="secondary"
            onClick={handleReset}
            disabled={!hasActiveFilters}
            title={t("candidates.resetTooltip", { defaultValue: "Reset search and filters" })}
          >
            {t("filterModal.reset", { defaultValue: "Reset" })}
          </Button>
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
            <div className="empty-state-title">{t("jobs.empty.title", { defaultValue: "No job openings found" })}</div>
            <div className="empty-state-description">
              {hasActiveFilters
                ? t("candidates.empty.filtered", { defaultValue: "Try adjusting your search or filters to find what you're looking for." })
                : t("jobs.empty.unfiltered", { defaultValue: "Post a new job to start building your hiring pipeline." })}
            </div>
            {hasActiveFilters ? (
              <Button
                variant="secondary"
                onClick={handleReset}
              >
                {t("candidates.empty.clearFilters", { defaultValue: "Clear filters" })}
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={() => setModalOpen(true)}
              >
                {t("jobs.postNewJob", { defaultValue: "+ Post New Job" })}
              </Button>
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
                        {t("jobs.card.metaLine", { department: job.department, location: job.location, date: formatDate(job.postedDate, language), defaultValue: "{{department}} • {{location}} • Posted {{date}}" })}
                        {job.deadline ? t("jobs.card.applyBySuffix", { date: formatDate(job.deadline, language), defaultValue: " • Apply by {{date}}" }) : ""}
                      </p>
                      <div style={{ marginTop: "var(--sp-2)", display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
                        <Badge variant={STATUS_VARIANT[job.status] ?? "neutral"} size="sm">
                          {t(`common.jobStatus.${job.status}`, { defaultValue: job.status })}
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
                          {t("jobs.card.applicantCount", { count: applicantCount, defaultValue_one: "{{count}} applicant", defaultValue_other: "{{count}} applicants" })}
                        </div>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-1)", alignItems: "flex-end" }}>
                        <Button
                          variant="link"
                          className="btn-link-emphasis"
                          onClick={() => navigate(`/candidates?job=${job.id}`)}
                        >
                          {t("jobs.card.viewApplicants", { defaultValue: "View Applicants" })}
                        </Button>
                        <div style={{ display: "flex", gap: "var(--sp-1)" }}>
                          {hasDetails && (
                            <Button
                              variant="link"
                              onClick={() => setExpandedId(isExpanded ? null : job.id)}
                            >
                              {isExpanded ? t("jobs.card.hideDetails", { defaultValue: "Hide Details" }) : t("jobs.card.showDetails", { defaultValue: "Details" })}
                            </Button>
                          )}
                          <Button
                            variant="link"
                            onClick={() => {
                              setEditingJob(job);
                              setModalOpen(true);
                            }}
                          >
                            {t("common.actions.edit", { defaultValue: "Edit" })}
                          </Button>
                          <Button
                            variant="link"
                            className="btn-link-muted"
                            onClick={() => handleDelete(job.id)}
                          >
                            {t("common.actions.delete", { defaultValue: "Delete" })}
                          </Button>
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
                            {t("jobs.card.sections.jobDescription", { defaultValue: "Job Description" })}
                          </div>
                          <p style={{ whiteSpace: "pre-wrap" }}>{job.description}</p>
                        </div>
                      )}
                      {job.requirements?.length > 0 && (
                        <div>
                          <div style={{ fontWeight: "var(--fw-medium)", color: "var(--txt-primary)", marginBottom: "var(--sp-1)" }}>
                            {t("jobs.card.sections.requirements", { defaultValue: "Requirements" })}
                          </div>
                          <ul style={{ margin: 0, paddingLeft: "18px" }}>
                            {job.requirements.map((r, i) => <li key={i}>{r}</li>)}
                          </ul>
                        </div>
                      )}
                      {job.benefits?.length > 0 && (
                        <div>
                          <div style={{ fontWeight: "var(--fw-medium)", color: "var(--txt-primary)", marginBottom: "var(--sp-1)" }}>
                            {t("jobs.card.sections.payBenefits", { defaultValue: "Pay & Benefits" })}
                          </div>
                          <ul style={{ margin: 0, paddingLeft: "18px" }}>
                            {job.benefits.map((b, i) => <li key={i}>{b}</li>)}
                          </ul>
                        </div>
                      )}
                      {job.companyInfo && (
                        <div>
                          <div style={{ fontWeight: "var(--fw-medium)", color: "var(--txt-primary)", marginBottom: "var(--sp-1)" }}>
                            {t("jobs.card.sections.aboutCompany", { defaultValue: "About the Company" })}
                          </div>
                          <p style={{ whiteSpace: "pre-wrap" }}>{job.companyInfo}</p>
                        </div>
                      )}
                      {job.applicationInstructions && (
                        <div>
                          <div style={{ fontWeight: "var(--fw-medium)", color: "var(--txt-primary)", marginBottom: "var(--sp-1)" }}>
                            {t("jobs.card.sections.howToApply", { defaultValue: "How to Apply" })}
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
