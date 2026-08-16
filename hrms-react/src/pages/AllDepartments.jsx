import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { formatDate } from "../utils/format";
import AddDepartmentModal from "../components/AddDepartmentModal";
import Avatar from "../components/Avatar";
import { StatusBadge, TypeBadge } from "../components/Badge";
import Button from "../components/Button";

// Mockup's department badge is 2 letters, but not the same rule as people's
// initials (Avatar's getInitials takes one letter per word, so a one-word
// department like "Engineering" would just be "E"). Department names are
// often a single word, so this takes the first two letters of a one-word
// name and falls back to per-word initials for multi-word names.
function deptInitials(name = "") {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (name.slice(0, 2) || "??").toUpperCase();
}

function formatBudget(amount) {
  if (!amount) return "$0";
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
  return `$${amount}`;
}

function AllDepartments() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  // employeeController.remove is ADMIN-only (employeeRouter.js) — this page
  // itself is HR/Admin-only, but an HR (non-admin) viewer would otherwise
  // see a Delete button that always 403s on click.
  const { isAdmin } = useAuth();
  const {
    departments, employees, removeEmployee,
    updateDepartmentBudget, updateDepartmentManager,
    getEmployeesByDepartment, getEmployeeCountByDepartment,
  } = useStore();

  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedName, setSelectedName] = useState(null);
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetValue, setBudgetValue] = useState("");

  const departmentsWithCounts = useMemo(
    () =>
      departments
        .map((dept) => ({ ...dept, headcount: getEmployeeCountByDepartment(dept.name) }))
        .sort((a, b) => b.headcount - a.headcount),
    [departments, getEmployeeCountByDepartment],
  );

  const totalHeadcount = employees.length;
  const avgTeamSize = departments.length ? Math.round(totalHeadcount / departments.length) : 0;
  const largest = departmentsWithCounts[0];
  const maxHeadcount = Math.max(...departmentsWithCounts.map((d) => d.headcount), 1);

  const selectedDept =
    departmentsWithCounts.find((d) => d.name === selectedName) ?? departmentsWithCounts[0] ?? null;
  const roster = selectedDept ? getEmployeesByDepartment(selectedDept.name) : [];
  const managerOptions = selectedDept ? getEmployeesByDepartment(selectedDept.name) : [];

  const handleSelectDept = (name) => {
    setSelectedName(name);
    setEditingBudget(false);
  };

  const handleManagerChange = (e) => {
    if (!selectedDept) return;
    const emp = managerOptions.find((x) => String(x.id) === e.target.value);
    updateDepartmentManager(selectedDept.id, emp ? emp.name : "");
  };

  const startEditBudget = () => {
    setBudgetValue(String(selectedDept.budget ?? 0));
    setEditingBudget(true);
  };
  const saveBudget = () => {
    updateDepartmentBudget(selectedDept.id, parseInt(budgetValue, 10) || 0);
    setEditingBudget(false);
  };

  const handleDeleteEmployee = (emp) => {
    if (!confirm(`Delete ${emp.name}? This cannot be undone.`)) return;
    removeEmployee(emp.id);
  };

  if (departments.length === 0) {
    return (
      <div className="content-card">
        <div className="empty-state">
          <div className="empty-state-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--txt-disabled)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="4" y="2" width="16" height="20" rx="1" />
              <path d="M9 22v-4h6v4" />
              <path d="M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01" />
            </svg>
          </div>
          <h3 className="empty-state-title">No departments yet</h3>
          <p className="empty-state-description">
            Create your first department to get started with organizing your workforce.
          </p>
          <Button variant="primary" onClick={() => setShowAddModal(true)}>
            + Add Department
          </Button>
        </div>
        {showAddModal && <AddDepartmentModal onClose={() => setShowAddModal(false)} />}
      </div>
    );
  }

  return (
    <div>
      <div className="toolbar" style={{ marginBottom: "var(--sp-5)" }}>
        <div style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)", fontWeight: "var(--fw-semibold)" }}>
          {departments.length} departments · {totalHeadcount} people
        </div>
        <Button variant="primary" style={{ marginLeft: "auto" }} onClick={() => setShowAddModal(true)}>
          + Add Department
        </Button>
      </div>

      {/* ── Stat strip ── */}
      <div className="stat-strip" style={{ marginBottom: "var(--sp-6)" }}>
        <button type="button" className="stat-cell" style={{ cursor: "default" }}>
          <div className="stat-cell-label">Departments</div>
          <div className="stat-cell-value sm">{departments.length}</div>
          <div className="stat-cell-trend">across the org</div>
        </button>
        <button type="button" className="stat-cell" style={{ cursor: "default" }}>
          <div className="stat-cell-label">Total Headcount</div>
          <div className="stat-cell-value sm">{totalHeadcount}</div>
          <div className="stat-cell-trend">active roster</div>
        </button>
        <button type="button" className="stat-cell" style={{ cursor: "default" }}>
          <div className="stat-cell-label">Avg Team Size</div>
          <div className="stat-cell-value sm">{avgTeamSize}</div>
          <div className="stat-cell-trend">people per team</div>
        </button>
        <button type="button" className="stat-cell" style={{ cursor: "default" }}>
          <div className="stat-cell-label">Largest Team</div>
          <div className="stat-cell-value sm" style={{ fontSize: "22px" }}>{largest?.name || "—"}</div>
          <div className="stat-cell-trend">{largest?.headcount || 0} people</div>
        </button>
      </div>

      {/* ── Department cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--sp-4)", marginBottom: "var(--sp-6)" }}>
        {departmentsWithCounts.map((dept) => {
          const isActive = dept.name === selectedDept?.name;
          const roles = Array.from(
            new Set(getEmployeesByDepartment(dept.name).map((e) => e.designation).filter(Boolean)),
          );
          const topRoles = roles.length
            ? roles.slice(0, 2).join(", ") + (roles.length > 2 ? ` +${roles.length - 2} more` : "")
            : "—";

          return (
            <div
              key={dept.id}
              onClick={() => handleSelectDept(dept.name)}
              style={{
                border: `2px solid ${isActive ? "var(--bdr-brand)" : "var(--bdr-default)"}`,
                background: isActive ? "var(--bg-primary-subtle)" : "transparent",
                padding: "16px",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: "7px",
                transition: "border-color 0.15s ease, background 0.15s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div
                    style={{
                      width: "26px", height: "26px", flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontWeight: 800, fontSize: "10.5px",
                      background: isActive ? "var(--bg-primary)" : "var(--bg-surface-alt)",
                      color: isActive ? "var(--txt-on-brand)" : "var(--txt-secondary)",
                    }}
                  >
                    {deptInitials(dept.name)}
                  </div>
                  <div style={{ fontSize: "9.5px", fontWeight: "var(--fw-bold)", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--txt-disabled)" }}>
                    Department
                  </div>
                </div>
                {isActive && (
                  <span style={{
                    fontSize: "9px", fontWeight: "var(--fw-bold)", textTransform: "uppercase", letterSpacing: "0.06em",
                    padding: "2px 7px", background: "var(--bg-primary)", color: "var(--txt-on-brand)",
                  }}>
                    Viewing
                  </span>
                )}
              </div>

              <div style={{ fontWeight: 800, fontSize: "16px", color: "var(--txt-primary)" }}>{dept.name}</div>

              <div style={{ display: "flex", alignItems: "baseline", gap: "5px" }}>
                <span style={{ fontWeight: 800, fontSize: "24px", color: "var(--txt-primary-brand)", lineHeight: 1 }}>
                  {dept.headcount}
                </span>
                <span style={{ fontSize: "11px", color: "var(--txt-secondary)", fontWeight: "var(--fw-semibold)" }}>people</span>
              </div>

              <div style={{ height: "5px", background: "var(--bg-surface-alt)" }}>
                <div style={{
                  height: "100%",
                  width: `${Math.round((dept.headcount / maxHeadcount) * 100)}%`,
                  background: "var(--txt-primary-brand)",
                }} />
              </div>

              <div style={{ fontSize: "11px", color: "var(--txt-secondary)", lineHeight: 1.35, minHeight: "30px" }}>
                {topRoles}
              </div>

              <div style={{
                fontSize: "11px", fontWeight: "var(--fw-semibold)",
                color: dept.manager ? "var(--txt-secondary)" : "var(--txt-disabled)",
                fontStyle: dept.manager ? "normal" : "italic",
              }}>
                {dept.manager ? `Manager: ${dept.manager}` : "No manager assigned"}
              </div>

              <div style={{ fontSize: "11px", fontWeight: "var(--fw-bold)", color: "var(--txt-primary-brand)", marginTop: "1px" }}>
                View roster →
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Roster panel for the selected department ── */}
      {selectedDept && (
        <div className="content-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "var(--sp-5)", flexWrap: "wrap", gap: "var(--sp-3)" }}>
            <div>
              <div style={{ fontSize: "var(--fs-xs)", fontWeight: "var(--fw-bold)", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--txt-disabled)" }}>
                Roster
              </div>
              <h3 className="section-title" style={{ margin: 0 }}>{selectedDept.name}</h3>
            </div>
            <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)" }}>
              {roster.length} people
            </div>
          </div>

          <div style={{
            display: "flex", alignItems: "center", gap: "var(--sp-4)", flexWrap: "wrap",
            padding: "16px 0", borderBottom: "2px solid var(--bdr-default)", marginBottom: "var(--sp-4)",
          }}>
            <span style={{ fontSize: "12px", fontWeight: "var(--fw-bold)", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--txt-disabled)" }}>
              Department Manager
            </span>
            <select
              value={managerOptions.find((e) => e.name === selectedDept.manager)?.id ?? ""}
              onChange={handleManagerChange}
              style={{
                width: "240px", padding: "8px 10px", border: "1px solid var(--bdr-default)",
                background: "var(--bg-surface)", color: "var(--txt-primary)",
                fontFamily: "var(--font-family)", fontSize: "13.5px", fontWeight: "var(--fw-semibold)",
              }}
            >
              <option value="">Not assigned</option>
              {managerOptions.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>

            {/* Budget — real, working field that just isn't part of the
                mockup's department page. Rather than dropping the feature,
                it's kept here as an inline-editable value next to Manager. */}
            <span style={{ fontSize: "12px", fontWeight: "var(--fw-bold)", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--txt-disabled)", marginLeft: "var(--sp-4)" }}>
              Budget
            </span>
            {editingBudget ? (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <input
                  type="number"
                  value={budgetValue}
                  onChange={(e) => setBudgetValue(e.target.value)}
                  autoFocus
                  style={{ width: "110px", padding: "6px 8px", border: "1px solid var(--bdr-default)", fontSize: "13.5px" }}
                />
                <Button variant="primary" size="sm" onClick={saveBudget}>Save</Button>
                <Button variant="secondary" size="sm" onClick={() => setEditingBudget(false)}>Cancel</Button>
              </div>
            ) : (
              <Button variant="link" onClick={startEditBudget}>
                {formatBudget(selectedDept.budget)}
              </Button>
            )}
          </div>

          {roster.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-title">No employees in this department yet</div>
              <div className="empty-state-description">Add an employee and set their department to {selectedDept.name}.</div>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Designation</th>
                    <th>Email</th>
                    <th>Joined</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((emp) => (
                    <tr
                      key={emp.id}
                      className="employee-row-clickable"
                      onClick={() => navigate(`/employees/${emp.id}`)}
                    >
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <Avatar name={emp.name} src={emp.avatar} size="sm" />
                          <div>
                            <div className="employee-row-name">
                              {emp.name}{selectedDept.manager === emp.name ? " · Manager" : ""}
                            </div>
                            <div style={{ fontSize: "var(--fs-2xs)", color: "var(--txt-secondary)" }}>{emp.employeeId}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ color: "var(--txt-secondary)", fontSize: "var(--fs-sm)" }}>{emp.designation}</td>
                      <td style={{ color: "var(--txt-secondary)", fontSize: "var(--fs-sm)" }}>{emp.email}</td>
                      <td style={{ color: "var(--txt-secondary)", fontSize: "var(--fs-sm)" }}>{formatDate(emp.createdAt, language)}</td>
                      <td><TypeBadge type={emp.type} /></td>
                      <td><StatusBadge status={emp.status} /></td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <Button variant="link" onClick={() => navigate(`/employees/${emp.id}`)}>View</Button>
                        {isAdmin && (
                          <Button variant="link" className="btn-link-muted" onClick={() => handleDeleteEmployee(emp)}>Delete</Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showAddModal && <AddDepartmentModal onClose={() => setShowAddModal(false)} />}
    </div>
  );
}

export default AllDepartments;
