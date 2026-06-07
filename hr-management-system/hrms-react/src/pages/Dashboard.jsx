import { Link } from "react-router-dom";
import { useStore } from "../context/StoreContext";
import Avatar from "../components/Avatar";
import { StatusBadge } from "../components/Badge";

/* ─────────────────────────────────────────
   SVG Sparkline (thuần, không cần lib)
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
   Attendance Trend — 7 ngày (bar chart)
───────────────────────────────────────── */
function AttendanceTrend({ attendance }) {
  // Tạo 7 ngày gần nhất (mock relative từ data)
  const days = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
  // Group attendance theo date, tính % present
  const dates = [...new Set(attendance.map((a) => a.date))].sort().slice(-7);
  const chartData = days.map((label, i) => {
    const dateRecords = dates[i]
      ? attendance.filter((a) => a.date === dates[i])
      : [];
    const present = dateRecords.filter((a) => a.status === "Present").length;
    const total = dateRecords.length || 1;
    const pct = dateRecords.length ? Math.round((present / total) * 100) : 70 + Math.round(Math.random() * 20);
    return { label, pct };
  });

  const max = Math.max(...chartData.map((d) => d.pct), 100);

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "6px", height: "80px", paddingBottom: "20px", position: "relative" }}>
      {chartData.map((d, i) => {
        const isToday = i === chartData.length - 1;
        const barH = Math.round((d.pct / max) * 60);
        return (
          <div key={d.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", height: "80px", justifyContent: "flex-end" }}>
            <span style={{ fontSize: "10px", fontWeight: "600", color: isToday ? "var(--clr-primary-400)" : "var(--txt-secondary)" }}>
              {d.pct}%
            </span>
            <div
              style={{
                width: "100%", height: `${barH}px`, minHeight: "4px",
                borderRadius: "4px 4px 0 0",
                background: isToday
                  ? "var(--clr-primary-400)"
                  : d.pct >= 90 ? "var(--clr-success-400)"
                  : d.pct >= 75 ? "var(--clr-warning-400)"
                  : "var(--clr-danger-400)",
                transition: "height 0.4s ease",
                opacity: isToday ? 1 : 0.65,
              }}
            />
            <span style={{ fontSize: "10px", color: isToday ? "var(--clr-primary-400)" : "var(--txt-secondary)", fontWeight: isToday ? "600" : "400", position: "absolute", bottom: 0 }}>
              {d.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────
   Headcount by Department — horizontal bars
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
   StatCard với sparkline
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

  // ── Sparklines (7 điểm mock dựa trên số liệu thực) ──
  const attendSpark = [82, 88, 85, 91, 87, 93, attendanceRate];
  const hireSpark   = [0, 1, 1, 2, 1, 2, Math.max(newHires, 1)];

  // ── Donut ──
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
    { icon: "✚", bg: "var(--bg-success-subtle)", text: `${employees[employees.length - 1]?.name || "New employee"} vừa được thêm vào hệ thống`, time: "2 phút trước" },
    { icon: "📋", bg: "var(--bg-warning-subtle)", text: `${onLeave} nhân viên đang xin nghỉ phép`, time: "1 giờ trước" },
    { icon: "💰", bg: "var(--bg-primary-subtle)", text: "Payroll tháng này đã được duyệt", time: "3 giờ trước" },
    { icon: "📊", bg: "var(--bg-info-subtle)", text: `Attendance rate hôm nay: ${attendanceRate}%`, time: "Hôm nay 8:00" },
    { icon: "🔔", bg: "var(--bg-danger-subtle)", text: "5 yêu cầu phê duyệt đang chờ xử lý", time: "Hôm qua" },
  ];

  // ── Quick links ──
  const quickLinks = [
    { to: "/employees/add", label: "Thêm nhân viên", icon: "➕" },
    { to: "/employees",     label: "Danh sách NV",   icon: "👥" },
    { to: "/attendance",    label: "Attendance",      icon: "🕐" },
    { to: "/payroll",       label: "Payroll",         icon: "💰" },
    { to: "/departments",   label: "Phòng ban",       icon: "🏢" },
    { to: "/holidays",      label: "Ngày nghỉ lễ",   icon: "📅" },
  ];

  return (
    <div className="dashboard">

      {/* ── ROW 1: 4 Stat Cards ── */}
      <div className="stat-grid">
        <StatCard
          title="Total Employees"
          value={totalEmployees}
          trend="+3 tháng này"
          trendUp
          hint={`${departments.length} phòng ban`}
          accentColor="var(--clr-primary-400)"
        />
        <StatCard
          title="Attendance Rate"
          value={`${attendanceRate}%`}
          trend="+2% so với tuần trước"
          trendUp
          hint={`${presentCount}/${attendance.length} hôm nay`}
          sparkData={attendSpark}
          accentColor="var(--clr-success-600)"
        />
        <StatCard
          title="On Leave"
          value={onLeave}
          trend="3 hết hạn tuần tới"
          trendUp={false}
          hint="Chờ phê duyệt"
          accentColor="var(--clr-warning-600)"
        />
        <StatCard
          title="New Hires"
          value={newHires}
          trend="+2 so với tháng trước"
          trendUp
          hint="Tháng này"
          sparkData={hireSpark}
          accentColor="var(--clr-info-600)"
        />
      </div>

      {/* ── ROW 2: Attendance Trend + Headcount + Donut ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 220px", gap: "var(--sp-5)" }}>

        {/* Attendance trend 7 ngày */}
        <div className="content-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "var(--sp-5)" }}>
            <div>
              <h3 className="section-title" style={{ margin: 0 }}>Attendance 7 ngày</h3>
              <p style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", marginTop: "2px" }}>
                % nhân viên có mặt mỗi ngày
              </p>
            </div>
            <Link to="/attendance" style={{ fontSize: "var(--fs-xs)", color: "var(--txt-primary-brand)", textDecoration: "none", fontWeight: "var(--fw-medium)", whiteSpace: "nowrap" }}>
              Xem chi tiết →
            </Link>
          </div>
          <AttendanceTrend attendance={attendance} />
          {/* Legend */}
          <div style={{ display: "flex", gap: "var(--sp-4)", marginTop: "var(--sp-3)", flexWrap: "wrap" }}>
            {[
              { label: "≥90% (Tốt)", color: "var(--clr-success-400)" },
              { label: "≥75% (Trung bình)", color: "var(--clr-warning-400)" },
              { label: "<75% (Thấp)", color: "var(--clr-danger-400)" },
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
                Số nhân viên theo phòng ban
              </p>
            </div>
            <Link to="/departments" style={{ fontSize: "var(--fs-xs)", color: "var(--txt-primary-brand)", textDecoration: "none", fontWeight: "var(--fw-medium)", whiteSpace: "nowrap" }}>
              Xem tất cả →
            </Link>
          </div>
          <DeptBars departments={departments} getEmployeeCountByDepartment={getEmployeeCountByDepartment} />
        </div>

        {/* Contract type donut */}
        <div className="content-card">
          <h3 className="section-title" style={{ marginBottom: "var(--sp-5)" }}>Loại HĐ</h3>
          <DonutChart segments={contractSegs} total={totalEmployees} />
        </div>
      </div>

      {/* ── ROW 3: Recent employees + Activity + Quick links ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: "var(--sp-5)" }}>

        {/* Recent employees table */}
        <div className="content-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--sp-5)" }}>
            <h3 className="section-title" style={{ margin: 0 }}>Nhân viên gần đây</h3>
            <Link to="/employees" style={{ fontSize: "var(--fs-xs)", color: "var(--txt-primary-brand)", textDecoration: "none", fontWeight: "var(--fw-medium)" }}>
              Xem tất cả →
            </Link>
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
          <div className="content-card" style={{ flex: 1 }}>
            <h3 className="section-title" style={{ marginBottom: "var(--sp-4)" }}>Hoạt động gần đây</h3>
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
