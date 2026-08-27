import { useState, useCallback, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import { PromotionRequestsAPI, ProfileEditRequestsAPI } from "../api";
import { formatDate } from "../utils/format";
import { translateApiError } from "../utils/apiError";
import FilterModal from "../components/FilterModal";
import SearchBar from "../components/SearchBar";
import Avatar from "../components/Avatar";
import Badge, { StatusBadge, TypeBadge } from "../components/Badge";
import Button from "../components/Button";
import ProposePromotionModal from "../components/ProposePromotionModal";

const EMPLOYEES_PER_PAGE = 10;

const SORTABLE_COLUMNS = [
  { key: "name",        labelKey: "common.columns.employee",   defaultLabel: "Employee" },
  { key: "employeeId",  labelKey: "common.columns.id",         defaultLabel: "ID" },
  { key: "department",  labelKey: "common.fieldLabels.department", defaultLabel: "Department" },
  { key: "designation", labelKey: "common.columns.designation", defaultLabel: "Designation" },
  { key: "type",        labelKey: "common.columns.type",       defaultLabel: "Type" },
  { key: "status",      labelKey: "common.columns.status",     defaultLabel: "Status" },
];

/* ─────────────────────────────────────────
   Employee Detail Side Panel
───────────────────────────────────────── */
function SidePanel({ employee, onClose, onDelete, onStatusChange, canSeeSalary }) {
  const { t } = useTranslation();
  if (!employee) return null;

  const fields = [
    { label: t("common.fieldLabels.employeeId", { defaultValue: "Employee ID" }), value: employee.employeeId },
    { label: t("common.fieldLabels.department", { defaultValue: "Department" }),  value: employee.department },
    { label: t("common.fieldLabels.designation", { defaultValue: "Designation" }), value: employee.designation },
    { label: t("common.columns.type", { defaultValue: "Type" }),        value: employee.type, render: () => <TypeBadge type={employee.type} /> },
    { label: t("common.fieldLabels.age", { defaultValue: "Age" }),         value: employee.age || "—" },
    { label: t("common.fieldLabels.sex", { defaultValue: "Sex" }),      value: employee.sex ? t(`common.gender.${employee.sex}`, { defaultValue: employee.sex }) : "—" },
    { label: t("common.fieldLabels.email", { defaultValue: "Email" }),       value: employee.email || "—" },
    { label: t("common.fieldLabels.phone", { defaultValue: "Phone" }),       value: employee.phone || "—" },
    { label: t("common.fieldLabels.address", { defaultValue: "Address" }),     value: employee.address || "—" },
    // Salary — hidden from a plain EMPLOYEE viewing a colleague's card now
    // that Directory is open to every role (see App.jsx); MANAGER/HR/ADMIN
    // keep seeing it, matching this app's existing company-wide salary
    // visibility for those tiers (Payroll, "My Department" roster, etc.).
    ...(canSeeSalary
      ? [{ label: t("common.fieldLabels.salary", { defaultValue: "Salary" }), value: employee.salary ? `$${employee.salary.toLocaleString("en-US")}/yr` : "—" }]
      : []),
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(11,31,58,0.25)",
          backdropFilter: "blur(2px)",
          zIndex: "var(--z-overlay)",
        }}
      />

      {/* Panel */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0,
        width: "min(400px, 100vw)",
        background: "var(--bg-surface)",
        borderLeft: "1px solid var(--bdr-subtle)",
        boxShadow: "var(--shadow-xl)",
        zIndex: "var(--z-modal)",
        display: "flex", flexDirection: "column",
        animation: "slideIn 0.22s ease",
      }}>
        <style>{`
          @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to   { transform: translateX(0);    opacity: 1; }
          }
        `}</style>

        {/* Header */}
        <div style={{
          padding: "var(--sp-5) var(--sp-6)",
          borderBottom: "1px solid var(--bdr-subtle)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <span style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-semibold)", color: "var(--txt-primary)" }}>
            {t("employees.allEmployees.sidePanel.title", { defaultValue: "Employee Details" })}
          </span>
          <button
            type="button" onClick={onClose}
            style={{
              width: "32px", height: "32px", border: "1px solid var(--bdr-default)",
              borderRadius: "var(--radius-sm)", background: "transparent",
              cursor: "pointer", fontSize: "18px", color: "var(--txt-secondary)",
              display: "grid", placeItems: "center",
            }}
            aria-label={t("employees.allEmployees.sidePanel.closeAria", { defaultValue: "Close panel" })}
          >×</button>
        </div>

        {/* Profile */}
        <div style={{
          padding: "var(--sp-6)",
          borderBottom: "1px solid var(--bdr-subtle)",
          display: "flex", alignItems: "center", gap: "var(--sp-4)",
          flexShrink: 0,
        }}>
          <Avatar
            name={employee.name} src={employee.avatar} size="lg"
            status={employee.status === "Active" ? "active" : employee.status === "On Leave" ? "leave" : "terminated"}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "var(--fs-xl)", fontWeight: "var(--fw-semibold)", color: "var(--txt-primary)", marginBottom: "4px" }}>
              {employee.name}
            </div>
            <div style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)", marginBottom: "var(--sp-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {employee.designation} · {employee.department}
            </div>
            <StatusBadge status={employee.status} />
          </div>
        </div>

        {/* Fields */}
        <div style={{ flex: 1, overflowY: "auto", padding: "var(--sp-4) var(--sp-6)" }}>
          {fields.map(({ label, value, render }) => (
            <div key={label} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 0", borderBottom: "1px solid var(--bdr-subtle)", gap: "var(--sp-4)",
            }}>
              <span style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", textTransform: "uppercase", letterSpacing: "0.07em", flexShrink: 0 }}>
                {label}
              </span>
              <span style={{ fontSize: "var(--fs-sm)", fontWeight: "var(--fw-medium)", color: "var(--txt-primary)", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis" }}>
                {render ? render() : value}
              </span>
            </div>
          ))}

          {/* Quick status change */}
          <div style={{ marginTop: "var(--sp-5)" }}>
            <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "var(--sp-3)" }}>
              {t("employees.allEmployees.sidePanel.changeStatus", { defaultValue: "Change Status" })}
            </div>
            <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
              {["Active", "On Leave", "Terminated"].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onStatusChange(employee.id, s)}
                  style={{
                    padding: "6px 14px", borderRadius: "var(--radius-full)",
                    border: `1px solid ${employee.status === s ? "var(--bdr-brand)" : "var(--bdr-default)"}`,
                    background: employee.status === s ? "var(--bg-primary-subtle)" : "transparent",
                    color: employee.status === s ? "var(--txt-primary-brand)" : "var(--txt-secondary)",
                    fontSize: "var(--fs-xs)", fontWeight: "var(--fw-medium)",
                    cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
                  }}
                >
                  {t(`common.employeeStatus.${s}`, { defaultValue: s })}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{
          padding: "var(--sp-4) var(--sp-6)",
          borderTop: "1px solid var(--bdr-subtle)",
          display: "flex", gap: "var(--sp-3)",
          flexShrink: 0,
        }}>
          <Link
            to={`/employees/${employee.id}`}
            className="btn btn-primary"
            style={{ flex: 1, justifyContent: "center" }}
            onClick={onClose}
          >
            {t("employees.allEmployees.sidePanel.viewFullProfile", { defaultValue: "View Full Profile" })}
          </Link>
          <Button
            variant="danger"
            onClick={() => onDelete(employee.id)}
          >
            {t("common.actions.delete", { defaultValue: "Delete" })}
          </Button>
        </div>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────
   Bulk Action Bar
