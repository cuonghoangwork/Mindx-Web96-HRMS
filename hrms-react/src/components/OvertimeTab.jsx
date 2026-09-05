import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { formatDate } from "../utils/format";
import { translateApiError } from "../utils/apiError";
import { idsMatch } from "../utils/id";
import Avatar from "./Avatar";
import Badge from "./Badge";
import Button from "./Button";
import OvertimeRequestModal from "./OvertimeRequestModal";
import AssignOvertimePanel from "./AssignOvertimePanel";

/**
 * OvertimeTab — the Attendance page's third tab.
 *
 * Deliberately one tab with two role-gated sections rather than two tabs.
 * "Apply" and "approve" are the same subject seen from two sides, and a
 * manager reviewing their team still has their own overtime to file; splitting
 * them would make that person switch tabs to do one job. The existing tab row
 * is already role-gated the same way (see Attendance.jsx).
 *
 * The approval queue copies NoShowQueueTab's structure — filter chips, inline
 * review with a note, toast — because it backs the same
 * createReviewRequestController API shape on the server.
 */

const STATUS_VARIANT = { pending: "warning", approved: "success", rejected: "danger" };

/**
 * Why the evidence flag is on every queue row: it is the difference between
 * "we have clock proof for these hours" and "we are trusting the plan because
 * nobody clocked out". Approving the second kind is a judgement call, and a
 * labour inspection asks exactly this question.
 */
function EvidenceFlag({ evidence, t }) {
  if (!evidence) return null;
  const warn = evidence !== "clocked";
  return (
    <span
      title={t(`overtime.evidence.${evidence}Title`)}
      style={{
        fontSize: "var(--fs-xs)",
        color: warn ? "var(--txt-warning)" : "var(--txt-secondary)",
        whiteSpace: "nowrap",
      }}
    >
      {warn ? "⚠ " : ""}
      {t(`overtime.evidence.${evidence}`)}
    </span>
  );
}

