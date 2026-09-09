import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useStore } from "../../context/StoreContext";
import { useNotifications } from "../../context/NotificationContext";
import { LeaveRequestsAPI, PerformanceReviewsAPI } from "../../api";
import Avatar from "../../components/Avatar";
import { StatusBadge } from "../../components/Badge";
import AttendanceTrendChart from "../../components/AttendanceTrendChart";
import { ContractMixBar } from '../../components/charts/ContractMixBar'
import { DeptBars } from '../../components/charts/DeptBars'

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
   ADMIN DASHBOARD — org-wide, shared by HR + Admin (isHRTier)
═══════════════════════════════════════════ */
export function AdminDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    employees, attendance, departments, getEmployeeCountByDepartment, getAppNow,
    candidates,
  } = useStore();
  const { unreadNotificationCount } = useNotifications();

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
          label={t("dashboard.opsStats.pendingLeaveRequests", { defaultValue: "Pending Leave Requests" })}
          value={pendingLeaveCount}
          trend={t("dashboard.opsStats.awaitingReview", { defaultValue: "Awaiting review" })}
          onClick={() => navigate("/holidays")}
        />
        <StripStatCell
          small
          label={t("dashboard.opsStats.openPipeline", { defaultValue: "Open Pipeline" })}
          value={openPipelineCount}
          trend={t("dashboard.opsStats.activeCandidates", { defaultValue: "Active candidates" })}
          onClick={() => navigate("/candidates")}
        />
        <StripStatCell
          small
          label={t("dashboard.opsStats.unreadNotifications", { defaultValue: "Unread Notifications" })}
          value={unreadNotificationCount}
          trend={t("dashboard.opsStats.sinceLastVisit", { defaultValue: "Since last visit" })}
          onClick={() => navigate("/notifications")}
        />
        <StripStatCell
          small
          label={t("dashboard.opsStats.performanceReviews", { defaultValue: "Performance Reviews" })}
          value={`${performanceStats.completed}/${performanceStats.total}`}
          trend={t("dashboard.opsStats.completedThisCycle", { defaultValue: "Completed this cycle" })}
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
          <AttendanceTrendChart attendance={attendance} employees={employees} />
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
