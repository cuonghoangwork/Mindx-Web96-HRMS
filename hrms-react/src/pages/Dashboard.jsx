import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import { EmployeesAPI, LeaveRequestsAPI, PayrollAPI, PerformanceReviewsAPI } from "../api";
import { useLanguage } from "../context/LanguageContext";
import { formatDate } from "../utils/format";
import { fmtMoney } from "../utils/payroll";
import { idsMatch } from "../utils/id";
import { leaveTypeLabel } from "../utils/leaveTypes";
import Avatar from "../components/Avatar";
import Badge, { StatusBadge } from "../components/Badge";
import Button from "../components/Button";
import AttendanceTrendChart from "../components/AttendanceTrendChart";
import ApplyLeaveModal from "../components/ApplyLeaveModal";

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
      <polygon points={areaPath} fill={color} fillOpacity="0.08" />
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
          }}>
            <div style={{
              height: "8px",
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
   Contract Mix — single stacked bar + legend
   (mockup's stackTrackStyle/contractSegments pattern)
───────────────────────────────────────── */
function ContractMixBar({ segments, total }) {
  let acc = 0;
  return (
    <div>
      <div style={{ position: "relative", height: "22px", background: "var(--bg-surface-alt)", marginBottom: "16px", marginTop: "4px" }}>
        {segments.map((seg) => {
          const pct = total ? (seg.value / total) * 100 : 0;
          const el = (
            <div key={seg.label} style={{
              position: "absolute", left: `${acc}%`, top: 0, bottom: 0, width: `${pct}%`,
              background: seg.color, borderRight: "2px solid var(--bg-page)",
            }} />
          );
          acc += pct;
          return el;
        })}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {segments.map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: "9px" }}>
            <span style={{ width: "9px", height: "9px", background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: "12.5px", color: "var(--txt-secondary)", flex: 1 }}>{s.label}</span>
            <span style={{ fontSize: "12.5px", fontWeight: "var(--fw-bold)", color: "var(--txt-primary)" }}>{s.value}</span>
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
   StripStatCell — bordered-strip stat cell (mockup's cellBase pattern)
   Used on the admin Dashboard's two stat rows: one 2px-bordered strip
   of cells divided by internal borders, no per-cell card box.
───────────────────────────────────────── */
function StripStatCell({ label, value, trend, onClick, small }) {
  return (
    <button type="button" className="stat-cell" onClick={onClick}>
      <div className="stat-cell-label">{label}</div>
      <div className={`stat-cell-value${small ? " sm" : ""}`}>{value}</div>
      {trend && <div className="stat-cell-trend">{trend}</div>}
    </button>
  );
}

/* ─────────────────────────────────────────
   Activity feed item
───────────────────────────────────────── */
function ActivityItem({ icon, bg, color, text, time }) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: "var(--sp-3)",
      paddingBottom: "var(--sp-3)", borderBottom: "1px solid var(--bdr-subtle)",
    }}>
      <div style={{
        width: "30px", height: "30px", borderRadius: "50%", flexShrink: 0,
        background: bg, color, display: "grid", placeItems: "center",
      }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: "var(--fs-sm)", color: "var(--txt-primary)", lineHeight: 1.4 }}>{text}</div>
        <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", marginTop: "3px" }}>{time}</div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   DASHBOARD — role-aware entry point (8.0e)
   HR + Admin (isHRTier — both are company-wide, see AuthContext) get the
   full org-wide dashboard below. Manager + Employee get the compact
   self-service variant (My Leave, upcoming holidays, and for Manager a
   client-side department-scoped team strip).
═══════════════════════════════════════════ */
function Dashboard() {
  const { isHRTier } = useAuth();
  return isHRTier ? <AdminDashboard /> : <SelfServiceDashboard />;
}

/* ═══════════════════════════════════════════
   ADMIN DASHBOARD — org-wide, shared by HR + Admin (isHRTier)
═══════════════════════════════════════════ */
function AdminDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    employees, attendance, departments, getEmployeeCountByDepartment, getAppNow,
    candidates, unreadNotificationCount,
  } = useStore();

  // ── Stats ──
  const totalEmployees = employees.length;
  const presentCount   = attendance.filter((a) => a.status === "Present").length;
  const attendanceRate = attendance.length > 0
    ? Math.round((presentCount / attendance.length) * 100) : 0;
  const onLeave  = employees.filter((e) => e.status === "On Leave").length;
  const now      = getAppNow();
  const curMonth = now.getMonth();
  const curYear  = now.getFullYear();
  const newHires = employees.filter((e) => {
    const d = new Date(e.createdAt);
    return d.getMonth() === curMonth && d.getFullYear() === curYear;
  }).length;

  // ── Row 2 operational stats (real data) ──
  const [pendingLeaveCount, setPendingLeaveCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    LeaveRequestsAPI.list()
      .then((res) => {
        if (cancelled) return;
        const items = res.items || [];
        setPendingLeaveCount(items.filter((r) => r.status === "pending").length);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const openPipelineCount = candidates.filter((c) => c.stage !== "Hired" && c.stage !== "Rejected").length;

  // Mirrors the mockup's second stat row's fourth cell: completed/total
  // performance reviews for the current cycle. Best-effort — the backend
  // endpoints are still landing (see PERFORMANCE_REVIEWS_TASK_SPLIT.md), so
  // a failed fetch just leaves the counts at 0 rather than erroring the
  // whole dashboard.
  const [performanceStats, setPerformanceStats] = useState({ completed: 0, total: 0 });
  useEffect(() => {
    let cancelled = false;
    PerformanceReviewsAPI.cycles()
      .then((res) => {
        if (cancelled) return;
        const cycleList = res.items ?? res.data ?? [];
        const openCycle = cycleList.find((c) => c.status === "Open");
        if (!openCycle) return null;
        return PerformanceReviewsAPI.roster(openCycle.key);
      })
      .then((res) => {
        if (cancelled || !res) return;
        const rows = res.items ?? res.data ?? [];
        const completed = rows.filter((r) => r.selfRating != null && r.managerRating != null).length;
        setPerformanceStats({ completed, total: rows.length });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // ── Contract mix data (mockup uses a tiered grayscale, not a rainbow) ──
  const contractSegs = [
    { label: "Full-time", value: employees.filter((e) => e.type === "Full-time").length, color: "var(--txt-primary-brand)" },
    { label: "Part-time", value: employees.filter((e) => e.type === "Part-time").length, color: "var(--txt-primary)" },
    { label: "Contract",  value: employees.filter((e) => e.type === "Contract").length,  color: "var(--txt-secondary)" },
    { label: "Intern",    value: employees.filter((e) => e.type === "Intern").length,    color: "var(--txt-disabled)" },
  ].filter((s) => s.value > 0);

  // ── Recent employees ──
  const recent = [...employees]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);

  // ── Activity feed (mock) ──
  const iconProps = { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  const activities = [
    {
      icon: <svg {...iconProps}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6" /><path d="M22 11h-6" /></svg>,
      bg: "var(--bg-success-subtle)", color: "var(--txt-success)",
      text: t("dashboard.recentActivity.newEmployee", { name: employees[employees.length - 1]?.name || t("dashboard.recentActivity.defaultNewEmployee") }), time: t("dashboard.recentActivity.time.minutesAgo"),
    },
    {
      icon: <svg {...iconProps}><rect x="4" y="4" width="16" height="18" rx="1" /><path d="M9 2h6v4H9z" /><path d="M8 11h8M8 15h5" /></svg>,
      bg: "var(--bg-warning-subtle)", color: "var(--txt-warning)",
      text: t("dashboard.recentActivity.onLeave", { count: onLeave }), time: t("dashboard.recentActivity.time.hourAgo"),
    },
    {
      icon: <svg {...iconProps}><circle cx="12" cy="12" r="9" /><path d="M12 7v10M9 9.5a2.5 2.5 0 0 1 2.5-2.5h1a2.5 2.5 0 0 1 0 5h-1a2.5 2.5 0 0 0 0 5h1a2.5 2.5 0 0 0 2.5-2.5" /></svg>,
      bg: "var(--bg-primary-subtle)", color: "var(--txt-primary-brand)",
      text: t("dashboard.recentActivity.payrollApproved"), time: t("dashboard.recentActivity.time.hoursAgo"),
    },
    {
      icon: <svg {...iconProps}><path d="M3 3v18h18" /><path d="M7 16l4-6 3 3 5-8" /></svg>,
      bg: "var(--bg-info-subtle)", color: "var(--txt-info)",
      text: t("dashboard.recentActivity.attendanceToday", { rate: attendanceRate }), time: t("dashboard.recentActivity.time.today"),
    },
    {
      icon: <svg {...iconProps}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>,
      bg: "var(--bg-danger-subtle)", color: "var(--txt-danger)",
      text: t("dashboard.recentActivity.pendingApprovals"), time: t("dashboard.recentActivity.time.yesterday"),
    },
  ];

  return (
    <div className="dashboard">

      {/* ── ROW 1: org-wide stats ── */}
      <div className="stat-strip">
        <StripStatCell
          label={t("dashboard.stats.totalEmployees.title")}
          value={totalEmployees}
          trend={t("dashboard.stats.totalEmployees.hint", { count: departments.length })}
          onClick={() => navigate("/employees")}
        />
        <StripStatCell
          label={t("dashboard.stats.attendanceRate.title")}
          value={`${attendanceRate}%`}
          trend={t("dashboard.stats.attendanceRate.hint", { present: presentCount, total: attendance.length })}
          onClick={() => navigate("/attendance")}
        />
        <StripStatCell
          label={t("dashboard.stats.onLeave.title")}
          value={onLeave}
          trend={t("dashboard.stats.onLeave.hint")}
          onClick={() => navigate("/employees")}
        />
        <StripStatCell
          label={t("dashboard.stats.newHires.title")}
          value={newHires}
          trend={t("dashboard.stats.newHires.hint")}
          onClick={() => navigate("/employees")}
        />
      </div>

      {/* ── ROW 2: operational stats (real data — see note above) ── */}
      <div className="stat-strip" style={{ marginTop: "var(--sp-5)" }}>
        <StripStatCell
          small
          label="Pending Leave Requests"
          value={pendingLeaveCount}
          trend="Awaiting review"
          onClick={() => navigate("/holidays")}
        />
        <StripStatCell
          small
          label="Open Pipeline"
          value={openPipelineCount}
          trend="Active candidates"
          onClick={() => navigate("/candidates")}
        />
        <StripStatCell
          small
          label="Unread Notifications"
          value={unreadNotificationCount}
          trend="Since last visit"
          onClick={() => navigate("/notifications")}
        />
        <StripStatCell
          small
          label="Performance Reviews"
          value={`${performanceStats.completed}/${performanceStats.total}`}
          trend="Completed this cycle"
          onClick={() => navigate("/performance")}
        />
      </div>

      {/* ── ROW 3: Attendance Trend + Headcount ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "var(--sp-5)", minWidth: 0 }}>

        {/* Attendance trend - last 7 days */}
        <div className="content-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "var(--sp-5)" }}>
            <div>
              <h3 className="section-title" style={{ margin: 0 }}>{t("dashboard.attendanceTrend.title")}</h3>
              <p style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", marginTop: "2px" }}>
                {t("dashboard.attendanceTrend.subtitle")}
              </p>
            </div>
            <Link to="/attendance" style={{ fontSize: "var(--fs-xs)", color: "var(--txt-primary-brand)", textDecoration: "none", fontWeight: "var(--fw-medium)", whiteSpace: "nowrap" }}>
              {t("dashboard.attendanceTrend.viewDetails")}
            </Link>
          </div>
          <AttendanceTrendChart attendance={attendance} totalStaff={totalEmployees} />
          {/* Legend */}
          <div style={{ display: "flex", gap: "var(--sp-4)", marginTop: "var(--sp-3)", flexWrap: "wrap" }}>
            {[
              { label: t("dashboard.attendanceTrend.legend.good"), color: "var(--clr-success-400)" },
              { label: t("dashboard.attendanceTrend.legend.average"), color: "var(--clr-warning-400)" },
              { label: t("dashboard.attendanceTrend.legend.low"), color: "var(--clr-danger-400)" },
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
              <h3 className="section-title" style={{ margin: 0 }}>{t("dashboard.headcount.title")}</h3>
              <p style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", marginTop: "2px" }}>
                {t("dashboard.headcount.subtitle")}
              </p>
            </div>
            <Link to="/departments" style={{ fontSize: "var(--fs-xs)", color: "var(--txt-primary-brand)", textDecoration: "none", fontWeight: "var(--fw-medium)", whiteSpace: "nowrap" }}>
              {t("dashboard.headcount.viewAll")}
            </Link>
          </div>
          <DeptBars departments={departments} getEmployeeCountByDepartment={getEmployeeCountByDepartment} />
        </div>
      </div>

      {/* ── ROW 4: Recent Employees + (Contract Mix / Recent Activity) ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: "var(--sp-5)" }}>

        {/* Recent employees table */}
        <div className="content-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--sp-5)" }}>
            <h3 className="section-title" style={{ margin: 0 }}>{t("dashboard.recentEmployees.title")}</h3>
            <Link to="/employees" style={{ fontSize: "var(--fs-xs)", color: "var(--txt-primary-brand)", textDecoration: "none", fontWeight: "var(--fw-medium)" }}>
              {t("dashboard.recentEmployees.viewAll")}
            </Link>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("dashboard.recentEmployees.table.employee")}</th>
                <th>{t("dashboard.recentEmployees.table.department")}</th>
                <th>{t("dashboard.recentEmployees.table.designation")}</th>
                <th>{t("dashboard.recentEmployees.table.status")}</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((emp) => (
                <tr key={emp.id} className="employee-row-clickable"
                  onClick={() => { window.location.href = `/employees/${emp.id}`; }}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
                      <Avatar name={emp.name} src={emp.avatar} size="sm" />
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

        {/* Right col: Contract Mix + Activity */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-5)" }}>

          {/* Contract mix */}
          <div className="content-card">
            <h3 className="section-title" style={{ marginBottom: "var(--sp-5)" }}>{t("dashboard.contractTypes.title")}</h3>
            <ContractMixBar segments={contractSegs} total={totalEmployees} />
          </div>

          {/* Activity feed */}
          <div className="content-card" style={{ flex: 1 }}>
            <h3 className="section-title" style={{ marginBottom: "var(--sp-4)" }}>{t("dashboard.recentActivity.title")}</h3>
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

/* ─────────────────────────────────────────
   Leave status badge (pending/approved/rejected)
───────────────────────────────────────── */
function LeaveStatusBadge({ status }) {
  const variant = status === "approved" ? "success" : status === "rejected" ? "danger" : "warning";
  const label = status ? status.charAt(0).toUpperCase() + status.slice(1) : "—";
  return <Badge variant={variant} size="sm" dot>{label}</Badge>;
}

/* ═══════════════════════════════════════════
   SELF-SERVICE DASHBOARD — Manager + Employee (8.0e)
   "My Leave" table + upcoming holidays, shared by both.
   Manager additionally gets a "your team" stat strip,
   client-side filtered to department === me.department
   over the existing full-list fetches (no backend
   department scoping exists yet — see 8.0e's audit).
═══════════════════════════════════════════ */
function SelfServiceDashboard() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { isManager, isManagerTier, user } = useAuth();
  const { currency } = useCurrency();
  const { holidays, employees, attendance, getAppNow } = useStore();

  const [myProfile, setMyProfile] = useState(null);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [leaveBalance, setLeaveBalance] = useState(null);
  const [lastPayslip, setLastPayslip] = useState(null);
  const [loadingLeave, setLoadingLeave] = useState(true);
  const [leaveError, setLeaveError] = useState("");
  const [applyOpen, setApplyOpen] = useState(false);

  const loadLeaveData = useCallback(async () => {
    setLoadingLeave(true);
    setLeaveError("");
    try {
      const [profileRes, listRes, balRes, payslipsRes] = await Promise.all([
        EmployeesAPI.myProfile(),
        LeaveRequestsAPI.list(),
        LeaveRequestsAPI.balance(),
        // Self-service, same endpoint ViewEmployee's Salary tab uses —
        // returns only approved/paid periods, most recent first. Swallow
        // errors rather than blocking the rest of the dashboard on it.
        PayrollAPI.myPayslips().catch(() => ({ items: [] })),
      ]);
      setMyProfile(profileRes.data ?? null);
      setLeaveRequests(listRes.items || []);
      setLeaveBalance(balRes.data ?? null);
      setLastPayslip((payslipsRes.items || [])[0] ?? null);
    } catch (err) {
      setLeaveError(err.message || "Could not load leave data.");
    } finally {
      setLoadingLeave(false);
    }
  }, []);

  useEffect(() => {
    loadLeaveData();
  }, [loadLeaveData]);

  const handleApplyLeave = async (payload) => {
    await LeaveRequestsAPI.create(payload);
    await loadLeaveData();
  };

  // For MANAGER (and ADMIN) the list endpoint returns everyone's requests,
  // so narrow down to mine for "My Leave". EMPLOYEE already gets only its
  // own set from the backend, but the filter is harmless either way.
  const myLeaveRequests = myProfile
    ? [...leaveRequests]
        .filter((r) => idsMatch(r.employeeId, myProfile.id))
        .sort((a, b) => new Date(b.appliedAt || b.createdAt) - new Date(a.appliedAt || a.createdAt))
    : [];
  const myPendingLeaveCount = myLeaveRequests.filter((r) => r.status === "pending").length;

  const now = getAppNow();
  const upcomingHolidays = [...holidays]
    .filter((h) => new Date(h.date) >= now)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 5);

  const myDepartment = myProfile?.department;
  const teamEmployees = isManager && myDepartment
    ? employees.filter((e) => e.department === myDepartment)
    : [];
  const teamHeadcount = teamEmployees.length;
  const teamAttendanceRecords = isManager && myDepartment
    ? attendance.filter((a) => {
        const emp = employees.find((e) => idsMatch(e.id, a.employeeId));
        return emp && emp.department === myDepartment;
      })
    : [];
  const teamPresentCount = teamAttendanceRecords.filter((a) => a.status === "Present").length;
  const teamAttendanceRate = teamAttendanceRecords.length > 0
    ? Math.round((teamPresentCount / teamAttendanceRecords.length) * 100) : 0;
  const teamPendingApprovals = isManager && myDepartment
    ? leaveRequests.filter((r) => {
        if (r.status !== "pending") return false;
        const emp = employees.find((e) => idsMatch(e.id, r.employeeId));
        return emp && emp.department === myDepartment;
      }).length
    : 0;

  return (
    <div className="dashboard">
      <div className="toolbar" style={{ marginBottom: "var(--sp-5)" }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0 }}>{t("dashboard.title", { defaultValue: "Dashboard" })}</h2>
          <p style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)", marginTop: "2px" }}>
            Welcome back{user?.name ? `, ${user.name}` : ""}.
          </p>
        </div>
        <Button variant="primary" onClick={() => setApplyOpen(true)}>
          Apply for Leave
        </Button>
      </div>

      {/* Personal stats — every self-service role (Employee, and Manager as
          an employee in their own right) gets these three, matching the
          design's PTO/Pending/Last Payslip row. */}
      <div className="stat-grid" style={{ marginBottom: "var(--sp-5)" }}>
        <StatCard
          title="PTO Days Remaining"
          value={leaveBalance ? leaveBalance.remaining : "—"}
          hint={leaveBalance ? `of ${leaveBalance.total} Annual/PTO` : "Leave balance unavailable"}
          accentColor="var(--clr-primary-400)"
        />
        <StatCard
          title="Pending Leave Requests"
          value={myPendingLeaveCount}
          hint="Awaiting review"
          accentColor="var(--clr-warning-600)"
        />
        <StatCard
          title="Last Payslip (Net)"
          value={lastPayslip ? fmtMoney(lastPayslip.netPay, currency, lastPayslip.fxRate) : "—"}
          hint={lastPayslip ? lastPayslip.periodLabel : "No payslips yet"}
          accentColor="var(--clr-success-600)"
        />
      </div>

      {isManager && (
        <div className="stat-grid" style={{ marginBottom: "var(--sp-5)" }}>
          <StatCard
            title="Your Team"
            value={teamHeadcount}
            hint={myDepartment ? `${myDepartment} department` : "No department linked to your profile"}
            accentColor="var(--clr-primary-400)"
          />
          <StatCard
            title="Pending Approvals"
            value={teamPendingApprovals}
            hint="Leave requests awaiting your review"
            accentColor="var(--clr-warning-600)"
          />
          <StatCard
            title="Team Attendance"
            value={`${teamAttendanceRate}%`}
            hint={`${teamPresentCount} of ${teamAttendanceRecords.length} records present`}
            accentColor="var(--clr-success-600)"
          />
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "var(--sp-5)", alignItems: "start" }}>
        {/* My Leave */}
        <div className="content-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "var(--sp-5)" }}>
            <div>
              <h3 className="section-title" style={{ margin: 0 }}>My leave requests</h3>
              <p style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", marginTop: "2px" }}>
                Recent requests and their status
              </p>
            </div>
            {user?.employeeId && (
              <Link
                to={`/employees/${user.employeeId}?tab=leave`}
                style={{ fontSize: "var(--fs-xs)", color: "var(--txt-primary-brand)", textDecoration: "none", fontWeight: "var(--fw-medium)", whiteSpace: "nowrap" }}
              >
                View leave →
              </Link>
            )}
          </div>

          {leaveError && <p className="form-error">{leaveError}</p>}

          {loadingLeave ? (
            <div className="skeleton skeleton-text" style={{ width: "60%" }} />
          ) : myLeaveRequests.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--txt-disabled)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <path d="M16 2v4M8 2v4M3 10h18" />
                </svg>
              </div>
              <div className="empty-state-title">No leave requests yet</div>
              <div className="empty-state-description">Apply for leave and it&apos;ll show up here.</div>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Dates</th>
                  <th>Days</th>
                  <th>Type</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {myLeaveRequests.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontSize: "var(--fs-sm)" }}>
                      {formatDate(r.startDate, language)} – {formatDate(r.endDate, language)}
                    </td>
                    <td style={{ fontSize: "var(--fs-sm)" }}>{r.days}</td>
                    <td style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)" }}>
                      {leaveTypeLabel(r.type)}
                    </td>
                    <td><LeaveStatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Upcoming holidays */}
        <div className="content-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "var(--sp-4)" }}>
            <h3 className="section-title" style={{ margin: 0 }}>Upcoming company holidays</h3>
            {/* /holidays is requireManager (App.jsx) — plain Employee has no
                reachable destination for a full list, so the link is
                omitted rather than pointing at a dead end. */}
            {isManagerTier && (
              <Link
                to="/holidays"
                style={{ fontSize: "var(--fs-xs)", color: "var(--txt-primary-brand)", textDecoration: "none", fontWeight: "var(--fw-medium)", whiteSpace: "nowrap" }}
              >
                View all →
              </Link>
            )}
          </div>
          {upcomingHolidays.length === 0 ? (
            <p style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)" }}>
              No upcoming holidays scheduled.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
              {upcomingHolidays.map((h) => (
                <div key={h.id} style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
                  <div style={{
                    width: "38px", height: "38px", borderRadius: "var(--radius-md)",
                    background: "var(--bg-info-subtle)", color: "var(--txt-info)",
                    display: "grid", placeItems: "center", flexShrink: 0,
                  }}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="3" y="4" width="18" height="18" rx="2" />
                      <path d="M16 2v4M8 2v4M3 10h18" />
                    </svg>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "var(--fs-sm)", fontWeight: "var(--fw-medium)", color: "var(--txt-primary)" }}>
                      {h.name}
                    </div>
                    <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)" }}>
                      {formatDate(h.date, language)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {applyOpen && (
        <ApplyLeaveModal
          onClose={() => setApplyOpen(false)}
          onSubmit={handleApplyLeave}
        />
      )}
    </div>
  );
}

export default Dashboard;
