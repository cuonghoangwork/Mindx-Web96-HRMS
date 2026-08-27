import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useStore } from "../context/StoreContext";

/**
 * GlobalSearch — topbar quick-search across Employees, Candidates, and
 * Jobs, matching the mockup's globalSearchWrapStyle/globalSearchDropdownStyle
 * (admin-only, per the mockup's `isAdminRole` gate on this element).
 *
 * Client-side filter over data already loaded in StoreContext — no new
 * API calls. Employees deep-link to their real detail route; Candidates
 * and Jobs don't have dedicated detail routes today (they open as a
 * side panel from within their list page), so those results link to
 * the list page rather than faking a deep link that doesn't exist.
 */
function GlobalSearch() {
  const { t } = useTranslation();
  const { employees, candidates, jobs, getJobById } = useStore();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const blurTimeout = useRef(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const employeeResults = employees
      .filter((e) => e.name?.toLowerCase().includes(q))
      .slice(0, 4)
      .map((e) => ({
        key: `e${e.id}`,
        kind: t("globalSearch.kind.employee", { defaultValue: "Employee" }),
        label: e.name,
        sub: [e.designation, e.department].filter(Boolean).join(" · "),
        onSelect: () => navigate(`/employees/${e.id}`),
      }));

    const candidateResults = candidates
      .filter((c) => c.name?.toLowerCase().includes(q))
      .slice(0, 4)
      .map((c) => ({
        key: `c${c.id}`,
        kind: t("globalSearch.kind.candidate", { defaultValue: "Candidate" }),
        label: c.name,
        sub: getJobById(c.jobId)?.title || t("globalSearch.kind.candidate", { defaultValue: "Candidate" }),
        onSelect: () => navigate("/candidates"),
      }));

    const jobResults = jobs
      .filter((j) => j.title?.toLowerCase().includes(q))
      .slice(0, 4)
      .map((j) => ({
        key: `j${j.id}`,
        kind: t("globalSearch.kind.job", { defaultValue: "Job" }),
        label: j.title,
        sub: [j.department, j.status ? t(`common.jobStatus.${j.status}`, { defaultValue: j.status }) : null].filter(Boolean).join(" · "),
        onSelect: () => navigate("/jobs"),
      }));

    return [...employeeResults, ...candidateResults, ...jobResults].slice(0, 8);
  }, [query, employees, candidates, jobs, getJobById, navigate, t]);

  const showDropdown = open && query.trim().length > 0;

  return (
    <div className="global-search-wrap">
      <input
        type="text"
        className="global-search-input"
        placeholder={t("globalSearch.placeholder", { defaultValue: "Search employees, candidates, jobs..." })}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // small delay so the click on a result registers before blur closes it
          blurTimeout.current = setTimeout(() => setOpen(false), 150);
        }}
      />
      {showDropdown && (
        <div className="global-search-dropdown">
          {results.length === 0 ? (
            <div className="global-search-empty">{t("globalSearch.noMatches", { defaultValue: "No matches" })}</div>
          ) : (
            results.map((r) => (
              <div
                key={r.key}
                className="global-search-result-item"
                onMouseDown={(e) => {
                  e.preventDefault();
                  clearTimeout(blurTimeout.current);
                  r.onSelect();
                  setQuery("");
                  setOpen(false);
                }}
              >
                <span className="global-search-kind-tag">{r.kind}</span>
                <div className="global-search-result-text">
                  <div className="global-search-result-label">{r.label}</div>
                  <div className="global-search-result-sub">{r.sub}</div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default GlobalSearch;
