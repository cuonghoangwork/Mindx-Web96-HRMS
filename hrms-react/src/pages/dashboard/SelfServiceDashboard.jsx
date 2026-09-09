import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useStore } from "../../context/StoreContext";
import { useAuth } from "../../context/AuthContext";
import { useCurrency } from "../../context/CurrencyContext";
import { EmployeesAPI, LeaveRequestsAPI, PayrollAPI } from "../../api";
import { useLanguage } from "../../context/LanguageContext";
import { formatDate } from "../../utils/format";
import { fmtMoney } from "../../utils/payroll";
import { idsMatch } from "../../utils/id";
import { leaveTypeLabel } from "../../utils/leaveTypes";
import Button from "../../components/Button";
import ApplyLeaveModal from "../../components/ApplyLeaveModal";
import { translateApiError } from "../../utils/apiError";
import { StatCard } from '../../components/charts/StatCard'
import { LeaveStatusBadge } from "../../components/LeaveStatusBadge";

/* ─────────────────────────────────────────
   Leave status badge (pending/approved/rejected)
───────────────────────────────────────── */
/* ═══════════════════════════════════════════
   SELF-SERVICE DASHBOARD — Manager + Employee (8.0e)
   "My Leave" table + upcoming holidays, shared by both.
   Manager additionally gets a "your team" stat strip,
   client-side filtered to department === me.department
   over the existing full-list fetches (no backend
   department scoping exists yet — see 8.0e's audit).
═══════════════════════════════════════════ */
export function SelfServiceDashboard() {
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
      setLeaveError(translateApiError(err, t) || t("dashboard.myLeave.loadFailed", { defaultValue: "Could not load leave data." }));
    } finally {
      setLoadingLeave(false);
    }
  }, [t]);

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
          <p className="hint-sm">
            {t("dashboard.welcomeBack", { nameSuffix: user?.name ? `, ${user.name}` : "", defaultValue: "Welcome back{{nameSuffix}}." })}
          </p>
        </div>
        <Button variant="primary" onClick={() => setApplyOpen(true)}>
          {t("dashboard.myLeave.applyButton", { defaultValue: "Apply for Leave" })}
        </Button>
      </div>

      {/* Personal stats — every self-service role (Employee, and Manager as
          an employee in their own right) gets these three, matching the
          design's PTO/Pending/Last Payslip row. */}
      <div className="stat-grid" style={{ marginBottom: "var(--sp-5)" }}>
        <StatCard
          title={t("dashboard.myStats.ptoRemaining", { defaultValue: "PTO Days Remaining" })}
          value={leaveBalance ? leaveBalance.remaining : "—"}
          hint={leaveBalance ? t("dashboard.myStats.ptoHintWithTotal", { total: leaveBalance.total, defaultValue: "of {{total}} Annual/PTO" }) : t("dashboard.myStats.ptoHintUnavailable", { defaultValue: "Leave balance unavailable" })}
          accentColor="var(--clr-primary-400)"
        />
        <StatCard
          title={t("dashboard.opsStats.pendingLeaveRequests", { defaultValue: "Pending Leave Requests" })}
          value={myPendingLeaveCount}
          hint={t("dashboard.opsStats.awaitingReview", { defaultValue: "Awaiting review" })}
          accentColor="var(--clr-warning-600)"
        />
        <StatCard
          title={t("dashboard.myStats.lastPayslip", { defaultValue: "Last Payslip (Net)" })}
          value={lastPayslip ? fmtMoney(lastPayslip.netPay, currency, lastPayslip.fxRate) : "—"}
          hint={lastPayslip ? lastPayslip.periodLabel : t("dashboard.myStats.noPayslipsYet", { defaultValue: "No payslips yet" })}
          accentColor="var(--clr-success-600)"
        />
      </div>

      {isManager && (
        <div className="stat-grid" style={{ marginBottom: "var(--sp-5)" }}>
          <StatCard
            title={t("dashboard.teamStats.yourTeam", { defaultValue: "Your Team" })}
            value={teamHeadcount}
            hint={myDepartment ? t("dashboard.teamStats.deptSuffix", { dept: myDepartment, defaultValue: "{{dept}} department" }) : t("dashboard.teamStats.noDeptLinked", { defaultValue: "No department linked to your profile" })}
            accentColor="var(--clr-primary-400)"
          />
          <StatCard
            title={t("dashboard.teamStats.pendingApprovals", { defaultValue: "Pending Approvals" })}
            value={teamPendingApprovals}
            hint={t("dashboard.teamStats.pendingApprovalsHint", { defaultValue: "Leave requests awaiting your review" })}
            accentColor="var(--clr-warning-600)"
          />
          <StatCard
            title={t("dashboard.teamStats.teamAttendance", { defaultValue: "Team Attendance" })}
            value={`${teamAttendanceRate}%`}
            hint={t("dashboard.teamStats.teamAttendanceHint", { present: teamPresentCount, total: teamAttendanceRecords.length, defaultValue: "{{present}} of {{total}} records present" })}
            accentColor="var(--clr-success-600)"
          />
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "var(--sp-5)", alignItems: "start" }}>
        {/* My Leave */}
        <div className="content-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "var(--sp-5)" }}>
            <div>
              <h3 className="section-title" style={{ margin: 0 }}>{t("dashboard.myLeave.heading", { defaultValue: "My leave requests" })}</h3>
              <p className="hint-xs">
                {t("dashboard.myLeave.subtitle", { defaultValue: "Recent requests and their status" })}
              </p>
            </div>
            {user?.employeeId && (
              <Link
                to={`/employees/${user.employeeId}?tab=leave`}
                style={{ fontSize: "var(--fs-xs)", color: "var(--txt-primary-brand)", textDecoration: "none", fontWeight: "var(--fw-medium)", whiteSpace: "nowrap" }}
              >
                {t("dashboard.myLeave.viewLeaveLink", { defaultValue: "View leave →" })}
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
              <div className="empty-state-title">{t("dashboard.myLeave.emptyTitle", { defaultValue: "No leave requests yet" })}</div>
              <div className="empty-state-description">{t("dashboard.myLeave.emptyDescription", { defaultValue: "Apply for leave and it'll show up here." })}</div>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("holidays.leaveRequests.table.dates", { defaultValue: "Dates" })}</th>
                  <th>{t("holidays.leaveRequests.table.days", { defaultValue: "Days" })}</th>
                  <th>{t("common.columns.type", { defaultValue: "Type" })}</th>
                  <th>{t("common.columns.status", { defaultValue: "Status" })}</th>
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
                      {leaveTypeLabel(r.type, t)}
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
            <h3 className="section-title" style={{ margin: 0 }}>{t("dashboard.holidaysWidget.heading", { defaultValue: "Upcoming company holidays" })}</h3>
            {/* /holidays is requireManager (App.jsx) — plain Employee has no
                reachable destination for a full list, so the link is
                omitted rather than pointing at a dead end. */}
            {isManagerTier && (
              <Link
                to="/holidays"
                style={{ fontSize: "var(--fs-xs)", color: "var(--txt-primary-brand)", textDecoration: "none", fontWeight: "var(--fw-medium)", whiteSpace: "nowrap" }}
              >
                {t("dashboard.headcount.viewAll", { defaultValue: "View all →" })}
              </Link>
            )}
          </div>
          {upcomingHolidays.length === 0 ? (
            <p className="meta-sm">
              {t("dashboard.holidaysWidget.noneScheduled", { defaultValue: "No upcoming holidays scheduled." })}
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
                    <div className="meta-xs">
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
