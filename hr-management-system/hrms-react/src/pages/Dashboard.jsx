import { Link } from "react-router-dom";
import { useStore } from "../context/StoreContext";
import Avatar from "../components/Avatar";
import { StatusBadge } from "../components/Badge";
import AttendanceTrendChart from "../components/AttendanceTrendChart";

/* ─────────────────────────────────────────
   SVG Sparkline (pure SVG, no lib needed)
───────────────────────────────────────── */
function Sparkline({ data = [], color = "var(--clr-primary-400)", height = 44 }) {
  if (data.length < 2) return null;
  const W = 160, H = height, pad = 4;
  const max = Math.max(...data, 1);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (W - pad * 2);
    const y = H - pad - ((v - min) / range) * (H - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = pts[pts.length - 1];
  const areaPath = `${pts.join(" ")} ${W - pad},${H - pad} ${pad},${H - pad}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height, display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={`sg-${color.replace(/[^a-z]/gi, "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPath} fill={`url(#sg-${color.replace(/[^a-z]/gi, "")})`} />
      <polyline points={pts.join(" ")} fill="none" stroke={color}
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {last && (
        <circle cx={last.split(",")[0]} cy={last.split(",")[1]}
          r="3.5" fill={color} />
      )}
    </svg>
  );
}


/* ─────────────────────────────────────────
   Headcount by Department — horizontal bar chart
───────────────────────────────────────── */
const DEPT_COLORS = [
  "var(--clr-primary-400)",
  "var(--clr-success-500)",
  "var(--clr-warning-500)",
  "var(--clr-info-500)",
  "var(--clr-primary-300)",
  "var(--clr-success-400)",
];

function DeptBars({ departments, getEmployeeCountByDepartment }) {
  const data = departments
    .map((d, i) => ({
      name: d.name,
      count: getEmployeeCountByDepartment(d.name),
      color: DEPT_COLORS[i % DEPT_COLORS.length],
    }))
    .sort((a, b) => b.count - a.count);

  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {data.map((d) => (
        <div key={d.name} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{
            fontSize: "var(--fs-xs)", color: "var(--txt-secondary)",
            width: "80px", flexShrink: 0, textAlign: "right",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>{d.name}</span>
          <div style={{
            flex: 1, height: "8px", background: "var(--bg-surface-sub)",
            borderRadius: "var(--radius-full)",
          }}>
            <div style={{
              height: "8px", borderRadius: "var(--radius-full)",
              background: d.color,
              width: `${Math.round((d.count / max) * 100)}%`,
              transition: "width 0.5s ease",
            }} />
          </div>
          <span style={{
            fontSize: "var(--fs-xs)", fontWeight: "var(--fw-medium)",
            color: "var(--txt-primary)", minWidth: "20px", textAlign: "right",
          }}>{d.count}</span>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────
   Donut Chart — contract types
───────────────────────────────────────── */
function DonutChart({ segments, total, size = 88 }) {
  const r = 30, cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-5)" }}>
      <div style={{ position: "relative", flexShrink: 0, width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
          style={{ transform: "rotate(-90deg)" }}>
          {segments.map((seg, i) => {
            const dash = (seg.value / (total || 1)) * circ;
            const el = (
              <circle key={i} cx={cx} cy={cy} r={r} fill="none"
                stroke={seg.color} strokeWidth="12"
                strokeDasharray={`${dash} ${circ - dash}`}
                strokeDashoffset={-offset} />
            );
            offset += dash;
            return el;
          })}
        </svg>
        <div style={{
          position: "absolute", inset: 0, display: "flex",
          flexDirection: "column", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontSize: "var(--fs-xl)", fontWeight: "var(--fw-semibold)", color: "var(--txt-primary)", lineHeight: 1 }}>{total}</span>
          <span style={{ fontSize: "var(--fs-2xs)", color: "var(--txt-secondary)", marginTop: "2px" }}>total</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "7px", flex: 1 }}>
        {segments.map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: "7px" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", flex: 1 }}>{s.label}</span>
            <span style={{ fontSize: "var(--fs-xs)", fontWeight: "var(--fw-medium)", color: "var(--txt-primary)" }}>{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   StatCard with sparkline
───────────────────────────────────────── */
function StatCard({ title, value, hint, trend, trendUp, sparkData, accentColor = "var(--clr-primary-400)" }) {
  return (
    <div className="stat-card">
      <div className="stat-card-label">{title}</div>
      <div className="stat-card-value" style={{ color: accentColor }}>{value}</div>
      {trend && (
        <div className={`stat-card-trend ${trendUp ? "up" : "down"}`}>
          <span>{trendUp ? "↑" : "↓"}</span> {trend}
        </div>
      )}
      {hint && <div className="stat-card-hint">{hint}</div>}
      {sparkData && (
        <div style={{ marginTop: "var(--sp-2)" }}>
          <Sparkline data={sparkData} color={accentColor} />
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────
   Activity feed item
───────────────────────────────────────── */
function ActivityItem({ icon, bg, text, time }) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: "var(--sp-3)",
      paddingBottom: "var(--sp-3)", borderBottom: "1px solid var(--bdr-subtle)",
    }}>
      <div style={{
        width: "30px", height: "30px", borderRadius: "50%", flexShrink: 0,
        background: bg, display: "grid", placeItems: "center", fontSize: "13px",
      }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: "var(--fs-sm)", color: "var(--txt-primary)", lineHeight: 1.4 }}>{text}</div>
        <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", marginTop: "3px" }}>{time}</div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   DASHBOARD
═══════════════════════════════════════════ */
function Dashboard() {
  const { employees, attendance, departments, getEmployeeCountByDepartment } = useStore();

  // ── Stats ──
  const totalEmployees = employees.length;
  const presentCount   = attendance.filter((a) => a.status === "Present").length;
  const attendanceRate = attendance.length > 0
    ? Math.round((presentCount / attendance.length) * 100) : 0;
  const onLeave  = employees.filter((e) => e.status === "On Leave").length;
  const curMonth = new Date().getMonth();
  const curYear  = new Date().getFullYear();
  const newHires = employees.filter((e) => {
    const d = new Date(e.createdAt);
    return d.getMonth() === curMonth && d.getFullYear() === curYear;
  }).length;

  // ── Sparklines (7 mock points based on real data) ──
  const attendSpark = [82, 88, 85, 91, 87, 93, attendanceRate];
  const hireSpark   = [0, 1, 1, 2, 1, 2, Math.max(newHires, 1)];

  // ── Donut chart data ──
  const contractSegs = [
    { label: "Full-time", value: employees.filter((e) => e.type === "Full-time").length, color: "var(--clr-primary-400)" },
    { label: "Part-time", value: employees.filter((e) => e.type === "Part-time").length, color: "var(--clr-success-500)" },
    { label: "Contract",  value: employees.filter((e) => e.type === "Contract").length,  color: "var(--clr-warning-500)" },
    { label: "Intern",    value: employees.filter((e) => e.type === "Intern").length,    color: "var(--clr-info-500)" },
  ].filter((s) => s.value > 0);

  // ── Recent employees ──
  const recent = [...employees]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);

  // ── Activity feed (mock) ──
  const activities = [
    { icon: "✚", bg: "var(--bg-success-subtle)", text: `${employees[employees.length - 1]?.name || "New employee"} was just added to the system`, time: "2 minutes ago" },
    { icon: "📋", bg: "var(--bg-warning-subtle)", text: `${onLeave} employees currently on leave`, time: "1 hour ago" },
    { icon: "💰", bg: "var(--bg-primary-subtle)", text: "This month's payroll has been approved", time: "3 hours ago" },
    { icon: "📊", bg: "var(--bg-info-subtle)", text: `Attendance rate today: ${attendanceRate}%`, time: "Today 8:00" },
    { icon: "🔔", bg: "var(--bg-danger-subtle)", text: "5 approval requests pending", time: "Yesterday" },
  ];

  // ── Quick links ──
  const quickLinks = [
    { to: "/employees/add", label: "Add Employee", icon: "➕" },
    { to: "/employees",     label: "All Employees",   icon: "👥" },
    { to: "/attendance",    label: "Attendance",      icon: "🕐" },
    { to: "/payroll",       label: "Payroll",         icon: "💰" },
    { to: "/departments",   label: "Departments",       icon: "🏢" },
    { to: "/holidays",      label: "Holidays",   icon: "📅" },
  ];

  return (
    <div className="dashboard">

      {/* ── ROW 1: 4 Stat Cards ── */}
      <div className="stat-grid">
        <StatCard
          title="Total Employees"
          value={totalEmployees}
          trend="+3 this month"
          trendUp
          hint={`${departments.length} departments`}
          accentColor="var(--clr-primary-400)"
        />
        <StatCard
          title="Attendance Rate"
          value={`${attendanceRate}%`}
          trend="+2% vs last week"
          trendUp
          hint={`${presentCount}/${attendance.length} today`}
          sparkData={attendSpark}
          accentColor="var(--clr-success-600)"
        />
        <StatCard
          title="On Leave"
          value={onLeave}
          trend="3 expiring next week"
          trendUp={false}
          hint="Pending approval"
          accentColor="var(--clr-warning-600)"
        />
        <StatCard
          title="New Hires"
          value={newHires}
          trend="+2 vs last month"
          trendUp
          hint="This month"
          sparkData={hireSpark}
          accentColor="var(--clr-info-600)"
        />
      </div>

      {/* ── ROW 2: Attendance Trend + Headcount + Contract Donut ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 220px", gap: "var(--sp-5)" }}>

        {/* Attendance trend - last 7 days */}
        <div className="content-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "var(--sp-5)" }}>
            <div>
              <h3 className="section-title" style={{ margin: 0 }}>Attendance — Last 7 Days</h3>
              <p style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", marginTop: "2px" }}>
                % of employees present each day
              </p>
            </div>
            <Link to="/attendance" style={{ fontSize: "var(--fs-xs)", color: "var(--txt-primary-brand)", textDecoration: "none", fontWeight: "var(--fw-medium)", whiteSpace: "nowrap" }}>
              View details →
            </Link>
          </div>
          <AttendanceTrendChart attendance={attendance} totalStaff={totalEmployees} />
          {/* Legend */}
          <div style={{ display: "flex", gap: "var(--sp-4)", marginTop: "var(--sp-3)", flexWrap: "wrap" }}>
            {[
              { label: "≥90% (Good)", color: "var(--clr-success-400)" },
              { label: "≥75% (Average)", color: "var(--clr-warning-400)" },
              { label: "<75% (Low)", color: "var(--clr-danger-400)" },
            ].map((l) => (
              <div key={l.label} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: l.color, display: "inline-block" }} />
                <span style={{ fontSize: "10px", color: "var(--txt-secondary)" }}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Headcount by dept */}
        <div className="content-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "var(--sp-5)" }}>
            <div>
              <h3 className="section-title" style={{ margin: 0 }}>Headcount</h3>
              <p style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", marginTop: "2px" }}>
                Number of employees by department
              </p>
            </div>
            <Link to="/departments" style={{ fontSize: "var(--fs-xs)", color: "var(--txt-primary-brand)", textDecoration: "none", fontWeight: "var(--fw-medium)", whiteSpace: "nowrap" }}>
              View all →
            </Link>
          </div>
          <DeptBars departments={departments} getEmployeeCountByDepartment={getEmployeeCountByDepartment} />
        </div>

        {/* Contract type donut */}
        <div className="content-card">
          <h3 className="section-title" style={{ marginBottom: "var(--sp-5)" }}>Contract Types</h3>
          <DonutChart segments={contractSegs} total={totalEmployees} />
        </div>
      </div>

      {/* ── ROW 3: Recent Employees + Activity + Quick Links ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: "var(--sp-5)" }}>

        {/* Recent employees table */}
        <div className="content-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--sp-5)" }}>
            <h3 className="section-title" style={{ margin: 0 }}>Recent Employees</h3>
            <Link to="/employees" style={{ fontSize: "var(--fs-xs)", color: "var(--txt-primary-brand)", textDecoration: "none", fontWeight: "var(--fw-medium)" }}>
              View all →
            </Link>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Department</th>
                <th>Designation</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((emp) => (
                <tr key={emp.id} className="employee-row-clickable"
                  onClick={() => { window.location.href = `/employees/${emp.id}`; }}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
                      <Avatar name={emp.name} size="sm" />
                      <div>
                        <div className="employee-row-name">{emp.name}</div>
                        <div style={{ fontSize: "var(--fs-2xs)", color: "var(--txt-secondary)" }}>{emp.employeeId}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ fontSize: "var(--fs-sm)" }}>{emp.department}</td>
                  <td style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)" }}>{emp.designation}</td>
                  <td>
                    <StatusBadge
                      status={emp.status}
                      dot
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Right col: Quick links + Activity */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-5)" }}>

          {/* Quick links */}
          <div className="content-card">
            <h3 className="section-title" style={{ marginBottom: "var(--sp-4)" }}>Quick Actions</h3>
            <div className="quick-links">
              {quickLinks.map((link) => (
                <Link key={link.to} to={link.to} className="quick-link">
                  <span className="quick-link-icon" aria-hidden="true">{link.icon}</span>
                  <span>{link.label}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* Activity feed */}
          <div className="content-card" style={{ flex: 1 }}>
            <h3 className="section-title" style={{ marginBottom: "var(--sp-4)" }}>Recent Activity</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
              {activities.map((a, i) => (
                <ActivityItem key={i} {...a} />
              ))}
            </div>
          </div>

        </div>
      </div>

    </div>
  );
}

export default Dashboard;