function OvertimeTab() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { isManagerTier, isHRTier, isManager } = useAuth();
  const {
    overtimeRequests,
    refreshOvertimeRequests,
    reviewOvertime,
    cancelOvertime,
    fetchOvertimeBalance,
    employees,
    getAppNow,
  } = useStore();
  const { user } = useAuth();

  const [filterStatus, setFilterStatus] = useState("pending");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [reviewingId, setReviewingId] = useState(null);
  const [note, setNote] = useState("");
  const [actionLoading, setActionLoading] = useState(null);
  // employeeId -> { monthUsed, monthCap, yearUsed, yearCap }, loaded lazily for
  // the rows actually on screen so HR can see the person's running totals
  // before approving more.
  const [balances, setBalances] = useState({});

  const myEmployee = useMemo(
    () =>
      employees.find(
        (e) => e.email && user?.email && e.email.toLowerCase() === user.email.toLowerCase(),
      ) ?? null,
    [employees, user],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      await refreshOvertimeRequests(filterStatus === "all" ? {} : { status: filterStatus });
    } catch (err) {
      setError(translateApiError(err, t) || t("overtime.errors.loadFailed"));
    }
    setLoading(false);
  }, [filterStatus, refreshOvertimeRequests, t]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  // Fetch each listed employee's running totals once. Scoped to what is on
  // screen rather than every employee, same reasoning as the no-show queue's
  // scoped flag check.
  useEffect(() => {
    if (!isManagerTier) return;
    const now = getAppNow();
    const params = { year: now.getFullYear(), month: now.getMonth() + 1 };
    const missing = [...new Set(overtimeRequests.map((r) => r.employeeId))].filter(
      (id) => id && !(id in balances),
    );
    if (!missing.length) return;

    let cancelled = false;
    Promise.all(
      missing.map((id) =>
        fetchOvertimeBalance({ ...params, employeeId: id })
          .then((data) => [id, data])
          .catch(() => [id, null]),
      ),
    ).then((pairs) => {
      if (cancelled) return;
      setBalances((prev) => ({ ...prev, ...Object.fromEntries(pairs) }));
    });
    return () => { cancelled = true; };
    // `balances` is intentionally excluded: it is what this effect writes, and
    // including it would re-run on every write. `missing` already guards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overtimeRequests, isManagerTier, fetchOvertimeBalance, getAppNow]);

  const handleReview = async (id, decision) => {
    setActionLoading(`${id}-${decision}`);
    try {
      await reviewOvertime(id, decision, note);
      setToast(decision === "approved" ? t("overtime.queue.approved") : t("overtime.queue.rejected"));
      setReviewingId(null);
      setNote("");
      load();
    } catch (err) {
      setToast(`Error: ${translateApiError(err, t)}`);
    }
    setActionLoading(null);
  };

  const handleCancel = async (id) => {
    setActionLoading(`${id}-cancel`);
    try {
      await cancelOvertime(id);
      setToast(t("overtime.mine.cancelled"));
    } catch (err) {
      setToast(`Error: ${translateApiError(err, t)}`);
    }
    setActionLoading(null);
  };

  const mine = useMemo(
    () => overtimeRequests.filter((r) => myEmployee && idsMatch(r.employeeId, myEmployee.id)),
    [overtimeRequests, myEmployee],
  );

  // Who this user may assign overtime to. The server enforces the same rule
  // and reports an out-of-department pick in `skipped`, so this is about not
  // offering a choice that would only be refused — same scoping as the roster.
  const assignableEmployees = useMemo(() => {
    if (isHRTier) return employees;
    if (isManager && myEmployee?.department) {
      return employees.filter((e) => e.department === myEmployee.department);
    }
    return [];
  }, [employees, isHRTier, isManager, myEmployee]);

  const spanOf = (r) => `${r.plannedStart}–${r.plannedEnd}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-5)" }}>
      {showModal && (
        <OvertimeRequestModal
          onClose={() => setShowModal(false)}
          onSubmitted={() => { setToast(t("overtime.mine.submitted")); load(); }}
        />
      )}

      {toast && (
        <div style={{
          padding: "var(--sp-3) var(--sp-4)",
          background: toast.startsWith("Error") ? "var(--bg-danger-subtle)" : "var(--bg-success-subtle)",
          border: `1px solid ${toast.startsWith("Error") ? "var(--bdr-danger)" : "var(--bdr-success)"}`,
          borderRadius: "var(--radius-md)", fontSize: "var(--fs-sm)",
          color: toast.startsWith("Error") ? "var(--txt-danger)" : "var(--txt-success)",
        }}>{toast}</div>
      )}

      {/* ── My overtime ── */}
      <div className="content-card">
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", marginBottom: "var(--sp-5)", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: "200px" }}>
            <h3 style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-semibold)", margin: 0 }}>
              {t("overtime.mine.title")}
            </h3>
            <p style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)", marginTop: "2px" }}>
              {t("overtime.mine.description")}
            </p>
          </div>
          <Button onClick={() => setShowModal(true)} disabled={!myEmployee}>
            {t("overtime.mine.apply")}
          </Button>
        </div>

        {!myEmployee ? (
          <div style={{ padding: "var(--sp-6)", textAlign: "center", color: "var(--txt-secondary)", fontSize: "var(--fs-sm)" }}>
            {t("overtime.mine.noProfile")}
          </div>
        ) : mine.length === 0 ? (
          <div style={{ padding: "var(--sp-6)", textAlign: "center", color: "var(--txt-secondary)", fontSize: "var(--fs-sm)" }}>
            {t("overtime.mine.empty")}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("overtime.table.date")}</th>
                  <th>{t("overtime.table.span")}</th>
                  <th>{t("overtime.table.hours")}</th>
                  <th>{t("overtime.table.dayType")}</th>
                  <th>{t("overtime.table.status")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {mine.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDate(r.date, language)}</td>
                    <td>{spanOf(r)}</td>
                    <td>{t("overtime.table.hoursValue", { hours: r.plannedHours })}</td>
                    <td>{t(`overtime.dayType.${r.dayType}`)}</td>
                    <td>
                      <Badge variant={STATUS_VARIANT[r.status] ?? "info"} size="sm">
                        {t(`overtime.status.${r.status}`)}
                      </Badge>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {r.status === "pending" && (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={actionLoading === `${r.id}-cancel`}
                          onClick={() => handleCancel(r.id)}
                        >
                          {t("overtime.mine.cancel")}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Assign overtime (HR / Admin / Manager) ── */}
      {isManagerTier && (
        <AssignOvertimePanel
          employees={assignableEmployees}
          onAssigned={({ created, skipped }) => {
            if (created.length) {
              setToast(t("overtime.assign.toast", { created: created.length, skipped: skipped.length }));
            }
            load();
          }}
        />
      )}

      {/* ── Approval queue (HR / Admin / Manager) ── */}
      {isManagerTier && (
        <div className="content-card">
          <div style={{ marginBottom: "var(--sp-5)" }}>
            <h3 style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-semibold)", margin: 0 }}>
              {t("overtime.queue.title")}
            </h3>
            <p style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)", marginTop: "2px" }}>
              {t("overtime.queue.description")}
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", marginBottom: "var(--sp-5)", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: "var(--sp-1)", padding: "3px", background: "var(--bg-surface-alt)", borderRadius: "var(--radius-sm)" }}>
              {["pending", "approved", "rejected", "all"].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setFilterStatus(s); setReviewingId(null); }}
                  style={{
                    padding: "5px 12px", borderRadius: "6px", border: "none", cursor: "pointer",
                    background: filterStatus === s ? "var(--bg-surface)" : "transparent",
                    color: filterStatus === s ? "var(--txt-primary)" : "var(--txt-secondary)",
                    fontFamily: "var(--font-family)", fontSize: "var(--fs-xs)",
                    fontWeight: filterStatus === s ? "var(--fw-medium)" : "var(--fw-regular)",
                    boxShadow: filterStatus === s ? "var(--shadow-xs)" : "none",
                  }}
                >{t(`settings.statusFilter.${s}`)}</button>
              ))}
            </div>
            <Button variant="secondary" size="sm" onClick={load}>{t("settings.refresh")}</Button>
            <span style={{ marginLeft: "auto", fontSize: "var(--fs-xs)", color: "var(--txt-secondary)" }}>
              {t("overtime.queue.count", { count: overtimeRequests.length })}
            </span>
          </div>

          {error && (
            <div style={{
              marginBottom: "var(--sp-4)", padding: "var(--sp-3) var(--sp-4)",
              background: "var(--bg-danger-subtle)", border: "1px solid var(--bdr-danger)",
              borderRadius: "var(--radius-md)", color: "var(--txt-danger)", fontSize: "var(--fs-sm)",
            }}>{error}</div>
          )}

          {loading ? (
            <div style={{ padding: "var(--sp-6)", textAlign: "center", color: "var(--txt-secondary)", fontSize: "var(--fs-sm)" }}>
              {t("overtime.queue.loading")}
            </div>
          ) : overtimeRequests.length === 0 ? (
            <div style={{ padding: "var(--sp-8)", textAlign: "center", color: "var(--txt-secondary)", fontSize: "var(--fs-sm)" }}>
              {t("overtime.queue.empty")}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
              {overtimeRequests.map((r) => {
                const isOpen = reviewingId === r.id;
                const bal = balances[r.employeeId];
                return (
                  <div key={r.id} style={{
                    border: `1px solid ${isOpen ? "var(--bdr-brand)" : "var(--bdr-subtle)"}`,
                    borderRadius: "var(--radius-md)", padding: "var(--sp-4)",
                    background: "var(--bg-surface-alt)", transition: "border-color 0.15s",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", flexWrap: "wrap" }}>
                      <Avatar name={r.employeeName ?? "?"} size="sm" />
                      <div style={{ flex: 1, minWidth: "200px" }}>
                        <div style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-medium)", color: "var(--txt-primary)" }}>
                          {r.employeeName}{" "}
                          <span style={{ color: "var(--txt-secondary)", fontWeight: "var(--fw-regular)" }}>
                            ({r.employeeCode})
                          </span>
                        </div>
                        <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", marginTop: "2px" }}>
                          {t("overtime.queue.rowLine", {
                            date: formatDate(r.date, language),
                            span: spanOf(r),
                            hours: r.plannedHours,
                            dayType: t(`overtime.dayType.${r.dayType}`),
                          })}
                        </div>
                        <div style={{ display: "flex", gap: "var(--sp-3)", marginTop: "4px", flexWrap: "wrap" }}>
                          {bal && (
                            <span style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)" }}>
                              {t("overtime.queue.totals", {
                                monthUsed: bal.monthUsed, monthCap: bal.monthCap,
                                yearUsed: bal.yearUsed, yearCap: bal.yearCap,
                              })}
                            </span>
                          )}
                          <EvidenceFlag evidence={r.otEvidence} t={t} />
                          {r.origin === "assigned" && (
                            <span style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)" }}>
                              {t("overtime.queue.assigned")}
                            </span>
                          )}
                        </div>
                      </div>
                      <Badge variant={STATUS_VARIANT[r.status] ?? "info"} size="sm">
                        {t(`overtime.status.${r.status}`)}
                      </Badge>
                      {r.status === "pending" && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => { setReviewingId(isOpen ? null : r.id); setNote(""); }}
                        >
                          {isOpen ? t("settings.close") : t("settings.review")}
                        </Button>
                      )}
                    </div>

                    {isOpen && (
                      <div style={{ marginTop: "var(--sp-4)", paddingTop: "var(--sp-4)", borderTop: "1px solid var(--bdr-subtle)" }}>
                        {r.reason && (
                          <p style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)", marginTop: 0 }}>
                            {t("overtime.queue.reasonLabel")}: {r.reason}
                          </p>
                        )}
                        <textarea
                          rows={2}
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder={t("overtime.queue.notePlaceholder")}
                          style={{ width: "100%", marginBottom: "var(--sp-3)" }}
                        />
                        <div style={{ display: "flex", gap: "var(--sp-2)", justifyContent: "flex-end" }}>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={actionLoading === `${r.id}-rejected`}
                            onClick={() => handleReview(r.id, "rejected")}
                          >
                            {t("overtime.queue.reject")}
                          </Button>
                          <Button
                            size="sm"
                            disabled={actionLoading === `${r.id}-approved`}
                            onClick={() => handleReview(r.id, "approved")}
                          >
                            {t("overtime.queue.approve")}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default OvertimeTab;