───────────────────────────────────────── */
function BulkActionBar({ count, onExport, onDelete, onStatusChange, onClear, canDelete }) {
  const { t } = useTranslation();
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "var(--sp-3)",
      padding: "var(--sp-3) var(--sp-4)",
      background: "var(--bg-primary-subtle)",
      border: "1px solid var(--bdr-brand)",
      borderRadius: "var(--radius-md)",
      marginBottom: "var(--sp-4)",
      flexWrap: "wrap",
    }}>
      <span style={{ fontSize: "var(--fs-sm)", fontWeight: "var(--fw-medium)", color: "var(--txt-primary-brand)", marginRight: "var(--sp-2)" }}>
        {t("employees.allEmployees.bulkBar.selected", { defaultValue: "{{count}} selected", count })}
      </span>

      <Button variant="secondary" size="sm" onClick={onExport}>
        ↓ {t("employees.allEmployees.toolbar.exportCsv", { defaultValue: "Export CSV" })}
      </Button>

      <div style={{ display: "flex", gap: "var(--sp-2)", alignItems: "center" }}>
        <span style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)" }}>{t("employees.allEmployees.bulkBar.setStatus", { defaultValue: "Set status:" })}</span>
        {["Active", "On Leave", "Terminated"].map((s) => (
          <Button variant="secondary" size="sm" key={s} onClick={() => onStatusChange(s)}>
            {t(`common.employeeStatus.${s}`, { defaultValue: s })}
          </Button>
        ))}
      </div>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
        {canDelete && (
          <Button variant="danger" size="sm" onClick={onDelete}>
            {t("employees.allEmployees.bulkBar.deleteSelected", { defaultValue: "Delete selected" })}
          </Button>
        )}

        <button
          type="button" onClick={onClear}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--txt-secondary)", fontSize: "18px", lineHeight: 1,
            padding: "2px 4px",
          }}
          aria-label={t("employees.allEmployees.bulkBar.clearSelectionAria", { defaultValue: "Clear selection" })}
        >×</button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   Pending Promotions — job-title/level/salary
   change requests awaiting admin review.
   Real data via PromotionRequestsAPI (already
   used in Settings > Promotions); surfaced here
   too since the mockup puts it on the roster page.
───────────────────────────────────────── */
const usdFmt = (n) => (n == null ? null : `$${Number(n).toLocaleString("en-US")}/yr`);

