import { Link } from "react-router-dom";
import { useStore } from "../context/StoreContext";

function Dashboard() {
  const { employees, attendance, departments, getEmployeeCountByDepartment } =
    useStore();

  const totalEmployees = employees.length;
  const presentCount = attendance.filter((a) => a.status === "Present").length;
  const attendanceRate =
    attendance.length > 0
      ? Math.round((presentCount / attendance.length) * 100)
      : 0;
  const pendingLeave = employees.filter(
    (emp) => emp.status === "On Leave",
  ).length;
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const newHires = employees.filter((emp) => {
    const createdDate = new Date(emp.createdAt);
    return (
      createdDate.getMonth() === currentMonth &&
      createdDate.getFullYear() === currentYear
    );
  }).length;

  const quickLinks = [
    { to: "/employees/add", label: "Add employee", icon: "＋" },
    { to: "/employees", label: "View roster", icon: "👥" },
    { to: "/attendance", label: "Attendance", icon: "🕐" },
    { to: "/payroll", label: "Payroll", icon: "💰" },
  ];

  return (
    <div className="dashboard">
      <section className="content-card dashboard-hero">
        <h2>Welcome back</h2>
        <p className="text-muted">
          Overview of your workforce. Data is mock state for frontend demo —
          connect an API when you move to full stack.
        </p>
      </section>

      <div className="stat-grid">
        <StatCard title="Total Employees" value={totalEmployees} hint="Active roster" />
        <StatCard
          title="Attendance Rate"
          value={`${attendanceRate}%`}
          hint={`${presentCount} of ${attendance.length} today`}
        />
        <StatCard title="On Leave" value={pendingLeave} hint="Requires approval" />
        <StatCard title="New Hires" value={newHires} hint="This month" />
      </div>

      <div className="dashboard-columns">
        <section className="content-card">
          <h3 className="section-title">Quick actions</h3>
          <div className="quick-links">
            {quickLinks.map((link) => (
              <Link key={link.to} to={link.to} className="quick-link">
                <span className="quick-link-icon" aria-hidden="true">
                  {link.icon}
                </span>
                <span>{link.label}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="content-card">
          <h3 className="section-title">Departments</h3>
          <ul className="dept-list">
            {departments.slice(0, 5).map((dept) => (
              <li key={dept.id}>
                <span>{dept.name}</span>
                <span className="text-muted">
                  {getEmployeeCountByDepartment(dept.name)} employees
                </span>
              </li>
            ))}
          </ul>
          <Link to="/departments" className="link-primary">
            View all departments →
          </Link>
        </section>
      </div>
    </div>
  );
}

function StatCard({ title, value, hint }) {
  return (
    <div className="stat-card">
      <div className="stat-card-label">{title}</div>
      <div className="stat-card-value">{value}</div>
      <div className="stat-card-hint">{hint}</div>
    </div>
  );
}

export default Dashboard;
