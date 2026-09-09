import { useState, useCallback, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import { PromotionRequestsAPI, ProfileEditRequestsAPI } from "../api";
import FilterModal from "../components/FilterModal";
import SearchBar from "../components/SearchBar";
import Avatar from "../components/Avatar";
import { StatusBadge, TypeBadge } from "../components/Badge";
import Button from "../components/Button";
import ProposePromotionModal from "../components/ProposePromotionModal";
import { SidePanel } from './all-employees/SidePanel'
import { BulkActionBar } from './all-employees/BulkActionBar'
import { PendingPromotionsPanel } from './all-employees/PendingPromotionsPanel'
import { EditRequestsPanel } from './all-employees/EditRequestsPanel'

const EMPLOYEES_PER_PAGE = 10;

const SORTABLE_COLUMNS = [
  { key: "name",        labelKey: "common.columns.employee",   defaultLabel: "Employee" },
  { key: "employeeId",  labelKey: "common.columns.id",         defaultLabel: "ID" },
  { key: "department",  labelKey: "common.fieldLabels.department", defaultLabel: "Department" },
  { key: "designation", labelKey: "common.columns.designation", defaultLabel: "Designation" },
  { key: "type",        labelKey: "common.columns.type",       defaultLabel: "Type" },
  { key: "status",      labelKey: "common.columns.status",     defaultLabel: "Status" },
];

/* ═══════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════ */
function AllEmployees() {
  const { t } = useTranslation();
  const { isAdmin, isHRTier, isManagerTier, isManager } = useAuth();
  // Plain MANAGER (not HR/Admin) gets this page as a read-only company-wide
  // "Directory" (see employeeController.getAll — read is unscoped for
  // everyone; only writes are department-scoped/HR-gated). Bulk actions and
  // Promote live on "My Department" instead (departmentController.getDetail,
  // routed via /departments/me), so they're hidden here for this role only.
  const isPlainManager = isManager && !isHRTier;
  // Plain EMPLOYEE (App.jsx now opens this route to every role, matching
  // the design's company-wide "Directory" for Employee too) gets the same
  // read-only treatment as isPlainManager, plus Salary is hidden on a
  // colleague's card — employeeController.getDetail already blocks
  // EMPLOYEE from fetching another employee's single record, so the list's
  // in-memory salary field shouldn't be surfaced here either.
  const isPlainEmployee = !isManager && !isHRTier;
  const {
    employees, departments, removeEmployee, updateEmployee,
    modals, openModal, closeModal,
    filters, setSearchFilter, clearFilters,
  } = useStore();

  const [currentPage, setCurrentPage]   = useState(1);
  const [sortField, setSortField]       = useState("name");
  const [sortOrder, setSortOrder]       = useState("asc");
  const [selectedIds, setSelectedIds]   = useState(new Set());
  const [panelEmployee, setPanelEmployee] = useState(null);
  const [promotingEmployee, setPromotingEmployee] = useState(null);

  /* ── Roster / Edit requests tabs — real data via PromotionRequestsAPI /
     ProfileEditRequestsAPI. Promotion review is ADMIN-only (see
     promotionRequestRouter.js), so that banner stays isAdmin-gated. Profile
     edit request review is MANAGER (own department)/HR/ADMIN
     (profileEditRequestRouter.js), so the Edit-requests tab is gated by
     isManagerTier instead — Manager sees requests scoped to their own
     department automatically (utils/reviewQueue.js). ── */
  // Lets a "Profile edit request" notification deep-link straight to this
  // tab (/employees?tab=editRequests) instead of just landing on Roster.
  // activeTab is derived from the query string rather than its own
  // useState (same reasoning as ViewEmployee.jsx's activeTab): navigating
  // sidebar link -> sidebar link stays on this same route, so a plain
  // useState initializer would only resolve on first mount and never pick
  // up a later ?tab= change.
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") === "editRequests" ? "editRequests" : "roster";
  const setActiveTab = (key) => {
    setSearchParams(key === "editRequests" ? { tab: key } : {}, { replace: true });
  };
  const [pendingPromotions, setPendingPromotions] = useState([]);
  const [pendingEditCount, setPendingEditCount] = useState(0);

  const loadPendingPromotions = useCallback(() => {
    if (!isAdmin) return;
    PromotionRequestsAPI.list({ status: "pending" })
      .then((res) => setPendingPromotions(res.items || []))
      .catch(() => {});
  }, [isAdmin]);

  // Lightweight count for the tab badge — the panel itself owns the full
  // filtered/paginated request list once it's open.
  const loadPendingEditCount = useCallback(() => {
    if (!isManagerTier) return;
    ProfileEditRequestsAPI.list({ status: "pending" })
      .then((res) => setPendingEditCount((res.items || []).length))
      .catch(() => {});
  }, [isManagerTier]);

  useEffect(() => { loadPendingPromotions(); }, [loadPendingPromotions]);
  useEffect(() => { loadPendingEditCount(); }, [loadPendingEditCount]);

  const handlePromotionReview = async (id, decision) => {
    try {
      await PromotionRequestsAPI.review(id, decision);
      loadPendingPromotions();
    } catch { /* surfaced via the request staying in the pending list */ }
  };

  /* ── Filter ── */
  const filteredEmployees = employees.filter((emp) => {
    const search = filters.search.toLowerCase();
    const matchesSearch =
      !filters.search ||
      emp.name.toLowerCase().includes(search) ||
      emp.employeeId.toLowerCase().includes(search) ||
      emp.department.toLowerCase().includes(search);
    const matchesDepartment =
      !filters.department || filters.department === "" ||
      filters.department.split(",").includes(emp.department);
    const matchesType =
      !filters.type || filters.type === "all" || emp.type === filters.type;
    return matchesSearch && matchesDepartment && matchesType;
  });

  /* ── Sort ── */
  const handleSort = (field) => {
    if (sortField === field) setSortOrder((p) => (p === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortOrder("asc"); }
    setCurrentPage(1);
  };

  const sortedEmployees = [...filteredEmployees].sort((a, b) => {
    const valA = String(a[sortField] ?? "").toLowerCase();
    const valB = String(b[sortField] ?? "").toLowerCase();
    return sortOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
  });

  /* ── Pagination ── */
  const totalPages    = Math.ceil(sortedEmployees.length / EMPLOYEES_PER_PAGE);
  const startIndex    = (currentPage - 1) * EMPLOYEES_PER_PAGE;
  const paginated     = sortedEmployees.slice(startIndex, startIndex + EMPLOYEES_PER_PAGE);
  const pageIds       = paginated.map((e) => e.id);

  /* ── Selection ── */
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const someSelected    = selectedIds.size > 0;

  const toggleOne = useCallback((id, e) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const togglePage = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageIds.forEach((id) => next.delete(id));
      else                  pageIds.forEach((id) => next.add(id));
      return next;
    });
  }, [allPageSelected, pageIds]);

  const clearSelection = () => setSelectedIds(new Set());

  /* ── Bulk actions ── */
  const handleBulkDelete = () => {
    if (!confirm(t("common.confirmDeleteEmployees", { defaultValue: "Delete {{count}} employee(s)?", count: selectedIds.size }))) return;
    selectedIds.forEach((id) => removeEmployee(id));
    clearSelection();
  };

  const handleBulkStatus = (status) => {
    selectedIds.forEach((id) => updateEmployee(id, { status }));
    clearSelection();
  };

  // Salary column is dropped from both exports for a plain EMPLOYEE — same
  // reasoning as SidePanel's canSeeSalary above.
  const csvHeader = isManagerTier
    ? "Name,Employee ID,Department,Designation,Type,Status,Salary"
    : "Name,Employee ID,Department,Designation,Type,Status";
  const toCsvRow = (e) => {
    const base = `${e.name},${e.employeeId},${e.department},${e.designation},${e.type},${e.status}`;
    return isManagerTier ? `${base},${e.salary || ""}` : base;
  };

  const handleBulkExport = () => {
    const rows = employees.filter((e) => selectedIds.has(e.id)).map(toCsvRow);
    const csv = [csvHeader, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a"); a.href = url; a.download = "employees.csv"; a.click();
    URL.revokeObjectURL(url);
    clearSelection();
  };

  const handleExportAll = () => {
    const rows = sortedEmployees.map(toCsvRow);
    const csv = [csvHeader, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a"); a.href = url; a.download = "employees.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  /* ── Single row actions ── */
  const handleDelete = (id) => {
    const emp = employees.find((e) => e.id === id);
    if (!confirm(t("common.confirmDeleteEmployee", { defaultValue: "Delete {{name}}? This cannot be undone.", name: emp?.name }))) return;
    removeEmployee(id);
    if (panelEmployee?.id === id) setPanelEmployee(null);
    setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
  };

  const handleStatusChange = (id, status) => {
    updateEmployee(id, { status });
    if (panelEmployee?.id === id)
      setPanelEmployee((prev) => ({ ...prev, status }));
  };

  /* ── Other helpers ── */
  const hasActiveFilters = filters.department || filters.type !== "all";
  const hasActiveSearchOrFilters = Boolean(filters.search) || hasActiveFilters;

  const handleSearch = (value) => { setSearchFilter(value); setCurrentPage(1); };
  const handleReset  = () => { clearFilters(); setCurrentPage(1); };

  const openPanel = (emp, e) => {
    e.stopPropagation();
    setPanelEmployee(emp);
  };

  return (
    <>
      {/* ── Roster / Edit requests toggle ── */}
      {isManagerTier && (
        <div style={{ display: "flex", gap: "var(--sp-1)", padding: "3px", background: "var(--bg-surface-alt)", borderRadius: "var(--radius-sm)", marginBottom: "var(--sp-5)", width: "fit-content" }}>
          {[["roster", t("employees.allEmployees.rosterTab", { defaultValue: "Roster" })], ["editRequests", t("employees.allEmployees.editRequestsTab", { defaultValue: "Edit requests ({{count}})", count: pendingEditCount })]].map(([v, label]) => (
            <button key={v} type="button" onClick={() => setActiveTab(v)} style={{
              padding: "5px 14px", borderRadius: "0", border: "none",
              background: activeTab === v ? "var(--bg-surface)" : "transparent",
              color: activeTab === v ? "var(--txt-primary)" : "var(--txt-secondary)",
              fontFamily: "var(--font-family)", fontSize: "var(--fs-sm)", cursor: "pointer",
              fontWeight: activeTab === v ? "var(--fw-medium)" : "var(--fw-regular)",
            }}>
              {label}
            </button>
          ))}
        </div>
      )}

      {isManagerTier && activeTab === "editRequests" ? (
        <EditRequestsPanel onChanged={loadPendingEditCount} />
      ) : (
      <>
      {isAdmin && (
        <PendingPromotionsPanel requests={pendingPromotions} onReview={handlePromotionReview} />
      )}
      <div className="content-card">

        {/* ── Toolbar ── */}
        <div className="toolbar">
          <Button
            variant="secondary"
            onClick={() => openModal("filter")}
            className="toolbar-filter-btn"
          >
            {t("employees.allEmployees.toolbar.filter", { defaultValue: "Filter" })}
            {hasActiveFilters && <span className="toolbar-filter-dot" />}
          </Button>
          <SearchBar
            value={filters.search}
            onSearch={handleSearch}
            placeholder={t("employees.allEmployees.toolbar.searchPlaceholder", { defaultValue: "Search by name, employee ID, department..." })}
          />
          <Button
            variant="secondary"
            onClick={handleReset}
            disabled={!hasActiveSearchOrFilters}
          >
            {t("employees.allEmployees.toolbar.reset", { defaultValue: "Reset" })}
          </Button>
          {isHRTier && (
            <Link to="/employees/add" className="btn btn-primary" style={{ marginLeft: "auto" }}>
              + {t("sideMenu.addEmployee", { defaultValue: "Add Employee" })}
            </Link>
          )}
          <Button variant="secondary" onClick={handleExportAll} style={isHRTier ? undefined : { marginLeft: "auto" }}>
            {t("employees.allEmployees.toolbar.exportCsv", { defaultValue: "Export CSV" })}
          </Button>
        </div>

        {/* ── Bulk action bar ── */}
        {someSelected && (
          <BulkActionBar
            count={selectedIds.size}
            onExport={handleBulkExport}
            onDelete={handleBulkDelete}
            onStatusChange={handleBulkStatus}
            onClear={clearSelection}
            canDelete={isAdmin}
          />
        )}

        {/* ── Table ── */}
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {/* Select-all checkbox — hidden for plain MANAGER (Directory
                    is read-only for that role; bulk actions live on "My
                    Department" instead). */}
                {!isPlainManager && !isPlainEmployee && (
                  <th style={{ width: "40px", textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={togglePage}
                      style={{ cursor: "pointer", width: "15px", height: "15px" }}
                      aria-label={t("employees.allEmployees.table.selectAllAria", { defaultValue: "Select all on this page" })}
                    />
                  </th>
                )}
                {SORTABLE_COLUMNS.map((col) => (
                  <SortableHeader
                    key={col.key} label={t(col.labelKey, { defaultValue: col.defaultLabel })} field={col.key}
                    sortField={sortField} sortOrder={sortOrder} onSort={handleSort}
                  />
                ))}
                <th>{t("common.columns.action", { defaultValue: "Action" })}</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((employee) => {
                const isSelected = selectedIds.has(employee.id);
                return (
                  <tr
                    key={employee.id}
                    className="employee-row-clickable"
                    onClick={(e) => openPanel(employee, e)}
                    style={{ background: isSelected ? "var(--bg-primary-subtle)" : undefined }}
                  >
                    {/* Checkbox */}
                    {!isPlainManager && !isPlainEmployee && (
                      <td style={{ textAlign: "center" }} onClick={(e) => toggleOne(employee.id, e)}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          style={{ cursor: "pointer", width: "15px", height: "15px" }}
                          aria-label={t("employees.allEmployees.table.selectRowAria", { defaultValue: "Select {{name}}", name: employee.name })}
                        />
                      </td>
                    )}

                    {/* Name */}
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <Avatar name={employee.name} src={employee.avatar} size="sm" />
                        <div>
                          <div className="employee-row-name">{employee.name}</div>
                          <div style={{ fontSize: "var(--fs-2xs)", color: "var(--txt-secondary)" }}>
                            {employee.employeeId}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)" }}>{employee.employeeId}</td>
                    <td>{employee.department}</td>
                    <td style={{ color: "var(--txt-secondary)", fontSize: "var(--fs-sm)" }}>{employee.designation}</td>
                    <td><TypeBadge type={employee.type} /></td>
                    <td><StatusBadge status={employee.status} /></td>

                    {/* Actions — plain text links, matching the mockup's
                        row-action style (no bordered button boxes). */}
                    <td onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="link"
                        onClick={(e) => openPanel(employee, e)}
                      >
                        {t("employees.allEmployees.table.details", { defaultValue: "Details" })}
                      </Button>
                      {/* Promote is scoped to the reviewer's own department
                          server-side, so it's hidden here for plain MANAGER
                          — Directory is unscoped/company-wide, and Promote
                          would 403 on most rows. Manager proposes promotions
                          from "My Department" instead. */}
                      {isManagerTier && !isPlainManager && (
                        <Button
                          variant="link"
                          onClick={() => setPromotingEmployee(employee)}
                        >
                          {t("employees.allEmployees.table.promote", { defaultValue: "Promote" })}
                        </Button>
                      )}
                      {isAdmin && (
                        <Button
                          variant="link"
                          className="btn-link-muted"
                          aria-label={t("employees.allEmployees.table.deleteAria", { defaultValue: "Delete employee" })}
                          onClick={() => handleDelete(employee.id)}
                        >
                          {t("common.actions.delete", { defaultValue: "Delete" })}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Empty state ── */}
        {filteredEmployees.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--txt-disabled)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </div>
            <h3 className="empty-state-title">{t("employees.allEmployees.emptyState.title", { defaultValue: "No employees found" })}</h3>
            <p className="empty-state-description">
              {hasActiveSearchOrFilters
                ? t("employees.allEmployees.emptyState.tryAdjusting", { defaultValue: "Try adjusting your search or filters." })
                : t("employees.allEmployees.emptyState.getStarted", { defaultValue: "Get started by adding your first employee." })}
            </p>
            {hasActiveSearchOrFilters && (
              <Button variant="secondary" onClick={handleReset}>
                {t("employees.allEmployees.emptyState.clearFilters", { defaultValue: "Clear filters" })}
              </Button>
            )}
            {!hasActiveSearchOrFilters && isHRTier && (
              <Link to="/employees/add" className="btn btn-primary">+ {t("sideMenu.addEmployee", { defaultValue: "Add Employee" })}</Link>
            )}
          </div>
        )}

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div className="pagination">
            <div className="pagination-info">
              {t("employees.allEmployees.pagination.showing", { defaultValue: "Showing {{start}}–{{end}} of {{total}} employees", start: startIndex + 1, end: Math.min(startIndex + EMPLOYEES_PER_PAGE, sortedEmployees.length), total: sortedEmployees.length })}
              {sortedEmployees.length !== employees.length && (
                <span style={{ color: "var(--txt-secondary)", marginLeft: "8px" }}>
                  {t("employees.allEmployees.pagination.filteredFrom", { defaultValue: "(filtered from {{total}})", total: employees.length })}
                </span>
              )}
              {someSelected && (
                <span style={{ color: "var(--txt-primary-brand)", marginLeft: "8px", fontWeight: "var(--fw-medium)" }}>
                  {t("employees.allEmployees.pagination.selectedSuffix", { defaultValue: "· {{count}} selected", count: selectedIds.size })}
                </span>
              )}
            </div>
            <div className="pagination-controls">
              <Button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="page-btn">‹</Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button key={page} className={`page-btn ${currentPage === page ? "active" : ""}`} onClick={() => setCurrentPage(page)}>
                  {page}
                </button>
              ))}
              <Button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="page-btn">›</Button>
            </div>
          </div>
        )}

        {modals.filter && <FilterModal onClose={() => closeModal("filter")} />}
      </div>
      </>
      )}

      {/* ── Side panel ── */}
      {panelEmployee && (
        <SidePanel
          employee={employees.find((e) => e.id === panelEmployee.id) ?? panelEmployee}
          onClose={() => setPanelEmployee(null)}
          onDelete={handleDelete}
          onStatusChange={handleStatusChange}
          canSeeSalary={isManagerTier}
        />
      )}

      {/* ── Propose a promotion ── */}
      {promotingEmployee && (
        <ProposePromotionModal
          employee={promotingEmployee}
          employees={employees}
          departments={departments}
          onClose={() => setPromotingEmployee(null)}
          onSubmitted={loadPendingPromotions}
        />
      )}
    </>
  );
}

/* ─── Sortable column header ─── */
function SortableHeader({ label, field, sortField, sortOrder, onSort }) {
  const { t } = useTranslation();
  const isActive = sortField === field;
  return (
    <th className="sortable-header" onClick={() => onSort(field)} title={t("employees.allEmployees.sortBy", { defaultValue: "Sort by {{label}}", label })}>
      {label}
      {isActive && (
        <span className="sort-indicator" aria-hidden="true">{sortOrder === "asc" ? " ▲" : " ▼"}</span>
      )}
    </th>
  );
}

export default AllEmployees;
