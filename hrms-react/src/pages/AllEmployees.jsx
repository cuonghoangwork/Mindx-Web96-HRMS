import { useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "../context/StoreContext";
import FilterModal from "../components/FilterModal";
import SearchBar from "../components/SearchBar";
import Avatar from "../components/Avatar";
import { StatusBadge, TypeBadge } from "../components/Badge";

const EMPLOYEES_PER_PAGE = 10;

const SORTABLE_COLUMNS = [
  { key: "name",        label: "Employee" },
  { key: "employeeId",  label: "ID" },
  { key: "department",  label: "Department" },
  { key: "designation", label: "Designation" },
  { key: "type",        label: "Type" },
  { key: "status",      label: "Status" },
];

/* ─────────────────────────────────────────
   Employee Detail Side Panel
───────────────────────────────────────── */
function SidePanel({ employee, onClose, onDelete, onStatusChange }) {
  if (!employee) return null;

  const fields = [
    { label: "Employee ID", value: employee.employeeId },
    { label: "Department",  value: employee.department },
    { label: "Designation", value: employee.designation },
    { label: "Type",        value: employee.type, render: () => <TypeBadge type={employee.type} /> },
    { label: "Age",         value: employee.age || "—" },
    { label: "Gender",      value: employee.sex || "—" },
    { label: "Email",       value: employee.email || "—" },
    { label: "Phone",       value: employee.phone || "—" },
    { label: "Address",     value: employee.address || "—" },
    { label: "Salary",      value: employee.salary ? `$${employee.salary.toLocaleString()}/yr` : "—" },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.25)",
          backdropFilter: "blur(2px)",
          zIndex: "var(--z-overlay)",
        }}
      />

      {/* Panel */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0,
        width: "min(400px, 100vw)",
        background: "var(--bg-surface)",
        borderLeft: "1px solid var(--bdr-subtle)",
        boxShadow: "var(--shadow-xl)",
        zIndex: "var(--z-modal)",
        display: "flex", flexDirection: "column",
        animation: "slideIn 0.22s ease",
      }}>
        <style>{`
          @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to   { transform: translateX(0);    opacity: 1; }
          }
        `}</style>

        {/* Header */}
        <div style={{
          padding: "var(--sp-5) var(--sp-6)",
          borderBottom: "1px solid var(--bdr-subtle)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <span style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-semibold)", color: "var(--txt-primary)" }}>
            Employee Details
          </span>
          <button
            type="button" onClick={onClose}
            style={{
              width: "32px", height: "32px", border: "1px solid var(--bdr-default)",
              borderRadius: "var(--radius-sm)", background: "transparent",
              cursor: "pointer", fontSize: "18px", color: "var(--txt-secondary)",
              display: "grid", placeItems: "center",
            }}
            aria-label="Close panel"
          >×</button>
        </div>

        {/* Profile */}
        <div style={{
          padding: "var(--sp-6)",
          borderBottom: "1px solid var(--bdr-subtle)",
          display: "flex", alignItems: "center", gap: "var(--sp-4)",
          flexShrink: 0,
        }}>
          <Avatar
            name={employee.name} src={employee.avatar} size="lg"
            status={employee.status === "Active" ? "active" : employee.status === "On Leave" ? "leave" : "terminated"}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "var(--fs-xl)", fontWeight: "var(--fw-semibold)", color: "var(--txt-primary)", marginBottom: "4px" }}>
              {employee.name}
            </div>
            <div style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)", marginBottom: "var(--sp-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {employee.designation} · {employee.department}
            </div>
            <StatusBadge status={employee.status} dot />
          </div>
        </div>

        {/* Fields */}
        <div style={{ flex: 1, overflowY: "auto", padding: "var(--sp-4) var(--sp-6)" }}>
          {fields.map(({ label, value, render }) => (
            <div key={label} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 0", borderBottom: "1px solid var(--bdr-subtle)", gap: "var(--sp-4)",
            }}>
              <span style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", textTransform: "uppercase", letterSpacing: "0.07em", flexShrink: 0 }}>
                {label}
              </span>
              <span style={{ fontSize: "var(--fs-sm)", fontWeight: "var(--fw-medium)", color: "var(--txt-primary)", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis" }}>
                {render ? render() : value}
              </span>
            </div>
          ))}

          {/* Quick status change */}
          <div style={{ marginTop: "var(--sp-5)" }}>
            <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "var(--sp-3)" }}>
              Change Status
            </div>
            <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
              {["Active", "On Leave", "Terminated"].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onStatusChange(employee.id, s)}
                  style={{
                    padding: "6px 14px", borderRadius: "var(--radius-full)",
                    border: `1px solid ${employee.status === s ? "var(--bdr-brand)" : "var(--bdr-default)"}`,
                    background: employee.status === s ? "var(--bg-primary-subtle)" : "transparent",
                    color: employee.status === s ? "var(--txt-primary-brand)" : "var(--txt-secondary)",
                    fontSize: "var(--fs-xs)", fontWeight: "var(--fw-medium)",
                    cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{
          padding: "var(--sp-4) var(--sp-6)",
          borderTop: "1px solid var(--bdr-subtle)",
          display: "flex", gap: "var(--sp-3)",
          flexShrink: 0,
        }}>
          <Link
            to={`/employees/${employee.id}`}
            className="btn btn-primary"
            style={{ flex: 1, justifyContent: "center" }}
            onClick={onClose}
          >
            View Full Profile
          </Link>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => onDelete(employee.id)}
          >
            Delete
          </button>
        </div>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────
   Bulk Action Bar
