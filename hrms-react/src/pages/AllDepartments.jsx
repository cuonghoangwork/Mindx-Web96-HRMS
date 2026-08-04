import { Link } from "react-router-dom";
import { useStore } from "../context/StoreContext";
import { useState } from "react";
import AddDepartmentModal from "../components/AddDepartmentModal";
import Button from "../components/Button";

function AllDepartments() {
  const {
    departments,
    updateDepartmentBudget,
    getEmployeeCountByDepartment,
    getTotalSalaryByDepartment,
  } = useStore();
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);

  // Calculate employee counts and total salary dynamically based on actual employee data
  const departmentsWithCounts = departments.map((dept) => ({
    ...dept,
    employees: getEmployeeCountByDepartment(dept.name),
    totalSalary: getTotalSalaryByDepartment(dept.name),
  }));

  // Calculate total budget
  const totalBudget = departments.reduce((sum, dept) => sum + dept.budget, 0);

  const formatBudget = (amount) => {
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
    return `$${amount}`;
  };

  const handleEditClick = (dept) => {
    setEditingId(dept.id);
    setEditValue(dept.budget.toString());
  };

  const handleSave = (id) => {
    const newBudget = parseInt(editValue) || 0;
    updateDepartmentBudget(id, newBudget);
    setEditingId(null);
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditValue("");
  };

  return (
    <div className="content-card">
      <div className="toolbar">
        <h2 style={{ flex: 1 }}>All Departments</h2>
        <div style={{ textAlign: "right", marginRight: "20px" }}>
          <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Total Budget
          </div>
          <div
            style={{
              fontSize: "20px",
              fontWeight: 600,
              color: "var(--primary)",
            }}
          >
            {formatBudget(totalBudget)}
          </div>
        </div>
        <Button
          variant="primary"
          onClick={() => setShowAddModal(true)}
        >
          + Add Department
        </Button>
      </div>

      {departments.length === 0 ? (
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
            Create your first department to get started with organizing your
            workforce.
          </p>
          <Button
            variant="primary"
            onClick={() => setShowAddModal(true)}
          >
            + Add Department
          </Button>
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Department</th>
              <th>Manager</th>
              <th style={{ textAlign: "center" }}>Employees</th>
              <th style={{ textAlign: "right" }}>Salary</th>
              <th style={{ textAlign: "right" }}>Budget</th>
              <th style={{ textAlign: "center" }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {departmentsWithCounts.map((dept) => (
              <tr key={dept.id}>
                <td>
                  <div style={{ fontWeight: "500" }}>{dept.name}</div>
                </td>
                <td>{dept.manager}</td>
                <td style={{ textAlign: "center" }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minWidth: "28px",
                      height: "28px",
                      padding: "0 8px",
                      background:
                        dept.employees > 0
                          ? "var(--primary-light)"
                          : "var(--surface-alt)",
                      color:
                        dept.employees > 0
                          ? "var(--primary)"
                          : "var(--text-muted)",
                      borderRadius: "14px",
                      fontSize: "14px",
                      fontWeight: "500",
                    }}
                  >
                    {dept.employees}
                  </span>
                </td>
                <td style={{ textAlign: "right" }}>
                  {formatBudget(dept.totalSalary)}
                </td>
                <td style={{ textAlign: "right" }}>
                  {editingId === dept.id ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "flex-end" }}>
                      <span style={{ color: "var(--text-muted)" }}>$</span>
                      <input
                        type="number"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        style={{
                          width: "100px", padding: "4px 8px",
                          border: "1px solid var(--border)",
                          borderRadius: "4px", fontSize: "14px",
                        }}
                        autoFocus
                      />
                      <button
                        onClick={() => handleSave(dept.id)}
                        style={{
                          background: "var(--primary)", color: "white",
                          border: "none", borderRadius: "4px",
                          padding: "4px 8px", cursor: "pointer", fontSize: "12px",
                        }}
                      >✓</button>
                      <button
                        onClick={handleCancel}
                        style={{
                          background: "var(--surface-alt)",
                          border: "1px solid var(--border)", borderRadius: "4px",
                          padding: "4px 8px", cursor: "pointer", fontSize: "12px",
                        }}
                      >✕</button>
                    </div>
                  ) : (
                    <div
                      onClick={() => handleEditClick(dept)}
                      style={{
                        cursor: "pointer", padding: "4px 8px",
                        borderRadius: "4px", transition: "background 0.2s",
                        display: "inline-flex", alignItems: "center", gap: "6px",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-alt)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      title="Click to edit budget"
                    >
                      {formatBudget(dept.budget)}
                      <span style={{ fontSize: "12px", color: "var(--primary)" }}>✎</span>
                    </div>
                  )}
                </td>
                <td style={{ textAlign: "center" }}>
                  <Link
                    to={`/departments/${dept.id}`}
                    className="btn btn-secondary"
                    style={{ padding: "8px 16px", fontSize: "12px" }}
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showAddModal && (
        <AddDepartmentModal onClose={() => setShowAddModal(false)} />
      )}
    </div>
  );
}

export default AllDepartments;
