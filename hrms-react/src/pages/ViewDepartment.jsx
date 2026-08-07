import { Link, useParams, useNavigate } from "react-router-dom";
import { useStore } from "../context/StoreContext";
import { idsMatch } from "../utils/id";
import Button from "../components/Button";

function formatBudget(amount) {
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
  return `$${amount}`;
}

function ViewDepartment() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { departments, getEmployeesByDepartment } = useStore();

  const department = departments.find((d) => idsMatch(d.id, id));

  if (!department) {
    return (
      <div className="content-card">
        <h2>Department Not Found</h2>
        <Button
          variant="primary"
          style={{ marginTop: "20px" }}
          onClick={() => navigate("/departments")}
        >
          Back to Departments
        </Button>
      </div>
    );
  }

  const teamMembers = getEmployeesByDepartment(department.name);
  const teamSize = teamMembers.length;

  return (
    <div className="content-card">
      <Button
        variant="secondary"
        style={{ marginBottom: "20px" }}
        onClick={() => navigate("/departments")}
      >
        ← Back
      </Button>

      <h2>{department.name}</h2>
      <p style={{ color: "var(--text-muted)", marginTop: "8px" }}>
        Managed by {department.manager}
      </p>

      <div className="department-stats-grid">
        <div className="department-stat-card">
          <div className="detail-label">Manager</div>
          <div className="department-stat-value">{department.manager}</div>
        </div>
        <div className="department-stat-card">
          <div className="detail-label">Team Size</div>
          <div className="department-stat-value">
            {teamSize} {teamSize === 1 ? "person" : "people"}
          </div>
        </div>
        <div className="department-stat-card">
          <div className="detail-label">Budget</div>
          <div className="department-stat-value">
            {formatBudget(department.budget)}
          </div>
        </div>
      </div>

      <section style={{ marginTop: "32px" }}>
        <h3 className="section-title">Team Members</h3>
        {teamMembers.length === 0 ? (
          <p className="text-muted">No employees assigned to this department.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Employee ID</th>
                <th>Designation</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {teamMembers.map((employee) => (
                <tr key={employee.id}>
                  <td>
                    <Link
                      to={`/employees/${employee.id}`}
                      className="link-primary"
                    >
                      {employee.name}
                    </Link>
                  </td>
                  <td>{employee.employeeId}</td>
                  <td>{employee.designation}</td>
                  <td>{employee.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

export default ViewDepartment;