───────────────────────────────────────── */
function BulkActionBar({ count, onExport, onDelete, onStatusChange, onClear }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "var(--sp-3)",
      padding: "var(--sp-3) var(--sp-4)",
      background: "var(--bg-primary-subtle)",
      border: "1px solid var(--bdr-brand)",
      borderRadius: "var(--radius-md)",
      marginBottom: "var(--sp-4)",
      flexWrap: "wrap",
    }}>
      <span style={{ fontSize: "var(--fs-sm)", fontWeight: "var(--fw-medium)", color: "var(--txt-primary-brand)", marginRight: "var(--sp-2)" }}>
        {count} selected
      </span>

      <button type="button" className="btn btn-secondary btn-sm" onClick={onExport}>
        ↓ Export CSV
      </button>

      <div style={{ display: "flex", gap: "var(--sp-2)", alignItems: "center" }}>
        <span style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)" }}>Set status:</span>
        {["Active", "On Leave", "Terminated"].map((s) => (
          <button key={s} type="button" className="btn btn-secondary btn-sm" onClick={() => onStatusChange(s)}>
            {s}
          </button>
        ))}
      </div>

      <button type="button" className="btn btn-danger btn-sm" onClick={onDelete}
        style={{ marginLeft: "auto" }}>
        Delete selected
      </button>

      <button
        type="button" onClick={onClear}
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: "var(--txt-secondary)", fontSize: "18px", lineHeight: 1,
          padding: "2px 4px",
        }}
        aria-label="Clear selection"
      >×</button>
    </div>
  );
}