function PendingPromotionsPanel({ requests, onReview }) {
  const { t } = useTranslation();
  if (requests.length === 0) return null;
  return (
    <div className="content-card" style={{ marginBottom: "var(--sp-5)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", marginBottom: "var(--sp-4)" }}>
        <h3 className="section-title" style={{ margin: 0 }}>{t("employees.allEmployees.pendingPromotions.title", { defaultValue: "Pending promotions" })}</h3>
        <span className="badge badge-primary">{requests.length}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}>
        {requests.map((req) => (
          <div key={req.id} style={{
            display: "flex", alignItems: "flex-start", justifyContent: "space-between",
            gap: "var(--sp-4)", paddingBottom: "var(--sp-4)",
            borderBottom: "1px solid var(--bdr-subtle)", flexWrap: "wrap",
          }}>
            <div style={{ minWidth: "260px", flex: 1 }}>
              <div style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-semibold)", color: "var(--txt-primary)" }}>
                {req.employeeName}
              </div>
              <div style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)", marginTop: "2px" }}>
                {req.proposed?.designation} · {req.proposed?.positionLevel} level
                {req.proposed?.salary != null && ` · ${usdFmt(req.proposed.salary)}`}
              </div>
              <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", marginTop: "4px" }}>
                {req.effectiveDate && t("employees.allEmployees.pendingPromotions.effective", { defaultValue: "Effective {{date}}", date: formatDate(req.effectiveDate) })}
                {req.effectiveDate && req.reason ? " · " : ""}
                {req.reason}
              </div>
            </div>
            <div style={{ display: "flex", gap: "var(--sp-2)", flexShrink: 0 }}>
              <Button variant="primary" size="sm" onClick={() => onReview(req.id, "approved")}>{t("common.actions.approve", { defaultValue: "Approve" })}</Button>
              <Button variant="danger" size="sm" onClick={() => onReview(req.id, "rejected")}>{t("common.actions.reject", { defaultValue: "Reject" })}</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   Edit Requests tab — full review UI: status
   filter tabs, review notes, approve/reject
   with loading state, resolved history. Real
   data via ProfileEditRequestsAPI (review is
   MANAGER+ADMIN per profileEditRequestRouter.js).
   Ported from the old Settings > Profile Edit
   Requests panel — the mockup puts this queue
   under Employees, not Settings, but keeps the
   same full pending/approved/rejected/all
   review experience.
───────────────────────────────────────── */
const REQUEST_STATUS_VARIANT = { pending: "warning", approved: "success", rejected: "danger" };

function RequestFieldRow({ label, from, to }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "var(--sp-3)",
      padding: "8px 0", borderBottom: "1px solid var(--bdr-subtle)",
      fontSize: "var(--fs-sm)", flexWrap: "wrap",
    }}>
      <span style={{ color: "var(--txt-secondary)", minWidth: "80px", flexShrink: 0, textTransform: "capitalize" }}>{label}</span>
      <span style={{ color: "var(--txt-disabled)", textDecoration: "line-through" }}>{from || "—"}</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--txt-secondary)" strokeWidth="2" aria-hidden="true">
        <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <span style={{ color: "var(--clr-success-700)", fontWeight: "var(--fw-medium)" }}>{to || "—"}</span>
    </div>
  );
}

