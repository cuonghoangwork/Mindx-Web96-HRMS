import { Link } from "react-router-dom";
import { useStore } from "../context/StoreContext";

/* ─── mini bar chart (thuần CSS, không cần lib) ─── */
function BarChart({ data }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {data.map((d) => (
        <div key={d.label} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{
            fontSize: "var(--fs-xs)", color: "var(--txt-secondary)",
            width: "90px", textAlign: "right", flexShrink: 0,
          }}>{d.label}</span>
          <div style={{
            flex: 1, background: "var(--bg-surface-alt)",
            borderRadius: "var(--radius-full)", height: "8px",
          }}>
            <div style={{
              height: "8px", borderRadius: "var(--radius-full)",
              background: d.color || "var(--clr-primary-400)",
              width: `${Math.round((d.value / max) * 100)}%`,
              transition: "width 0.6s ease",
            }} />
          </div>
          <span style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", minWidth: "24px", textAlign: "right" }}>
            {d.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ─── attendance sparkline 7 ngày (SVG) ─── */
function Sparkline({ data, color = "var(--clr-primary-400)" }) {
  const W = 200, H = 48, pad = 4;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (W - pad * 2);
    const y = H - pad - ((v / max) * (H - pad * 2));
    return `${x},${y}`;
  });
  const areaBottom = `${W - pad},${H - pad} ${pad},${H - pad}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "48px", display: "block" }}>
      <defs>
        <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`${pts.join(" ")} ${areaBottom}`} fill="url(#sg)" />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {pts[pts.length - 1] && (
        <circle cx={pts[pts.length - 1].split(",")[0]} cy={pts[pts.length - 1].split(",")[1]}
          r="3.5" fill={color} />
      )}
    </svg>
  );
}

/* ─── donut chart (SVG) ─── */
function DonutChart({ segments, size = 80 }) {
  const r = 28, cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;
  const total = segments.reduce((s, d) => s + d.value, 0) || 1;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
      {segments.map((seg, i) => {
        const dash = (seg.value / total) * circ;
        const el = (
          <circle key={i} cx={cx} cy={cy} r={r}
            fill="none" stroke={seg.color} strokeWidth="10"
            strokeDasharray={`${dash} ${circ - dash}`}
            strokeDashoffset={-offset} strokeLinecap="butt" />
        );
        offset += dash;
        return el;
      })}
    </svg>
  );
}

/* ─── activity feed item ─── */
function ActivityItem({ icon, text, time, color }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", paddingBottom: "12px", borderBottom: "1px solid var(--bdr-subtle)" }}>
      <div style={{
        width: "32px", height: "32px", borderRadius: "50%", flexShrink: 0,
        background: color || "var(--bg-primary-subtle)",
        display: "grid", placeItems: "center", fontSize: "14px",
      }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: "var(--fs-sm)", color: "var(--txt-primary)", lineHeight: 1.4 }}>{text}</div>
        <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", marginTop: "3px" }}>{time}</div>
      </div>
    </div>
  );
}

/* ─── StatCard với trend + sparkline ─── */
function StatCard({ title, value, hint, trend, trendUp, sparkData, accentColor }) {
  return (
    <div className="stat-card" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <div className="stat-card-label">{title}</div>
      <div className="stat-card-value" style={{ color: accentColor || "var(--txt-primary)" }}>{value}</div>
      {trend && (
        <div className={`stat-card-trend ${trendUp ? "up" : "down"}`}>
          <span>{trendUp ? "↑" : "↓"}</span>{trend}
        </div>
      )}
      {hint && <div className="stat-card-hint">{hint}</div>}
      {sparkData && (
        <div style={{ marginTop: "8px" }}>
          <Sparkline data={sparkData} color={accentColor || "var(--clr-primary-400)"} />
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════ */
function Dashboard() {
  const { employees, attendance, departments, getEmployeeCountByDepartment } = useStore();

  const totalEmployees = employees.length;
  const presentCount = attendance.filter((a) => a.status === "Present").length;
  const attendanceRate = attendance.length > 0
    ? Math.round((presentCount / attendance.length) * 100) : 0;
  const onLeave = employees.filter((e) => e.status === "On Leave").length;
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const newHires = employees.filter((e) => {
    const d = new Date(e.createdAt);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  }).length;

  /* mock sparkline data — 7 ngày gần nhất */
  const attendanceSpark = [88, 91, 85, 94, 90, 93, attendanceRate];
  const hireSpark = [1, 0, 2, 1, 1, 2, newHires > 0 ? newHires : 1];

  /* dept bar chart */
  const deptColors = ["var(--clr-primary-400)", "var(--clr-success-500)", "var(--clr-warning-500)", "var(--clr-info-500)", "var(--clr-primary-300)", "var(--clr-success-400)", "var(--clr-danger-400)"];
  const deptData = departments.map((d, i) => ({
    label: d.name,
    value: getEmployeeCountByDepartment(d.name),
    color: deptColors[i % deptColors.length],
  }));

  /* contract type donut */
  const fullTime = employees.filter((e) => e.type === "Full-time").length;
  const partTime = employees.filter((e) => e.type === "Part-time").length;
  const contract = employees.filter((e) => e.type === "Contract").length;
  const intern   = employees.filter((e) => e.type === "Intern").length;

  const donutSegs = [
    { value: fullTime, color: "var(--clr-primary-400)", label: "Full-time" },
    { value: partTime, color: "var(--clr-success-500)", label: "Part-time" },
    { value: contract, color: "var(--clr-warning-500)", label: "Contract" },
    { value: intern,   color: "var(--clr-info-500)",    label: "Intern" },
  ];

  /* recent employees */
  const recentEmployees = [...employees]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);

  const getInitials = (name) => name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  const avatarColors = ["var(--clr-primary-400)", "var(--clr-success-500)", "var(--clr-warning-500)", "var(--clr-info-500)", "var(--clr-danger-400)"];

  const statusBadgeClass = (status) => {
    if (status === "Active") return "badge badge-active badge-dot";
    if (status === "On Leave") return "badge badge-leave badge-dot";
    if (status === "Terminated") return "badge badge-terminated badge-dot";
    return "badge badge-pending";
  };

  /* activity feed — mock */
  const activities = [
    { icon: "✚", text: "Alice Brown vừa được thêm vào Finance", time: "2 phút trước", color: "var(--bg-success-subtle)" },
    { icon: "📋", text: "Bob Johnson xin nghỉ phép 3 ngày", time: "1 giờ trước", color: "var(--bg-warning-subtle)" },
    { icon: "💰", text: "Payroll tháng 6 đã được duyệt", time: "3 giờ trước", color: "var(--bg-primary-subtle)" },
    { icon: "🔔", text: "5 đơn xin nghỉ đang chờ duyệt", time: "Hôm qua", color: "var(--bg-danger-subtle)" },
  ];

  const quickLinks = [
    { to: "/employees/add", label: "Thêm nhân viên", icon: "＋" },
    { to: "/employees",     label: "Danh sách NV",   icon: "👥" },
    { to: "/attendance",    label: "Attendance",      icon: "🕐" },
    { to: "/payroll",       label: "Payroll",         icon: "💰" },
    { to: "/departments",   label: "Phòng ban",       icon: "🏢" },
    { to: "/holidays",      label: "Ngày nghỉ lễ",   icon: "📅" },
  ];

  return (
    <div className="dashboard">

      {/* ── STAT CARDS ── */}
      <div className="stat-grid">
        <StatCard
          title="Total Employees"
          value={totalEmployees}
          trend="+8 tháng này"
          trendUp
          hint={`${departments.length} phòng ban`}
          accentColor="var(--clr-primary-400)"
        />
        <StatCard
          title="Attendance Rate"
          value={`${attendanceRate}%`}
          trend="+2% vs tuần trước"
          trendUp
          hint={`${presentCount} / ${attendance.length} hôm nay`}
          sparkData={attendanceSpark}
          accentColor="var(--clr-success-600)"
        />
        <StatCard
          title="On Leave"
          value={onLeave}
          trend="3 hết hạn tuần tới"
          trendUp={false}
          hint="Chờ duyệt"
          accentColor="var(--clr-warning-600)"
        />
        <StatCard
          title="New Hires"
          value={newHires}
          trend="+3 vs tháng trước"
          trendUp
          hint="Tháng này"
          sparkData={hireSpark}
          accentColor="var(--clr-info-600)"
        />
      </div>

      {/* ── ROW 2: Headcount chart + Contract donut + Quick links ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "var(--sp-5)" }}>

        {/* Headcount bar chart */}
        <div className="card" style={{ gridColumn: "span 2" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--sp-5)" }}>
            <h3 className="section-title" style={{ margin: 0 }}>Headcount theo phòng ban</h3>
            <Link to="/departments" className="link-primary" style={{ fontSize: "var(--fs-sm)" }}>Xem tất cả →</Link>
          </div>
          <BarChart data={deptData} />
        </div>

        {/* Contract type donut */}
        <div className="card" style={{ display: "flex", flexDirection: "column" }}>
          <h3 className="section-title" style={{ marginBottom: "var(--sp-5)" }}>Loại hợp đồng</h3>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "var(--sp-5)", flex: 1 }}>
            <div style={{ position: "relative" }}>
              <DonutChart segments={donutSegs} size={96} />
              <div style={{
                position: "absolute", inset: 0, display: "grid", placeItems: "center",
                fontSize: "var(--fs-xl)", fontWeight: "var(--fw-semibold)", color: "var(--txt-primary)",
                transform: "rotate(0deg)",
              }}>
                <span style={{ fontSize: "var(--fs-xl)", fontWeight: 600, color: "var(--txt-primary)" }}>
                  {totalEmployees}
                </span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {donutSegs.map((s) => (
                <div key={s.label} style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                  <span style={{ width: "9px", height: "9px", borderRadius: "2px", background: s.color, flexShrink: 0 }} />
                  <span style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)" }}>{s.label}</span>
                  <span style={{ fontSize: "var(--fs-xs)", fontWeight: "var(--fw-medium)", color: "var(--txt-primary)", marginLeft: "auto" }}>{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── ROW 3: Recent employees table + Activity feed ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "var(--sp-5)" }}>

        {/* Recent employees */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--sp-5)" }}>
            <h3 className="section-title" style={{ margin: 0 }}>Nhân viên gần đây</h3>
            <Link to="/employees" className="link-primary" style={{ fontSize: "var(--fs-sm)" }}>Xem tất cả →</Link>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Nhân viên</th>
                <th>Phòng ban</th>
                <th>Chức danh</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {recentEmployees.map((emp, i) => (
                <tr key={emp.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{
                        width: "32px", height: "32px", borderRadius: "50%", flexShrink: 0,
                        background: avatarColors[i % avatarColors.length],
                        display: "grid", placeItems: "center",
                        fontSize: "var(--fs-xs)", fontWeight: "var(--fw-semibold)", color: "white",
                      }}>
                        {getInitials(emp.name)}
                      </div>
                      <div>
                        <div style={{ fontWeight: "var(--fw-medium)", fontSize: "var(--fs-md)" }}>{emp.name}</div>
                        <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)" }}>{emp.employeeId}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ fontSize: "var(--fs-sm)" }}>{emp.department}</td>
                  <td style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)" }}>{emp.designation}</td>
                  <td><span className={statusBadgeClass(emp.status)}>{emp.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Right column: Quick links + Activity */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-5)", width: "260px" }}>

          {/* Quick links */}
          <div className="card">
            <h3 className="section-title" style={{ marginBottom: "var(--sp-4)" }}>Quick actions</h3>
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
          <div className="card" style={{ flex: 1 }}>
            <h3 className="section-title" style={{ marginBottom: "var(--sp-4)" }}>Hoạt động gần đây</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
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