/* ═══════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════ */
function AllEmployees() {
  const navigate = useNavigate();
  const {
    employees, removeEmployee, updateEmployee,
    modals, openModal, closeModal,
    filters, setSearchFilter, clearFilters,
  } = useStore();

  const [currentPage, setCurrentPage]   = useState(1);
  const [sortField, setSortField]       = useState("name");
  const [sortOrder, setSortOrder]       = useState("asc");
  const [selectedIds, setSelectedIds]   = useState(new Set());
  const [panelEmployee, setPanelEmployee] = useState(null);

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
    if (!confirm(`Delete ${selectedIds.size} employee(s)?`)) return;
    selectedIds.forEach((id) => removeEmployee(id));
    clearSelection();
  };

  const handleBulkStatus = (status) => {
    selectedIds.forEach((id) => updateEmployee(id, { status }));
    clearSelection();
  };

  const handleBulkExport = () => {
    const rows = employees
      .filter((e) => selectedIds.has(e.id))
      .map((e) => `${e.name},${e.employeeId},${e.department},${e.designation},${e.type},${e.status},${e.salary || ""}`);
    const csv = ["Name,Employee ID,Department,Designation,Type,Status,Salary", ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a"); a.href = url; a.download = "employees.csv"; a.click();
    URL.revokeObjectURL(url);
    clearSelection();
  };

  /* ── Single row actions ── */
  const handleDelete = (id) => {
    if (!confirm("Delete this employee?")) return;
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
      <div className="content-card">

        {/* ── Toolbar ── */}
        <div className="toolbar">
          <SearchBar
            value={filters.search}
            onSearch={handleSearch}
            placeholder="Search by name, employee ID, department..."
          />
          <button type="button" className="btn btn-secondary toolbar-filter-btn"
            onClick={() => openModal("filter")}>
            Filter
            {hasActiveFilters && <span className="toolbar-filter-dot" />}
          </button>
          <button type="button" className="btn btn-secondary"
            onClick={handleReset} disabled={!hasActiveSearchOrFilters}>
            Reset
          </button>
          <Link to="/employees/add" className="btn btn-primary" style={{ marginLeft: "auto" }}>
            + Add Employee
          </Link>
        </div>

        {/* ── Bulk action bar ── */}
        {someSelected && (
          <BulkActionBar
            count={selectedIds.size}
            onExport={handleBulkExport}
            onDelete={handleBulkDelete}
            onStatusChange={handleBulkStatus}
            onClear={clearSelection}
          />
        )}

        {/* ── Table ── */}
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {/* Select-all checkbox */}
                <th style={{ width: "40px", textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={togglePage}
                    style={{ cursor: "pointer", width: "15px", height: "15px" }}
                    aria-label="Select all on this page"
                  />
                </th>
                {SORTABLE_COLUMNS.map((col) => (
                  <SortableHeader
                    key={col.key} label={col.label} field={col.key}
                    sortField={sortField} sortOrder={sortOrder} onSort={handleSort}
                  />
                ))}
                <th>Action</th>
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
                    <td style={{ textAlign: "center" }} onClick={(e) => toggleOne(employee.id, e)}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        style={{ cursor: "pointer", width: "15px", height: "15px" }}
                        aria-label={`Select ${employee.name}`}
                      />
                    </td>

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
                    <td><TypeBadge type={employee.type} size="sm" /></td>
                    <td><StatusBadge status={employee.status} dot /></td>

                    {/* Actions */}
                    <td onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={(e) => openPanel(employee, e)}
                      >
                        Details
                      </button>
                      <Link
                        to={`/employees/${employee.id}`}
                        className="btn btn-secondary btn-sm"
                        style={{ marginLeft: "6px" }}
                      >
                        Edit
                      </Link>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        style={{ marginLeft: "6px" }}
                        onClick={() => handleDelete(employee.id)}
                      >
                        ✕
                      </button>
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
            <div className="empty-state-icon">🔍</div>
            <h3 className="empty-state-title">No employees found</h3>
            <p className="empty-state-description">
              {hasActiveSearchOrFilters
                ? "Try adjusting your search or filters."
                : "Get started by adding your first employee."}
            </p>
            {hasActiveSearchOrFilters && (
              <button type="button" className="btn btn-secondary" onClick={handleReset}>
                Clear filters
              </button>
            )}
            {!hasActiveSearchOrFilters && (
              <Link to="/employees/add" className="btn btn-primary">+ Add Employee</Link>
            )}
          </div>
        )}

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div className="pagination">
            <div className="pagination-info">
              Showing {startIndex + 1}–{Math.min(startIndex + EMPLOYEES_PER_PAGE, sortedEmployees.length)} of {sortedEmployees.length} employees
              {sortedEmployees.length !== employees.length && (
                <span style={{ color: "var(--txt-secondary)", marginLeft: "8px" }}>
                  (filtered from {employees.length})
                </span>
              )}
              {someSelected && (
                <span style={{ color: "var(--txt-primary-brand)", marginLeft: "8px", fontWeight: "var(--fw-medium)" }}>
                  · {selectedIds.size} selected
                </span>
              )}
            </div>
            <div className="pagination-controls">
              <button className="page-btn" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>‹</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button key={page} className={`page-btn ${currentPage === page ? "active" : ""}`} onClick={() => setCurrentPage(page)}>
                  {page}
                </button>
              ))}
              <button className="page-btn" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>›</button>
            </div>
          </div>
        )}

        {modals.filter && <FilterModal onClose={() => closeModal("filter")} />}
      </div>

      {/* ── Side panel ── */}
      {panelEmployee && (
        <SidePanel
          employee={employees.find((e) => e.id === panelEmployee.id) ?? panelEmployee}
          onClose={() => setPanelEmployee(null)}
          onDelete={handleDelete}
          onStatusChange={handleStatusChange}
        />
      )}
    </>
  );
}

/* ─── Sortable column header ─── */
function SortableHeader({ label, field, sortField, sortOrder, onSort }) {
  const isActive = sortField === field;
  return (
    <th className="sortable-header" onClick={() => onSort(field)} title={`Sort by ${label}`}>
      {label}
      {isActive && (
        <span className="sort-indicator" aria-hidden="true">{sortOrder === "asc" ? " ▲" : " ▼"}</span>
      )}
    </th>
  );
}

export default AllEmployees;
