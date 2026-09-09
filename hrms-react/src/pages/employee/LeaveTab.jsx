import { useState, useMemo, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useLanguage } from "../../context/LanguageContext";
import { formatDate } from "../../utils/format";
import { LeaveRequestsAPI } from "../../api";
import Badge from "../../components/Badge";
import { idsMatch } from "../../utils/id";
import { leaveTypeLabel } from "../../utils/leaveTypes";
import Button from "../../components/Button";
import { translateApiError } from "../../utils/apiError";

function capitalizeFirst(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function LeaveStatusBadge({ status }) {
  const { t } = useTranslation();
  const variant = status === "approved" ? "success" : status === "rejected" ? "danger" : "warning";
  const label = status ? capitalizeFirst(t(`employees.allEmployees.editRequests.tabs.${status}`, { defaultValue: status })) : "—";
  return <Badge variant={variant} size="sm" dot>{label}</Badge>;
}

/**
 * LeaveTab — ledger + request history for this employee (8.0e Day 7),
 * reusing the same LeaveRequest data as the self-service dashboard. When a
 * Manager is viewing their own record, also shows a "pending approvals —
 * your team" panel, client-side filtered to department === me.department
 * (same audit constraint as the Dashboard's team strip — no backend scoping
 * exists, so this is a display convenience, not an access boundary).
 */
export function LeaveTab({ employee, employees, isManager, isOwnRecord }) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [leaveBalance, setLeaveBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reviewingId, setReviewingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [listRes, balRes] = await Promise.all([
        LeaveRequestsAPI.list(),
        LeaveRequestsAPI.balance({ employeeId: employee.id }),
      ]);
      setLeaveRequests(listRes.items || []);
      setLeaveBalance(balRes.data ?? null);
    } catch (err) {
      setError(translateApiError(err, t) || t("employees.viewEmployee.leaveTab.loadError", { defaultValue: "Could not load leave data." }));
    } finally {
      setLoading(false);
    }
  }, [employee.id, t]);

  useEffect(() => {
    load();
  }, [load]);

  const employeeRequests = useMemo(
    () =>
      [...leaveRequests]
        .filter((r) => idsMatch(r.employeeId, employee.id))
        .sort((a, b) => new Date(b.appliedAt || b.createdAt) - new Date(a.appliedAt || a.createdAt)),
    [leaveRequests, employee.id],
  );

  const teamPending = useMemo(() => {
    if (!isManager || !isOwnRecord || !employee.department) return [];
    return leaveRequests
      .filter((r) => r.status === "pending" && !idsMatch(r.employeeId, employee.id))
      .filter((r) => {
        const emp = employees.find((e) => idsMatch(e.id, r.employeeId));
        return emp && emp.department === employee.department;
      });
  }, [leaveRequests, employees, employee.id, employee.department, isManager, isOwnRecord]);

  const handleTeamReview = async (id, decision) => {
    setReviewingId(id);
    try {
      await LeaveRequestsAPI.review(id, decision);
      await load();
    } catch (err) {
      setError(translateApiError(err, t) || t("employees.viewEmployee.leaveTab.updateError", { defaultValue: "Could not update the request." }));
    } finally {
      setReviewingId(null);
    }
  };

  if (loading) {
    return <div className="skeleton skeleton-text" style={{ width: "50%" }} />;
  }

  return (
    <div>
      {error && <p className="form-error">{error}</p>}

      {isManager && teamPending.length > 0 && (
        <div style={{
          border: "1px solid var(--bdr-warning)", borderRadius: "var(--radius-lg)",
          background: "var(--bg-warning-subtle)", padding: "var(--sp-4) var(--sp-5)",
          marginBottom: "var(--sp-5)",
        }}>
          <h4 style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-semibold)", color: "var(--txt-primary)", margin: 0 }}>
            {t("employees.viewEmployee.leaveTab.teamPendingTitle", { defaultValue: "Pending Approvals — Your Team" })}
          </h4>
          <p style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", marginTop: "2px", marginBottom: "var(--sp-3)" }}>
            {t("employees.viewEmployee.leaveTab.teamPendingDesc", { count: teamPending.length, department: employee.department, defaultValue_one: "{{count}} request from {{department}} awaiting review", defaultValue_other: "{{count}} requests from {{department}} awaiting review" })}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
            {teamPending.map((r) => {
              const isReviewing = reviewingId === r.id;
              return (
                <div key={r.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  gap: "var(--sp-3)", fontSize: "var(--fs-sm)", flexWrap: "wrap",
                  background: "var(--bg-surface)", border: "1px solid var(--bdr-subtle)",
                  borderRadius: "var(--radius-md)", padding: "var(--sp-2) var(--sp-3)",
                }}>
                  <span style={{ fontWeight: "var(--fw-medium)" }}>{r.employeeName}</span>
                  <span style={{ color: "var(--txt-secondary)" }}>
                    {formatDate(r.startDate, language)} – {formatDate(r.endDate, language)} · {r.days}d · {leaveTypeLabel(r.type, t)}
                  </span>
                  <div style={{ display: "flex", gap: "var(--sp-1)" }}>
                    <Button
                      variant="link"
                      disabled={isReviewing}
                      onClick={() => handleTeamReview(r.id, "approved")}
                    >
                      {isReviewing ? "…" : t("common.actions.approve", { defaultValue: "Approve" })}
                    </Button>
                    <Button
                      variant="link"
                      className="btn-link-muted"
                      disabled={isReviewing}
                      onClick={() => handleTeamReview(r.id, "rejected")}
                    >
                      {isReviewing ? "…" : t("common.actions.reject", { defaultValue: "Reject" })}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ marginBottom: "var(--sp-6)" }}>
        <h3 style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-semibold)", margin: 0 }}>
          {t("employees.viewEmployee.leaveTab.balanceTitle", { defaultValue: "Leave balance" })}
        </h3>
        <p style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)", marginTop: "2px", marginBottom: "var(--sp-4)" }}>
          {leaveBalance ? t("employees.viewEmployee.leaveTab.balanceForYear", { defaultValue: "For {{year}}", year: leaveBalance.year }) : t("employees.viewEmployee.leaveTab.balanceGeneric", { defaultValue: "Paid and unpaid leave usage" })}
        </p>

        <div className="table-wrap">
          <table className="data-table" style={{ fontSize: "var(--fs-sm)" }}>
            <thead>
              <tr>
                <th>{t("common.columns.type", { defaultValue: "Type" })}</th>
                <th>{t("employees.viewEmployee.leaveTab.colAccrued", { defaultValue: "Accrued" })}</th>
                <th>{t("employees.viewEmployee.leaveTab.colUsed", { defaultValue: "Used" })}</th>
                <th>{t("employees.viewEmployee.leaveTab.colRemaining", { defaultValue: "Remaining" })}</th>
              </tr>
            </thead>
            <tbody>
              {(leaveBalance?.balances ?? []).map((b) => (
                <tr key={b.type}>
                  <td>{b.label}</td>
                  <td>{b.accrued ?? t("employees.viewEmployee.leaveTab.unlimited", { defaultValue: "Unlimited" })}</td>
                  <td>{b.used}</td>
                  <td>{b.remaining ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-semibold)", margin: 0, marginBottom: "var(--sp-4)" }}>
          {t("employees.viewEmployee.leaveTab.historyTitle", { defaultValue: "Request history" })}
        </h3>

        {employeeRequests.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--txt-disabled)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
            </div>
            <div className="empty-state-title">{t("employees.viewEmployee.leaveTab.noRequestsTitle", { defaultValue: "No leave requests on file" })}</div>
            <div className="empty-state-description">{t("employees.viewEmployee.leaveTab.noRequestsDesc", { defaultValue: "Requests this employee submits will show up here." })}</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table" style={{ fontSize: "var(--fs-sm)" }}>
              <thead>
                <tr>
                  <th>{t("employees.viewEmployee.leaveTab.colDates", { defaultValue: "Dates" })}</th>
                  <th>{t("employees.viewEmployee.leaveTab.colDays", { defaultValue: "Days" })}</th>
                  <th>{t("common.columns.type", { defaultValue: "Type" })}</th>
                  <th>{t("employees.viewEmployee.leaveTab.colReason", { defaultValue: "Reason" })}</th>
                  <th>{t("common.fieldLabels.status", { defaultValue: "Status" })}</th>
                </tr>
              </thead>
              <tbody>
                {employeeRequests.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDate(r.startDate, language)} – {formatDate(r.endDate, language)}</td>
                    <td>{r.days}</td>
                    <td style={{ color: "var(--txt-secondary)" }}>{leaveTypeLabel(r.type, t)}</td>
                    <td style={{ color: "var(--txt-secondary)" }}>{r.reason || "—"}</td>
                    <td><LeaveStatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
