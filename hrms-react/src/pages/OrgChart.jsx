import { useNavigate } from "react-router-dom";
import { useStore } from "../context/StoreContext";
import { idsMatch } from "../utils/id";
import Avatar from "../components/Avatar";
import Badge from "../components/Badge";

/**
 * OrgChart — read-only manager/report chip clusters, one per department
 * (8.0e Day 9). Built entirely from existing Department + Employee data —
 * Department.managerId already links to a real Employee (model/Department.js),
 * and every Employee already carries its department name, so no schema
 * change or new backend endpoint was needed.
 *
 * This is a two-tier structure (department manager → that department's
 * employees), not a deep multi-level reporting chain — Employee has no
 * manager-of-employee reference today, so anything deeper would need a
 * real schema change. Admin/HR only, matching the nav split from 8.0e.
 */
function OrgChart() {
  const navigate = useNavigate();
  const { departments, employees, getEmployeesByDepartment } = useStore();

  const unassigned = employees.filter(
    (e) => !departments.some((d) => d.name === e.department),
  );

  return (
    <div>
      <div className="toolbar" style={{ marginBottom: "var(--sp-5)" }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0 }}>Org Chart</h2>
          <p style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)", marginTop: "2px" }}>
            Department managers and their teams, read-only.
          </p>
        </div>
      </div>

      {departments.length === 0 ? (
        <div className="content-card">
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--txt-disabled)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 21h18" /><path d="M6 21V8l6-4 6 4v13" /><path d="M10 21v-4h4v4" />
              </svg>
            </div>
            <div className="empty-state-title">No departments yet</div>
            <div className="empty-state-description">Create a department to see it here.</div>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-5)" }}>
          {departments.map((dept) => (
            <DepartmentCluster
              key={dept.id}
              department={dept}
              employees={getEmployeesByDepartment(dept.name)}
              onSelectEmployee={(id) => navigate(`/employees/${id}`)}
            />
          ))}

          {unassigned.length > 0 && (
            <div className="content-card">
              <h3 className="section-title" style={{ marginBottom: "var(--sp-2)" }}>
                Unassigned
              </h3>
              <p style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", marginBottom: "var(--sp-4)" }}>
                {unassigned.length} employee{unassigned.length === 1 ? "" : "s"} without a matching department record
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-3)" }}>
                {unassigned.map((emp) => (
                  <EmployeeChip key={emp.id} employee={emp} onClick={() => navigate(`/employees/${emp.id}`)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DepartmentCluster({ department, employees, onSelectEmployee }) {
  const manager = department.managerId
    ? employees.find((e) => idsMatch(e.id, department.managerId))
    : null;
  const reports = manager
    ? employees.filter((e) => !idsMatch(e.id, manager.id))
    : employees;

  return (
    <div className="content-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--sp-5)", flexWrap: "wrap", gap: "var(--sp-3)" }}>
        <div>
          <h3 className="section-title" style={{ margin: 0 }}>{department.name}</h3>
          <p style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", marginTop: "2px" }}>
            {employees.length} employee{employees.length === 1 ? "" : "s"}
          </p>
        </div>
        {!manager && department.manager && (
          <span style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)" }}>
            Manager on file: {department.manager} (no linked employee record)
          </span>
        )}
      </div>

      {/* Manager tier */}
      {manager && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "var(--sp-5)" }}>
          <EmployeeChip employee={manager} onClick={() => onSelectEmployee(manager.id)} highlight />
          {reports.length > 0 && (
            <div style={{ width: "2px", height: "var(--sp-5)", background: "var(--bdr-default)" }} aria-hidden="true" />
          )}
        </div>
      )}

      {/* Reports tier */}
      {reports.length === 0 ? (
        !manager && (
          <p style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)", textAlign: "center" }}>
            No employees in this department yet.
          </p>
        )
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-3)", justifyContent: "center" }}>
          {reports.map((emp) => (
            <EmployeeChip key={emp.id} employee={emp} onClick={() => onSelectEmployee(emp.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmployeeChip({ employee, onClick, highlight = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: "var(--sp-3)",
        padding: "var(--sp-3) var(--sp-4)",
        background: highlight ? "var(--bg-primary-subtle)" : "var(--bg-surface-alt)",
        border: highlight ? "2px solid var(--bdr-brand)" : "1px solid var(--bdr-subtle)",
        borderRadius: "var(--radius-lg)",
        cursor: "pointer",
        textAlign: "left",
        fontFamily: "var(--font-family)",
        minWidth: "200px",
        transition: "border-color 0.15s",
      }}
    >
      <Avatar name={employee.name} src={employee.avatar} size="sm" />
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: "var(--fs-sm)", fontWeight: "var(--fw-medium)", color: "var(--txt-primary)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {employee.name}
        </div>
        <div style={{
          fontSize: "var(--fs-xs)", color: "var(--txt-secondary)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {employee.designation || "—"}
        </div>
      </div>
      {highlight && <Badge variant="primary" size="sm" style={{ marginLeft: "auto" }}>Manager</Badge>}
    </button>
  );
}

export default OrgChart;
