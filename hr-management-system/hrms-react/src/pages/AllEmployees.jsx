import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "../context/StoreContext";
import FilterModal from "../components/FilterModal";
import SearchBar from "../components/SearchBar";
import Avatar from "../components/Avatar";
import { StatusBadge } from "../components/Badge";

const EMPLOYEES_PER_PAGE = 10;

const SORTABLE_COLUMNS = [
  { key: "name", label: "Employee Name" },
  { key: "employeeId", label: "Employee ID" },
  { key: "department", label: "Department" },
  { key: "designation", label: "Designation" },
  { key: "type", label: "Type" },
  { key: "status", label: "Status" },
];

function AllEmployees() {
  const navigate = useNavigate();
  const {
    employees,
    removeEmployee,
    modals,
    openModal,
    closeModal,
    filters,
    setSearchFilter,
    clearFilters,
  } = useStore();

  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState("name");
  const [sortOrder, setSortOrder] = useState("asc");

  // Filter employees with all criteria
  const filteredEmployees = employees.filter((emp) => {
    const search = filters.search.toLowerCase();
    const matchesSearch =
      !filters.search ||
      emp.name.toLowerCase().includes(search) ||
      emp.employeeId.toLowerCase().includes(search) ||
      emp.department.toLowerCase().includes(search);

    // Department filter (comma-separated list)
    const matchesDepartment =
      !filters.department ||
      filters.department === "" ||
      filters.department.split(",").includes(emp.department);

    // Type filter
    const matchesType =
      !filters.type || filters.type === "all" || emp.type === filters.type;

    return matchesSearch && matchesDepartment && matchesType;
  });

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
    setCurrentPage(1);
  };

  const sortedEmployees = [...filteredEmployees].sort((a, b) => {
    const valA = String(a[sortField] ?? "").toLowerCase();
    const valB = String(b[sortField] ?? "").toLowerCase();
    const cmp = valA.localeCompare(valB);
    return sortOrder === "asc" ? cmp : -cmp;
  });

  // Pagination
  const totalPages = Math.ceil(sortedEmployees.length / EMPLOYEES_PER_PAGE);
  const startIndex = (currentPage - 1) * EMPLOYEES_PER_PAGE;
  const paginatedEmployees = sortedEmployees.slice(
    startIndex,
    startIndex + EMPLOYEES_PER_PAGE,
  );

  const hasActiveFilters = filters.department || filters.type !== "all";
  const hasActiveSearchOrFilters = Boolean(filters.search) || hasActiveFilters;

  const handleSearch = (value) => {
    setSearchFilter(value);
    setCurrentPage(1);
  };

  const handleReset = () => {
    clearFilters();
    setCurrentPage(1);
  };

  const handleDelete = (id) => {
    if (confirm("Are you sure you want to delete this employee?")) {
      removeEmployee(id);
    }
  };

  return (
    <div className="content-card">
      <div className="toolbar">
        <SearchBar
          value={filters.search}
          onSearch={handleSearch}
          placeholder="Search by name, employee ID, department..."
        />
        <button
          type="button"
          className="btn btn-secondary toolbar-filter-btn"
          onClick={() => openModal("filter")}
        >
          Filter
          {hasActiveFilters && <span className="toolbar-filter-dot" />}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleReset}
          disabled={!hasActiveSearchOrFilters}
          title="Reset search and filters"
        >
          Reset
        </button>
        <Link to="/employees/add" className="btn btn-primary">
          + Add Employee
        </Link>
      </div>

      <table className="data-table">
        <thead>
          <tr>
            {SORTABLE_COLUMNS.map((col) => (
              <SortableHeader
                key={col.key}
                label={col.label}
                field={col.key}
                sortField={sortField}
                sortOrder={sortOrder}
                onSort={handleSort}
              />
            ))}
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {paginatedEmployees.map((employee) => (
            <tr
              key={employee.id}
              className="employee-row-clickable"
              onClick={() => navigate(`/employees/${employee.id}`)}
            >
              <td>
                <div
                  style={{ display: "flex", alignItems: "center", gap: "12px" }}
                >
                  <Avatar name={employee.name} size="sm" />
                  <span className="employee-row-name">{employee.name}</span>
                </div>
              </td>
              <td>{employee.employeeId}</td>
              <td>{employee.department}</td>
              <td>{employee.designation}</td>
              <td>{employee.type}</td>
              <td>
                <StatusBadge status={employee.status} dot />
              </td>
              <td onClick={(e) => e.stopPropagation()}>
                <Link
                  to={`/employees/${employee.id}`}
                  className="btn btn-secondary"
                  style={{ padding: "8px 16px", fontSize: "12px" }}
                >
                  View
                </Link>
                <button
                  className="btn btn-secondary"
                  style={{
                    padding: "8px 16px",
                    fontSize: "12px",
                    marginLeft: "8px",
                  }}
                  onClick={() => handleDelete(employee.id)}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {filteredEmployees.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">🔍</div>
          <h3 className="empty-state-title">No employees found</h3>
          <p className="empty-state-description">
            {hasActiveSearchOrFilters
              ? "Try adjusting your search or filters to find what you're looking for."
              : "Get started by adding your first employee to the system."}
          </p>
          {hasActiveSearchOrFilters && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleReset}
            >
              Clear filters
            </button>
          )}
          {!hasActiveSearchOrFilters && (
            <Link to="/employees/add" className="btn btn-primary">
              + Add Employee
            </Link>
          )}
        </div>
      )}

      {totalPages > 0 && (
        <div className="pagination">
          <div className="pagination-info">
            Showing {startIndex + 1}-
            {Math.min(startIndex + EMPLOYEES_PER_PAGE, sortedEmployees.length)}{" "}
            of {sortedEmployees.length} employees
            {sortedEmployees.length !== employees.length && (
              <span style={{ color: "var(--text-muted)", marginLeft: "8px" }}>
                (filtered from {employees.length})
              </span>
            )}
          </div>
          <div className="pagination-controls">
            <button
              className="page-btn"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              style={{ opacity: currentPage === 1 ? 0.5 : 1 }}
            >
              ‹
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                className={`page-btn ${currentPage === page ? "active" : ""}`}
                onClick={() => setCurrentPage(page)}
              >
                {page}
              </button>
            ))}
            <button
              className="page-btn"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              style={{ opacity: currentPage === totalPages ? 0.5 : 1 }}
            >
              ›
            </button>
          </div>
        </div>
      )}

      {modals.filter && <FilterModal onClose={() => closeModal("filter")} />}
    </div>
  );
}

function SortableHeader({ label, field, sortField, sortOrder, onSort }) {
  const isActive = sortField === field;

  return (
    <th
      className="sortable-header"
      onClick={() => onSort(field)}
      title={`Sort by ${label}`}
    >
      {label}
      {isActive && (
        <span className="sort-indicator" aria-hidden="true">
          {sortOrder === "asc" ? " ▲" : " ▼"}
        </span>
      )}
    </th>
  );
}

export default AllEmployees;