function EditRequestsPanel({ onChanged }) {
  const { t } = useTranslation();
  const [requests, setRequests]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [filterStatus, setFilter]     = useState("pending");
  const [reviewingId, setReviewingId] = useState(null);
  const [note, setNote]               = useState("");
  const [actionLoading, setActionL]   = useState(null);
  const [toast, setToast]             = useState("");

  const statusLabel = (s) => t(`employees.allEmployees.editRequests.tabs.${s}`, { defaultValue: s });

  const loadRequests = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await ProfileEditRequestsAPI.list({ status: filterStatus });
      setRequests(res.items ?? []);
    } catch (err) {
      setError(translateApiError(err, t) || t("employees.allEmployees.editRequests.loadFailed", { defaultValue: "Failed to load requests." }));
    }
    setLoading(false);
  }, [filterStatus, t]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  const handleReview = async (requestId, decision) => {
    setActionL(decision);
    try {
      await ProfileEditRequestsAPI.review(requestId, decision, note);
      setToast(decision === "approved" ? t("employees.allEmployees.editRequests.toastApproved", { defaultValue: "Profile update approved and applied." }) : t("employees.allEmployees.editRequests.toastRejected", { defaultValue: "Request rejected." }));
      setReviewingId(null);
      setNote("");
      loadRequests();
      onChanged?.();
    } catch (err) {
      setToast(t("employees.allEmployees.editRequests.toastErrorPrefix", { defaultValue: "Error: {{message}}", message: translateApiError(err, t) }));
    }
    setActionL(null);
  };

  return (
    <div className="content-card">
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", marginBottom: "var(--sp-5)", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "var(--sp-1)", padding: "3px", background: "var(--bg-surface-alt)", borderRadius: "var(--radius-sm)" }}>
          {["pending", "approved", "rejected", "all"].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => { setFilter(s); setReviewingId(null); }}
              style={{
                padding: "5px 12px", borderRadius: "6px", border: "none", cursor: "pointer",
                background: filterStatus === s ? "var(--bg-surface)" : "transparent",
                color: filterStatus === s ? "var(--txt-primary)" : "var(--txt-secondary)",
                fontFamily: "var(--font-family)", fontSize: "var(--fs-xs)",
                fontWeight: filterStatus === s ? "var(--fw-medium)" : "var(--fw-regular)",
                boxShadow: filterStatus === s ? "var(--shadow-xs)" : "none",
                textTransform: "capitalize",
              }}
            >
              {statusLabel(s)}
            </button>
          ))}
        </div>
        <Button variant="secondary" size="sm" onClick={loadRequests}>{t("employees.allEmployees.editRequests.refresh", { defaultValue: "Refresh" })}</Button>
        <span style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", marginLeft: "auto" }}>
          {t("employees.allEmployees.editRequests.requestCount", { count: requests.length, defaultValue_one: "{{count}} request", defaultValue_other: "{{count}} requests" })}
        </span>
      </div>

      {toast && (
        <div style={{
          marginBottom: "var(--sp-4)", padding: "var(--sp-3) var(--sp-4)",
          background: toast.startsWith("Error") ? "var(--bg-danger-subtle)" : "var(--bg-success-subtle)",
          border: `1px solid ${toast.startsWith("Error") ? "var(--bdr-danger)" : "var(--bdr-success)"}`,
          borderRadius: "var(--radius-md)",
          color: toast.startsWith("Error") ? "var(--txt-danger)" : "var(--txt-success)",
          fontSize: "var(--fs-sm)",
        }}>
          {toast}
        </div>
      )}

      {error && (
        <div style={{ padding: "var(--sp-3) var(--sp-4)", background: "var(--bg-danger-subtle)", border: "1px solid var(--bdr-danger)", borderRadius: "var(--radius-md)", color: "var(--txt-danger)", fontSize: "var(--fs-sm)", marginBottom: "var(--sp-4)" }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: "var(--sp-5)", textAlign: "center", color: "var(--txt-secondary)", fontSize: "var(--fs-sm)" }}>
          {t("employees.allEmployees.editRequests.loading", { defaultValue: "Loading requests…" })}
        </div>
      ) : requests.length === 0 ? (
        <div className="empty-state">
          <h3 className="empty-state-title">
            {filterStatus === "all" ? t("employees.allEmployees.editRequests.noRequestsAll", { defaultValue: "No requests" }) : t("employees.allEmployees.editRequests.noRequestsFiltered", { defaultValue: "No {{status}} requests", status: statusLabel(filterStatus) })}
          </h3>
          <p className="empty-state-description">
            {t("employees.allEmployees.editRequests.emptyDescription", { defaultValue: "Profile edit requests submitted by employees will show up here for review." })}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
          {requests.map((req) => {
            const isOpen = reviewingId === req.id;
            return (
              <div key={req.id} style={{
                background: "var(--bg-surface)",
                border: `1px solid ${isOpen ? "var(--bdr-brand)" : "var(--bdr-subtle)"}`,
                borderRadius: "var(--radius-md)",
                overflow: "hidden",
                transition: "border-color 0.15s",
              }}>
                {/* Request header */}
                <div style={{
                  display: "flex", alignItems: "center", gap: "var(--sp-4)",
                  padding: "var(--sp-4) var(--sp-5)",
                  background: isOpen ? "var(--bg-primary-subtle)" : "var(--bg-surface-alt)",
                  flexWrap: "wrap",
                }}>
                  <div style={{
                    width: "36px", height: "36px", borderRadius: "50%",
                    background: "var(--bg-primary)", color: "var(--txt-on-brand)",
                    display: "grid", placeItems: "center",
                    fontSize: "var(--fs-sm)", fontWeight: "var(--fw-semibold)",
                    flexShrink: 0,
                  }}>
                    {(req.employeeName?.[0] ?? "?").toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-medium)", color: "var(--txt-primary)" }}>
                      {req.employeeName ?? t("employees.allEmployees.editRequests.unknownEmployee", { defaultValue: "Unknown employee" })}
                    </div>
                    <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", marginTop: "2px" }}>
                      {Object.keys(req.changes || {}).join(", ")} · {formatDate(req.createdAt)}
                    </div>
                  </div>
                  <Badge variant={REQUEST_STATUS_VARIANT[req.status] ?? "neutral"} pill dot>{statusLabel(req.status)}</Badge>
                  {req.status === "pending" && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => { setReviewingId(isOpen ? null : req.id); setNote(""); }}
                    >
                      {isOpen ? t("common.actions.close", { defaultValue: "Close" }) : t("employees.allEmployees.editRequests.review", { defaultValue: "Review" })}
                    </Button>
                  )}
                </div>

                {/* Expanded detail + action */}
                {isOpen && (
                  <div style={{ padding: "var(--sp-5)", borderTop: "1px solid var(--bdr-subtle)" }}>
                    <div style={{ marginBottom: "var(--sp-4)" }}>
                      <div style={{ fontSize: "var(--fs-xs)", fontWeight: "var(--fw-semibold)", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--txt-secondary)", marginBottom: "var(--sp-2)" }}>
                        {t("employees.allEmployees.editRequests.requestedChanges", { defaultValue: "Requested changes" })}
                      </div>
                      {Object.entries(req.changes || {}).map(([field, { from, to }]) => (
                        <RequestFieldRow key={field} label={field} from={from} to={to} />
                      ))}
                    </div>

                    <div className="form-group" style={{ marginBottom: "var(--sp-4)" }}>
                      <label className="form-label" htmlFor={`edit-req-note-${req.id}`}>
                        {t("employees.allEmployees.editRequests.reviewNoteLabel", { defaultValue: "Review note" })} <span style={{ fontWeight: "var(--fw-regular)", color: "var(--txt-secondary)" }}>{t("employees.allEmployees.editRequests.optional", { defaultValue: "(optional)" })}</span>
                      </label>
                      <textarea
                        id={`edit-req-note-${req.id}`}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={2}
                        placeholder={t("employees.allEmployees.editRequests.reviewNotePlaceholder", { defaultValue: "Add a note for the employee…" })}
                        style={{ resize: "vertical" }}
                      />
                    </div>

                    <div style={{ display: "flex", gap: "var(--sp-3)" }}>
                      <Button
                        variant="success"
                        disabled={actionLoading !== null}
                        onClick={() => handleReview(req.id, "approved")}
                      >
                        {actionLoading === "approved" ? t("employees.allEmployees.editRequests.approving", { defaultValue: "Approving…" }) : t("employees.allEmployees.editRequests.approveApply", { defaultValue: "Approve & apply" })}
                      </Button>
                      <Button
                        variant="danger"
                        disabled={actionLoading !== null}
                        onClick={() => handleReview(req.id, "rejected")}
                      >
                        {actionLoading === "rejected" ? t("employees.allEmployees.editRequests.rejecting", { defaultValue: "Rejecting…" }) : t("common.actions.reject", { defaultValue: "Reject" })}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Show review outcome for non-pending */}
                {req.status !== "pending" && req.reviewNote && (
                  <div style={{
                    padding: "var(--sp-3) var(--sp-5)",
                    borderTop: "1px solid var(--bdr-subtle)",
                    fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", fontStyle: "italic",
                  }}>
                    {t("employees.allEmployees.editRequests.hrNotePrefix", { defaultValue: "HR note:" })} {req.reviewNote}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════ */
function AllEmployees() {
  const { t } = useTranslation();
  const { isAdmin, isHRTier, isManagerTier, isManager } = useAuth();
  // Plain MANAGER (not HR/Admin) gets this page as a read-only company-wide
  // "Directory" (see employeeController.getAll — read is unscoped for
  // everyone; only writes are department-scoped/HR-gated). Bulk actions and
  // Promote live on "My Department" instead (departmentController.getDetail,
  // routed via /departments/me), so they're hidden here for this role only.
  const isPlainManager = isManager && !isHRTier;
  // Plain EMPLOYEE (App.jsx now opens this route to every role, matching
  // the design's company-wide "Directory" for Employee too) gets the same
  // read-only treatment as isPlainManager, plus Salary is hidden on a
  // colleague's card — employeeController.getDetail already blocks
  // EMPLOYEE from fetching another employee's single record, so the list's
  // in-memory salary field shouldn't be surfaced here either.
  const isPlainEmployee = !isManager && !isHRTier;
  const {
    employees, departments, removeEmployee, updateEmployee,
    modals, openModal, closeModal,
    filters, setSearchFilter, clearFilters,
  } = useStore();

  const [currentPage, setCurrentPage]   = useState(1);
  const [sortField, setSortField]       = useState("name");
  const [sortOrder, setSortOrder]       = useState("asc");
  const [selectedIds, setSelectedIds]   = useState(new Set());
  const [panelEmployee, setPanelEmployee] = useState(null);
  const [promotingEmployee, setPromotingEmployee] = useState(null);

  /* ── Roster / Edit requests tabs — real data via PromotionRequestsAPI /
     ProfileEditRequestsAPI. Promotion review is ADMIN-only (see
     promotionRequestRouter.js), so that banner stays isAdmin-gated. Profile
     edit request review is MANAGER (own department)/HR/ADMIN
     (profileEditRequestRouter.js), so the Edit-requests tab is gated by
     isManagerTier instead — Manager sees requests scoped to their own
     department automatically (utils/reviewQueue.js). ── */
  // Lets a "Profile edit request" notification deep-link straight to this
  // tab (/employees?tab=editRequests) instead of just landing on Roster.
  // activeTab is derived from the query string rather than its own
  // useState (same reasoning as ViewEmployee.jsx's activeTab): navigating
  // sidebar link -> sidebar link stays on this same route, so a plain
  // useState initializer would only resolve on first mount and never pick
  // up a later ?tab= change.
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") === "editRequests" ? "editRequests" : "roster";
  const setActiveTab = (key) => {
    setSearchParams(key === "editRequests" ? { tab: key } : {}, { replace: true });
  };
  const [pendingPromotions, setPendingPromotions] = useState([]);
  const [pendingEditCount, setPendingEditCount] = useState(0);

  const loadPendingPromotions = useCallback(() => {
    if (!isAdmin) return;
    PromotionRequestsAPI.list({ status: "pending" })
      .then((res) => setPendingPromotions(res.items || []))
      .catch(() => {});
  }, [isAdmin]);

  // Lightweight count for the tab badge — the panel itself owns the full
  // filtered/paginated request list once it's open.
  const loadPendingEditCount = useCallback(() => {
    if (!isManagerTier) return;
    ProfileEditRequestsAPI.list({ status: "pending" })
      .then((res) => setPendingEditCount((res.items || []).length))
      .catch(() => {});
  }, [isManagerTier]);

  useEffect(() => { loadPendingPromotions(); }, [loadPendingPromotions]);
  useEffect(() => { loadPendingEditCount(); }, [loadPendingEditCount]);

  const handlePromotionReview = async (id, decision) => {
    try {
      await PromotionRequestsAPI.review(id, decision);
      loadPendingPromotions();
    } catch { /* surfaced via the request staying in the pending list */ }
  };

  /* ── Filter ── */
  const filteredEmployees = employees.filter((emp) => {
    const search = filters.search.toLowerCase();
    const matchesSearch =
      !filters.search ||
      emp.name.toLowerCase().includes(search) ||
      emp.employeeId.toLowerCase().includes(search) ||
      emp.department.toLowerCase().includes(search);
    const matchesDepartment =
      !filters.department || filters.department === "" ||
      filters.department.split(",").includes(emp.department);
    const matchesType =
      !filters.type || filters.type === "all" || emp.type === filters.type;
    return matchesSearch && matchesDepartment && matchesType;
  });

  /* ── Sort ── */
  const handleSort = (field) => {
    if (sortField === field) setSortOrder((p) => (p === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortOrder("asc"); }
    setCurrentPage(1);
  };

  const sortedEmployees = [...filteredEmployees].sort((a, b) => {
    const valA = String(a[sortField] ?? "").toLowerCase();
    const valB = String(b[sortField] ?? "").toLowerCase();
    return sortOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
  });

  /* ── Pagination ── */
  const totalPages    = Math.ceil(sortedEmployees.length / EMPLOYEES_PER_PAGE);
  const startIndex    = (currentPage - 1) * EMPLOYEES_PER_PAGE;
  const paginated     = sortedEmployees.slice(startIndex, startIndex + EMPLOYEES_PER_PAGE);
  const pageIds       = paginated.map((e) => e.id);

  /* ── Selection ── */
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const someSelected    = selectedIds.size > 0;

  const toggleOne = useCallback((id, e) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const togglePage = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageIds.forEach((id) => next.delete(id));
      else                  pageIds.forEach((id) => next.add(id));
      return next;
    });
  }, [allPageSelected, pageIds]);

  const clearSelection = () => setSelectedIds(new Set());

  /* ── Bulk actions ── */
  const handleBulkDelete = () => {
    if (!confirm(t("common.confirmDeleteEmployees", { defaultValue: "Delete {{count}} employee(s)?", count: selectedIds.size }))) return;
    selectedIds.forEach((id) => removeEmployee(id));
    clearSelection();
  };

  const handleBulkStatus = (status) => {
    selectedIds.forEach((id) => updateEmployee(id, { status }));
    clearSelection();
  };

  // Salary column is dropped from both exports for a plain EMPLOYEE — same
  // reasoning as SidePanel's canSeeSalary above.
  const csvHeader = isManagerTier
    ? "Name,Employee ID,Department,Designation,Type,Status,Salary"
    : "Name,Employee ID,Department,Designation,Type,Status";
  const toCsvRow = (e) => {
    const base = `${e.name},${e.employeeId},${e.department},${e.designation},${e.type},${e.status}`;
    return isManagerTier ? `${base},${e.salary || ""}` : base;
  };

  const handleBulkExport = () => {
    const rows = employees.filter((e) => selectedIds.has(e.id)).map(toCsvRow);
    const csv = [csvHeader, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a"); a.href = url; a.download = "employees.csv"; a.click();
    URL.revokeObjectURL(url);
    clearSelection();
  };

  const handleExportAll = () => {
    const rows = sortedEmployees.map(toCsvRow);
    const csv = [csvHeader, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a"); a.href = url; a.download = "employees.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  /* ── Single row actions ── */
  const handleDelete = (id) => {
    const emp = employees.find((e) => e.id === id);
    if (!confirm(t("common.confirmDeleteEmployee", { defaultValue: "Delete {{name}}? This cannot be undone.", name: emp?.name }))) return;
    removeEmployee(id);
    if (panelEmployee?.id === id) setPanelEmployee(null);
    setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
  };

  const handleStatusChange = (id, status) => {
    updateEmployee(id, { status });
    if (panelEmployee?.id === id)
      setPanelEmployee((prev) => ({ ...prev, status }));
  };

  /* ── Other helpers ── */
  const hasActiveFilters = filters.department || filters.type !== "all";
  const hasActiveSearchOrFilters = Boolean(filters.search) || hasActiveFilters;

  const handleSearch = (value) => { setSearchFilter(value); setCurrentPage(1); };
  const handleReset  = () => { clearFilters(); setCurrentPage(1); };

  const openPanel = (emp, e) => {
    e.stopPropagation();
    setPanelEmployee(emp);
  };

  return (
    <>
      {/* ── Roster / Edit requests toggle ── */}
      {isManagerTier && (
        <div style={{ display: "flex", gap: "var(--sp-1)", padding: "3px", background: "var(--bg-surface-alt)", borderRadius: "var(--radius-sm)", marginBottom: "var(--sp-5)", width: "fit-content" }}>
          {[["roster", t("employees.allEmployees.rosterTab", { defaultValue: "Roster" })], ["editRequests", t("employees.allEmployees.editRequestsTab", { defaultValue: "Edit requests ({{count}})", count: pendingEditCount })]].map(([v, label]) => (
            <button key={v} type="button" onClick={() => setActiveTab(v)} style={{
              padding: "5px 14px", borderRadius: "0", border: "none",
              background: activeTab === v ? "var(--bg-surface)" : "transparent",
              color: activeTab === v ? "var(--txt-primary)" : "var(--txt-secondary)",
              fontFamily: "var(--font-family)", fontSize: "var(--fs-sm)", cursor: "pointer",
              fontWeight: activeTab === v ? "var(--fw-medium)" : "var(--fw-regular)",
            }}>
              {label}
            </button>
          ))}
        </div>
      )}

      {isManagerTier && activeTab === "editRequests" ? (
        <EditRequestsPanel onChanged={loadPendingEditCount} />
      ) : (
      <>
      {isAdmin && (
        <PendingPromotionsPanel requests={pendingPromotions} onReview={handlePromotionReview} />
      )}
      <div className="content-card">

        {/* ── Toolbar ── */}
        <div className="toolbar">
          <Button
            variant="secondary"
            onClick={() => openModal("filter")}
            className="toolbar-filter-btn"
          >
            {t("employees.allEmployees.toolbar.filter", { defaultValue: "Filter" })}
            {hasActiveFilters && <span className="toolbar-filter-dot" />}
          </Button>
          <SearchBar
            value={filters.search}
            onSearch={handleSearch}
            placeholder={t("employees.allEmployees.toolbar.searchPlaceholder", { defaultValue: "Search by name, employee ID, department..." })}
          />
          <Button
            variant="secondary"
            onClick={handleReset}
            disabled={!hasActiveSearchOrFilters}
          >
            {t("employees.allEmployees.toolbar.reset", { defaultValue: "Reset" })}
          </Button>
          {isHRTier && (
            <Link to="/employees/add" className="btn btn-primary" style={{ marginLeft: "auto" }}>
              + {t("sideMenu.addEmployee", { defaultValue: "Add Employee" })}
            </Link>
          )}
          <Button variant="secondary" onClick={handleExportAll} style={isHRTier ? undefined : { marginLeft: "auto" }}>
            {t("employees.allEmployees.toolbar.exportCsv", { defaultValue: "Export CSV" })}
          </Button>
        </div>

        {/* ── Bulk action bar ── */}
        {someSelected && (
          <BulkActionBar
            count={selectedIds.size}
            onExport={handleBulkExport}
            onDelete={handleBulkDelete}
            onStatusChange={handleBulkStatus}
            onClear={clearSelection}
            canDelete={isAdmin}
          />
        )}

        {/* ── Table ── */}
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {/* Select-all checkbox — hidden for plain MANAGER (Directory
                    is read-only for that role; bulk actions live on "My
                    Department" instead). */}
                {!isPlainManager && !isPlainEmployee && (
                  <th style={{ width: "40px", textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={togglePage}
                      style={{ cursor: "pointer", width: "15px", height: "15px" }}
                      aria-label={t("employees.allEmployees.table.selectAllAria", { defaultValue: "Select all on this page" })}
                    />
                  </th>
                )}
                {SORTABLE_COLUMNS.map((col) => (
                  <SortableHeader
                    key={col.key} label={t(col.labelKey, { defaultValue: col.defaultLabel })} field={col.key}
                    sortField={sortField} sortOrder={sortOrder} onSort={handleSort}
                  />
                ))}
                <th>{t("common.columns.action", { defaultValue: "Action" })}</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((employee) => {
                const isSelected = selectedIds.has(employee.id);
                return (
                  <tr
                    key={employee.id}
                    className="employee-row-clickable"
                    onClick={(e) => openPanel(employee, e)}
                    style={{ background: isSelected ? "var(--bg-primary-subtle)" : undefined }}
                  >
                    {/* Checkbox */}
                    {!isPlainManager && !isPlainEmployee && (
                      <td style={{ textAlign: "center" }} onClick={(e) => toggleOne(employee.id, e)}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          style={{ cursor: "pointer", width: "15px", height: "15px" }}
                          aria-label={t("employees.allEmployees.table.selectRowAria", { defaultValue: "Select {{name}}", name: employee.name })}
                        />
                      </td>
                    )}

                    {/* Name */}
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <Avatar name={employee.name} src={employee.avatar} size="sm" />
                        <div>
                          <div className="employee-row-name">{employee.name}</div>
                          <div style={{ fontSize: "var(--fs-2xs)", color: "var(--txt-secondary)" }}>
                            {employee.employeeId}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)" }}>{employee.employeeId}</td>
                    <td>{employee.department}</td>
                    <td style={{ color: "var(--txt-secondary)", fontSize: "var(--fs-sm)" }}>{employee.designation}</td>
                    <td><TypeBadge type={employee.type} /></td>
                    <td><StatusBadge status={employee.status} /></td>

                    {/* Actions — plain text links, matching the mockup's
                        row-action style (no bordered button boxes). */}
                    <td onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="link"
                        onClick={(e) => openPanel(employee, e)}
                      >
                        {t("employees.allEmployees.table.details", { defaultValue: "Details" })}
                      </Button>
                      {/* Promote is scoped to the reviewer's own department
                          server-side, so it's hidden here for plain MANAGER
                          — Directory is unscoped/company-wide, and Promote
                          would 403 on most rows. Manager proposes promotions
                          from "My Department" instead. */}
                      {isManagerTier && !isPlainManager && (
                        <Button
                          variant="link"
                          onClick={() => setPromotingEmployee(employee)}
                        >
                          {t("employees.allEmployees.table.promote", { defaultValue: "Promote" })}
                        </Button>
                      )}
                      {isAdmin && (
                        <Button
                          variant="link"
                          className="btn-link-muted"
                          aria-label={t("employees.allEmployees.table.deleteAria", { defaultValue: "Delete employee" })}
                          onClick={() => handleDelete(employee.id)}
                        >
                          {t("common.actions.delete", { defaultValue: "Delete" })}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Empty state ── */}
        {filteredEmployees.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--txt-disabled)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </div>
            <h3 className="empty-state-title">{t("employees.allEmployees.emptyState.title", { defaultValue: "No employees found" })}</h3>
            <p className="empty-state-description">
              {hasActiveSearchOrFilters
                ? t("employees.allEmployees.emptyState.tryAdjusting", { defaultValue: "Try adjusting your search or filters." })
                : t("employees.allEmployees.emptyState.getStarted", { defaultValue: "Get started by adding your first employee." })}
            </p>
            {hasActiveSearchOrFilters && (
              <Button variant="secondary" onClick={handleReset}>
                {t("employees.allEmployees.emptyState.clearFilters", { defaultValue: "Clear filters" })}
              </Button>
            )}
            {!hasActiveSearchOrFilters && isHRTier && (
              <Link to="/employees/add" className="btn btn-primary">+ {t("sideMenu.addEmployee", { defaultValue: "Add Employee" })}</Link>
            )}
          </div>
        )}

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div className="pagination">
            <div className="pagination-info">
              {t("employees.allEmployees.pagination.showing", { defaultValue: "Showing {{start}}–{{end}} of {{total}} employees", start: startIndex + 1, end: Math.min(startIndex + EMPLOYEES_PER_PAGE, sortedEmployees.length), total: sortedEmployees.length })}
              {sortedEmployees.length !== employees.length && (
                <span style={{ color: "var(--txt-secondary)", marginLeft: "8px" }}>
                  {t("employees.allEmployees.pagination.filteredFrom", { defaultValue: "(filtered from {{total}})", total: employees.length })}
                </span>
              )}
              {someSelected && (
                <span style={{ color: "var(--txt-primary-brand)", marginLeft: "8px", fontWeight: "var(--fw-medium)" }}>
                  {t("employees.allEmployees.pagination.selectedSuffix", { defaultValue: "· {{count}} selected", count: selectedIds.size })}
                </span>
              )}
            </div>
            <div className="pagination-controls">
              <Button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="page-btn">‹</Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button key={page} className={`page-btn ${currentPage === page ? "active" : ""}`} onClick={() => setCurrentPage(page)}>
                  {page}
                </button>
              ))}
              <Button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="page-btn">›</Button>
            </div>
          </div>
        )}

        {modals.filter && <FilterModal onClose={() => closeModal("filter")} />}
      </div>
      </>
      )}

      {/* ── Side panel ── */}
      {panelEmployee && (
        <SidePanel
          employee={employees.find((e) => e.id === panelEmployee.id) ?? panelEmployee}
          onClose={() => setPanelEmployee(null)}
          onDelete={handleDelete}
          onStatusChange={handleStatusChange}
          canSeeSalary={isManagerTier}
        />
      )}

      {/* ── Propose a promotion ── */}
      {promotingEmployee && (
        <ProposePromotionModal
          employee={promotingEmployee}
          employees={employees}
          departments={departments}
          onClose={() => setPromotingEmployee(null)}
          onSubmitted={loadPendingPromotions}
        />
      )}
    </>
  );
}

/* ─── Sortable column header ─── */
function SortableHeader({ label, field, sortField, sortOrder, onSort }) {
  const { t } = useTranslation();
  const isActive = sortField === field;
  return (
    <th className="sortable-header" onClick={() => onSort(field)} title={t("employees.allEmployees.sortBy", { defaultValue: "Sort by {{label}}", label })}>
      {label}
      {isActive && (
        <span className="sort-indicator" aria-hidden="true">{sortOrder === "asc" ? " ▲" : " ▼"}</span>
      )}
    </th>
  );
}

export default AllEmployees;
