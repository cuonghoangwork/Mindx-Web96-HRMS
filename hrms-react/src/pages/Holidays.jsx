import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { formatDate as formatDateLocalized } from "../utils/format";
import { LeaveRequestsAPI } from "../api";
import { leaveTypeLabel } from "../utils/leaveTypes";
import Avatar from "../components/Avatar";
import Badge from "../components/Badge";
import AddHolidayModal from "../components/AddHolidayModal";
import Button from "../components/Button";

const HOLIDAY_TYPE_VARIANT = {
  Public: "success",
  Company: "primary",
  Optional: "info",
};

// Task 6.6 — was previously pinned to "en-US" regardless of the app's
// language toggle; now delegates to utils/format.js.
function formatDate(dateStr, language) {
  return formatDateLocalized(dateStr, language, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
function formatRange(startStr, endStr, language) {
  const s = formatDateLocalized(startStr, language, { month: "short", day: "numeric" });
  const e = formatDateLocalized(endStr, language, { month: "short", day: "numeric" });
  return startStr === endStr ? s : `${s} – ${e}`;
}

const LEAVE_STATUS_VARIANT = { pending: "warning", approved: "success", rejected: "danger" };
const LEAVE_TYPE_VARIANT = { annual: "info", sick: "primary", parental: "success", bereavement: "warning", unpaid: "neutral" };

/* ═══════════════════════════════════════════
   Leave requests — admin/manager review queue. No equivalent panel
   existed anywhere in the app before this; the backend (LeaveRequestsAPI)
   already fully supports list/approve/reject, it just wasn't surfaced in
   the UI. Self-service "apply for leave" already lives on the Dashboard's
   "My Leave" widget, so this panel is review-only (matches the mockup,
   which also treats this as an HR review queue rather than a create form).
═══════════════════════════════════════════ */
function LeaveRequestsPanel({ requests, loading, error, onReview, reviewingId }) {
  const { language } = useLanguage();
  if (loading) {
    return <div style={{ padding: "var(--sp-6)", textAlign: "center", color: "var(--txt-secondary)", fontSize: "var(--fs-sm)" }}>Loading leave requests…</div>;
  }
  if (error) {
    return <div style={{ padding: "var(--sp-4)", color: "var(--txt-danger)", fontSize: "var(--fs-sm)" }}>{error}</div>;
  }
  if (requests.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-title">No leave requests</div>
        <div className="empty-state-description">New requests will appear here for review.</div>
      </div>
    );
  }
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Employee</th>
            <th>Type</th>
            <th>Dates</th>
            <th>Days</th>
            <th>Reason</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr key={r.id}>
              <td style={{ fontWeight: "var(--fw-medium)" }}>{r.employeeName ?? "—"}</td>
              <td><Badge variant={LEAVE_TYPE_VARIANT[r.type] ?? "neutral"} size="sm">{leaveTypeLabel(r.type)}</Badge></td>
              <td style={{ color: "var(--txt-secondary)" }}>{formatRange(r.startDate, r.endDate, language)}</td>
              <td style={{ color: "var(--txt-secondary)" }}>{r.days}</td>
              <td style={{ color: "var(--txt-secondary)" }}>{r.reason || "—"}</td>
              <td><Badge variant={LEAVE_STATUS_VARIANT[r.status] ?? "neutral"} size="sm">{r.status}</Badge></td>
              <td>
                {r.status === "pending" && (
                  <div style={{ display: "flex", gap: "var(--sp-2)" }}>
                    <Button variant="primary" size="xs" loading={reviewingId === `${r.id}-approved`} onClick={() => onReview(r.id, "approved")}>Approve</Button>
                    <Button variant="danger" size="xs" loading={reviewingId === `${r.id}-rejected`} onClick={() => onReview(r.id, "rejected")}>Reject</Button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function balanceFor(row, type) {
  return row.balances.find((b) => b.type === type);
}

/* ═══════════════════════════════════════════
   Leave balances — full per-type breakdown (task follow-up: the initial
   version of this panel only showed a single "paid leave" number, from
   back when the backend only tracked a paid/unpaid binary. Now that
   LeaveRequest.type spans all 5 LEAVE_TYPES (model/LeaveRequest.js), the
   summary columns mirror the two the mockup calls out (PTO/Annual, Sick)
   and clicking a row expands the full 5-type ledger inline, matching the
   mockup's "Click a row for the full ledger" pattern.
═══════════════════════════════════════════ */
function LeaveBalancesPanel({ rows, loading, error, search, onSearchChange }) {
  const [expandedId, setExpandedId] = useState(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => !q || r.name.toLowerCase().includes(q) || (r.department ?? "").toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, search]);

  return (
    <div className="content-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--sp-3)", marginBottom: "var(--sp-5)", flexWrap: "wrap" }}>
        <div>
          <h3 style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-semibold)", margin: 0 }}>Leave balances</h3>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", marginTop: "2px" }}>
            Click a row for the full ledger
          </div>
        </div>
        <input
          type="text" value={search} onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search employees…"
          style={{
            fontFamily: "var(--font-family)", fontSize: "var(--fs-sm)", padding: "9px var(--sp-4)",
            background: "var(--bg-surface)", color: "var(--txt-primary)",
            border: "1px solid var(--bdr-default)", borderRadius: "var(--radius-md)", width: "220px",
          }}
        />
      </div>

      {loading ? (
        <div style={{ padding: "var(--sp-6)", textAlign: "center", color: "var(--txt-secondary)", fontSize: "var(--fs-sm)" }}>Loading leave balances…</div>
      ) : error ? (
        <div style={{ padding: "var(--sp-4)", color: "var(--txt-danger)", fontSize: "var(--fs-sm)" }}>{error}</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">No employees match</div>
          <div className="empty-state-description">Try a different search.</div>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Department</th>
                <th>PTO remaining</th>
                <th>Sick remaining</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const isExpanded = expandedId === r.id;
                const annual = balanceFor(r, "annual");
                const sick = balanceFor(r, "sick");
                return (
                  <Fragment key={r.id}>
                    <tr
                      onClick={() => setExpandedId(isExpanded ? null : r.id)}
                      style={{ cursor: "pointer", background: isExpanded ? "var(--bg-surface-alt)" : undefined }}
                    >
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
                          <Avatar name={r.name} size="xs" />
                          <div>
                            <div style={{ fontWeight: "var(--fw-medium)" }}>{r.name}</div>
                            {r.employeeCode && <div style={{ fontSize: "var(--fs-2xs)", color: "var(--txt-secondary)" }}>{r.employeeCode}</div>}
                          </div>
                        </div>
                      </td>
                      <td style={{ color: "var(--txt-secondary)" }}>{r.department ?? "—"}</td>
                      <td style={{ fontWeight: "var(--fw-medium)" }}>{annual.remaining} / {annual.accrued}</td>
                      <td style={{ fontWeight: "var(--fw-medium)" }}>{sick.remaining} / {sick.accrued}</td>
                    </tr>
                    {isExpanded && (
                      <tr style={{ background: "var(--bg-surface-alt)" }}>
                        <td colSpan={4} style={{ padding: "var(--sp-4) var(--sp-5)" }}>
                          <div style={{
                            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                            gap: "var(--sp-4)",
                          }}>
                            {r.balances.map((b) => (
                              <div key={b.type}>
                                <div style={{ fontSize: "var(--fs-2xs)", color: "var(--txt-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                                  {b.label}
                                </div>
                                <div style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-semibold)", marginTop: "2px" }}>
                                  {b.remaining ?? "—"} left
                                </div>
                                <div style={{ fontSize: "var(--fs-2xs)", color: "var(--txt-secondary)" }}>
                                  {b.used} used of {b.accrued ?? "Unlimited"}
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Holidays() {
  const { language } = useLanguage();
  const { getAppNow, holidays, addHoliday, updateHoliday, removeHoliday } = useStore();
  // /holidays is requireManager-gated (App.jsx). Two different scopes live
  // on this one page:
  //  - canManageHolidays (HR/ADMIN only): create/edit/delete company
  //    holidays — holidayRouter.js keeps write routes HR/ADMIN-only.
  //  - canManageLeave (MANAGER/HR/ADMIN): the leave-requests review queue
  //    (department-scoped for MANAGER via reviewQueue.js's list handler)
  //    and the leave-balances table (department-scoped for MANAGER via
  //    leaveRequestController.balances, which uses getManagerDepartmentId
  //    the same way — see LeaveRequestsAPI.balances below).
  const { isHRTier, isManagerTier } = useAuth();
  const canManageHolidays = isHRTier;
  const canManageLeave = isManagerTier;

  const [modalOpen, setModalOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState(null);
  const [editingDateId, setEditingDateId] = useState(null);
  const [draftDate, setDraftDate] = useState("");
  const [actionError, setActionError] = useState("");

  const [leaveRequests, setLeaveRequests] = useState([]);
  const [loadingLeave, setLoadingLeave] = useState(canManageLeave);
  const [leaveError, setLeaveError] = useState("");
  const [reviewingId, setReviewingId] = useState(null);
  const [balanceSearch, setBalanceSearch] = useState("");

  const [balanceRows, setBalanceRows] = useState([]);
  const [loadingBalances, setLoadingBalances] = useState(canManageLeave);
  const [balanceError, setBalanceError] = useState("");

  const today = useMemo(() => {
    const d = getAppNow();
    d.setHours(0, 0, 0, 0);
    return d;
  }, [getAppNow]);

  const loadLeaveRequests = useCallback(async () => {
    if (!canManageLeave) return;
    setLoadingLeave(true);
    setLeaveError("");
    try {
      const res = await LeaveRequestsAPI.list();
      setLeaveRequests(res.items ?? []);
    } catch (err) {
      setLeaveError(err.message || "Failed to load leave requests.");
    }
    setLoadingLeave(false);
  }, [canManageLeave]);

  useEffect(() => { loadLeaveRequests(); }, [loadLeaveRequests]);

  const loadBalances = useCallback(async () => {
    if (!canManageLeave) return;
    setLoadingBalances(true);
    setBalanceError("");
    try {
      const res = await LeaveRequestsAPI.balances();
      setBalanceRows((res.data?.items ?? []).map((item) => ({ ...item, id: item.employeeId })));
    } catch (err) {
      setBalanceError(err.message || "Failed to load leave balances.");
    }
    setLoadingBalances(false);
  }, [canManageLeave]);

  useEffect(() => { loadBalances(); }, [loadBalances]);

  const handleReviewLeave = async (id, decision) => {
    setReviewingId(`${id}-${decision}`);
    try {
      await LeaveRequestsAPI.review(id, decision);
      await loadLeaveRequests();
      await loadBalances();
    } catch (err) {
      setActionError(err.message || "Failed to review leave request.");
    }
    setReviewingId(null);
  };

  // Pending first, then most recently applied.
  const sortedLeaveRequests = useMemo(
    () => [...leaveRequests].sort((a, b) => {
      if ((a.status === "pending") !== (b.status === "pending")) return a.status === "pending" ? -1 : 1;
      return new Date(b.appliedAt ?? b.createdAt) - new Date(a.appliedAt ?? a.createdAt);
    }),
    [leaveRequests],
  );

  const sortedHolidays = useMemo(
    () => [...holidays].sort((a, b) => new Date(a.date) - new Date(b.date)),
    [holidays],
  );

  const holidayStats = useMemo(() => {
    const upcoming = holidays.filter((h) => new Date(h.date) >= today);
    const next = upcoming.sort((a, b) => new Date(a.date) - new Date(b.date))[0];
    return { next };
  }, [holidays, today]);

  const leaveStats = useMemo(() => {
    const pendingCount = leaveRequests.filter((r) => r.status === "pending").length;
    const onLeaveToday = leaveRequests.filter((r) =>
      r.status === "approved" && new Date(r.startDate) <= today && new Date(r.endDate) >= today
    ).length;
    const approvedThisMonthDays = leaveRequests
      .filter((r) => r.status === "approved" && (() => {
        const d = new Date(r.startDate);
        return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
      })())
      .reduce((sum, r) => sum + (r.days || 0), 0);
    return { pendingCount, onLeaveToday, approvedThisMonthDays };
  }, [leaveRequests, today]);

  const statCells = [
    { label: "Next holiday", value: holidayStats.next ? holidayStats.next.name : "—", trend: holidayStats.next ? formatDate(holidayStats.next.date, language) : "No upcoming holidays", big: true },
    { label: "Pending requests", value: String(leaveStats.pendingCount), trend: "Awaiting review" },
    { label: "On leave today", value: String(leaveStats.onLeaveToday), trend: "Employees" },
    { label: "Approved this month", value: `${leaveStats.approvedThisMonthDays} days`, trend: formatDateLocalized(today, language, { month: "long" }) },
  ];

  const handleSaveHoliday = async (holiday) => {
    setActionError("");
    try {
      if (holiday.id) {
        await updateHoliday(holiday.id, holiday);
      } else {
        await addHoliday(holiday);
      }
      setEditingHoliday(null);
    } catch (err) {
      setActionError(err.message || "Failed to save holiday.");
    }
  };

  const handleDelete = async (id) => {
    setActionError("");
    try {
      await removeHoliday(id);
    } catch (err) {
      setActionError(err.message || "Failed to delete holiday.");
    }
  };

  const startEditDate = (holiday) => {
    setEditingDateId(holiday.id);
    setDraftDate(holiday.date);
  };

  const confirmEditDate = async (id) => {
    if (!draftDate) {
      setEditingDateId(null);
      return;
    }
    setActionError("");
    try {
      await updateHoliday(id, { date: draftDate });
    } catch (err) {
      setActionError(err.message || "Failed to update date.");
    }
    setEditingDateId(null);
  };

  const cancelEditDate = () => {
    setEditingDateId(null);
    setDraftDate("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-5)" }}>

      {actionError && (
        <div className="form-error">{actionError}</div>
      )}

      {/* ── Stat strip ── */}
      <div className="stat-strip">
        {statCells.map((c) => (
          <div key={c.label} className="stat-cell" style={{ cursor: "default" }}>
            <div className="stat-cell-label">{c.label}</div>
            <div className="stat-cell-value" style={c.big ? { fontSize: "var(--fs-2xl)" } : undefined}>{c.value}</div>
            <div className="stat-cell-trend">{c.trend}</div>
          </div>
        ))}
      </div>

      {/* ── Company holidays ── */}
      <div className="content-card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--sp-3)", marginBottom: "var(--sp-5)", flexWrap: "wrap" }}>
          <div>
            <h3 style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-semibold)", margin: 0 }}>Company holidays</h3>
            <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", marginTop: "2px" }}>
              {sortedHolidays.length} scheduled
            </div>
          </div>
          {canManageHolidays && (
            <Button variant="primary" size="sm" onClick={() => { setEditingHoliday(null); setModalOpen(true); }}>
              + Add Holiday
            </Button>
          )}
        </div>

        {sortedHolidays.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--txt-disabled)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
                <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
              </svg>
            </div>
            <div className="empty-state-title">No holidays yet</div>
            <div className="empty-state-description">
              {canManageHolidays ? "Add a holiday to start building the calendar." : "None scheduled yet."}
            </div>
            {canManageHolidays && (
              <Button variant="primary" onClick={() => setModalOpen(true)}>+ Add Holiday</Button>
            )}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Holiday Name</th>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {sortedHolidays.map((holiday) => {
                  const isPast = new Date(holiday.date) < today;
                  const isEditingDate = editingDateId === holiday.id;
                  return (
                    <tr key={holiday.id} style={isPast ? { opacity: 0.55 } : undefined}>
                      <td style={{ fontWeight: "var(--fw-medium)" }}>{holiday.name}</td>
                      <td>
                        {isEditingDate ? (
                          <div style={{ display: "flex", gap: "var(--sp-2)", alignItems: "center" }}>
                            <input
                              type="date" value={draftDate} onChange={(e) => setDraftDate(e.target.value)} autoFocus
                              style={{
                                padding: "4px 8px", fontSize: "var(--fs-sm)",
                                border: "1px solid var(--bdr-default)", borderRadius: "var(--radius-sm)",
                                background: "var(--bg-surface)", color: "var(--txt-primary)",
                              }}
                            />
                            <Button variant="primary" style={{ padding: "4px 10px" }} onClick={() => confirmEditDate(holiday.id)} aria-label="Confirm date">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            </Button>
                            <Button variant="secondary" style={{ padding: "4px 10px" }} onClick={cancelEditDate} aria-label="Cancel">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M18 6L6 18M6 6l12 12" />
                              </svg>
                            </Button>
                          </div>
                        ) : canManageHolidays ? (
                          <button
                            type="button" onClick={() => startEditDate(holiday)}
                            style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "var(--txt-primary)", cursor: "pointer", textAlign: "left" }}
                            title="Click to edit date"
                          >
                            {formatDate(holiday.date, language)}
                          </button>
                        ) : (
                          formatDate(holiday.date, language)
                        )}
                      </td>
                      <td><Badge variant={HOLIDAY_TYPE_VARIANT[holiday.type] ?? "neutral"}>{holiday.type}</Badge></td>
                      <td>
                        {isPast ? <Badge variant="neutral" size="sm">Past</Badge> : <Badge variant="success" size="sm" dot>Upcoming</Badge>}
                      </td>
                      <td>
                        {canManageHolidays && (
                          <div style={{ display: "flex", gap: "var(--sp-1)" }}>
                            <Button variant="link" onClick={() => { setEditingHoliday(holiday); setModalOpen(true); }}>Edit</Button>
                            <Button variant="link" className="btn-link-muted" onClick={() => handleDelete(holiday.id)}>Delete</Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Leave requests (admin/manager review queue) — new panel, not
          previously surfaced anywhere; self-service "apply for leave"
          stays on the Dashboard's "My Leave" widget. ── */}
      {canManageLeave && (
        <div className="content-card">
          <div style={{ marginBottom: "var(--sp-5)" }}>
            <h3 style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-semibold)", margin: 0 }}>Leave requests</h3>
            <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", marginTop: "2px" }}>Pending requests need your review</div>
          </div>
          <LeaveRequestsPanel
            requests={sortedLeaveRequests}
            loading={loadingLeave}
            error={leaveError}
            onReview={handleReviewLeave}
            reviewingId={reviewingId}
          />
        </div>
      )}

      {/* ── Leave balances ── */}
      {canManageLeave && (
        <LeaveBalancesPanel
          rows={balanceRows}
          loading={loadingBalances}
          error={balanceError}
          search={balanceSearch}
          onSearchChange={setBalanceSearch}
        />
      )}

      {modalOpen && (
        <AddHolidayModal
          onClose={() => { setModalOpen(false); setEditingHoliday(null); }}
          onSave={handleSaveHoliday}
          holiday={editingHoliday}
          existing={holidays}
        />
      )}
    </div>
  );
}

export default Holidays;
