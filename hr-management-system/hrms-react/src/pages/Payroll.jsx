import { useStore } from "../context/StoreContext";

function Payroll() {
  const { departments } = useStore();

  // Calculate total budget from all departments
  const totalPayroll = departments.reduce((sum, dept) => sum + dept.budget, 0);

  const formatBudget = (amount) => {
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
    return `$${amount}`;
  };

  return (
    <div className="content-card">
      <div className="page-header">
        <h2>Payroll</h2>
        <p className="text-muted" style={{ marginTop: "4px" }}>
          Manage employee salaries and payroll processing.
        </p>
      </div>

      <div className="stat-grid" style={{ marginTop: "24px" }}>
        <div className="stat-card">
          <div className="stat-card-label">Total Payroll</div>
          <div className="stat-card-value">{formatBudget(totalPayroll)}</div>
          <div className="stat-card-hint">Across all departments</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Pending Approvals</div>
          <div className="stat-card-value">3</div>
          <div className="stat-card-hint">Awaiting review</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Next Payday</div>
          <div className="stat-card-value">Jan 31</div>
          <div className="stat-card-hint">Monthly cycle</div>
        </div>
      </div>

      {/* Department Budget Breakdown */}
      <div style={{ marginTop: "32px" }}>
        <h3 className="section-title">Department Budgets</h3>
        <div className="stat-grid">
          {departments.map((dept) => (
            <div key={dept.id} className="stat-card">
              <div className="stat-card-label">{dept.name}</div>
              <div
                className="stat-card-value"
                style={{ color: "var(--primary)" }}
              >
                {formatBudget(dept.budget)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Payroll;
