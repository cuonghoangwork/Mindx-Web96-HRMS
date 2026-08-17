import { useState, useMemo, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { EmployeesAPI, NoShowReviewsAPI } from "../api";
import { formatDate } from "../utils/format";
import Avatar from "../components/Avatar";
import Badge from "../components/Badge";
import Button from "../components/Button";
import { idsMatch } from "../utils/id";
import { resolveStatus, buildMonthAttendance, buildDayData } from "../utils/attendance";

/* ─── helpers ─── */
const fmt = (v) => {
  if (!v) return "—";
  const [h, m] = v.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};

const variantMap = (s) =>
  ({ Present: "success", Late: "warning", "On Leave": "info" })[s] ?? "danger";

// Task 6.2 — status codes ("Present"/"Late"/"On Leave"/"Absent") stay in
// English everywhere they're used as data (equality checks, variantMap
// above); this only translates the label actually shown to the user.
const STATUS_LABEL_KEY = {
  Present: "attendance.status.present",
  Late: "attendance.status.late",
  "On Leave": "attendance.status.onLeave",
};
const statusLabel = (t, status) => t(STATUS_LABEL_KEY[status] ?? "attendance.status.absent");

const isoOf = (d) => d.toISOString().split("T")[0];

/* ═══════════════════════════════════════════
   Weekly bar chart — % checked-in per day, click to select
═══════════════════════════════════════════ */
function WeeklyBars({ weekDates, dayData, selectedDay, onSelectDay, days }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "var(--sp-3)", height: "130px" }}>
      {weekDates.map((date) => {
        const dateStr = isoOf(date);
        const dow = date.getDay();
        const isWeekend = dow === 0 || dow === 6;
        const data = dayData[dateStr];
        const pct = data ? Math.round(((data.present + data.late) / data.total) * 100) : 0;
        const isSelected = dateStr === selectedDay;

        return (
          <div
            key={dateStr}
            onClick={() => !isWeekend && data && onSelectDay(dateStr)}
            style={{
              flex: 1, height: "100%", display: "flex", flexDirection: "column",
              alignItems: "center", gap: "var(--sp-2)",
              cursor: isWeekend || !data ? "default" : "pointer",
              opacity: isWeekend ? 0.4 : 1,
            }}
          >
            <div style={{ fontSize: "var(--fs-xs)", fontWeight: "var(--fw-semibold)", color: "var(--txt-secondary)" }}>
              {data ? `${pct}%` : "—"}
            </div>
            <div style={{ width: "100%", flex: 1, display: "flex", alignItems: "flex-end", background: "var(--bg-surface-sub)" }}>
              {data && (
                <div style={{
                  height: `${Math.max(pct, 4)}%`, width: "100%",
                  background: isSelected ? "var(--clr-primary-400)" : "var(--txt-primary)",
                  opacity: isSelected ? 1 : 0.5,
                  transition: "background 0.15s, opacity 0.15s",
                }} />
              )}
            </div>
            <div style={{
              fontSize: "var(--fs-xs)", fontWeight: isSelected ? "var(--fw-bold)" : "var(--fw-medium)",
              color: isSelected ? "var(--txt-primary-brand)" : "var(--txt-disabled)",
              textTransform: "uppercase",
            }}>
              {days[dow]}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════
   Monthly heatmap — alpha-shaded rate cells, click to select
═══════════════════════════════════════════ */
function MonthlyHeatmap({ year, month, dayData, selectedDay, onSelectDay, todayStr, weekdayLabels }) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay();

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push({ blank: true, key: `b${i}` });
  for (let d = 1; d <= daysInMonth; d++) {
    const dateISO = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dow = new Date(year, month, d).getDay();
    const isWeekend = dow === 0 || dow === 6;
    const data = dayData[dateISO];
    const rate = data && !isWeekend ? Math.round(((data.present + data.late) / data.total) * 100) : null;
    cells.push({ blank: false, key: dateISO, dateISO, day: d, rate, isWeekend, isToday: dateISO === todayStr, isSelected: dateISO === selectedDay });
  }
  while (cells.length % 7 !== 0) cells.push({ blank: true, key: `e${cells.length}` });

  const alphaFor = (rate) => 0.06 + (rate / 100) * 0.3;

  return (
    <div style={{ border: "1px solid var(--bdr-subtle)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid var(--bdr-subtle)" }}>
        {weekdayLabels.map((l) => (
          <div key={l} style={{ padding: "var(--sp-2) 0", fontSize: "var(--fs-2xs)", fontWeight: "var(--fw-bold)", color: "var(--txt-disabled)", textAlign: "center", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {l}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
        {cells.map((c) => (
          <div
            key={c.key}
            onClick={() => !c.blank && c.rate !== null && onSelectDay(c.dateISO)}
            style={{
              minHeight: "62px", padding: "var(--sp-2) var(--sp-3)",
              display: "flex", flexDirection: "column", justifyContent: "space-between",
              borderRight: "1px solid var(--bdr-subtle)", borderBottom: "1px solid var(--bdr-subtle)",
              cursor: !c.blank && c.rate !== null ? "pointer" : "default",
              background: c.blank ? "transparent"
                : c.isSelected ? "var(--bg-primary-subtle)"
                : c.rate !== null ? `rgba(47, 111, 237, ${alphaFor(c.rate)})`
                : "transparent",
              boxShadow: c.isSelected ? "inset 0 0 0 2px var(--bdr-brand)"
                : c.isToday ? "inset 0 0 0 2px var(--clr-primary-300)" : "none",
            }}
          >
            {!c.blank && (
              <>
                <div style={{ fontSize: "var(--fs-xs)", fontWeight: "var(--fw-bold)", color: c.isToday ? "var(--txt-primary-brand)" : "var(--txt-primary)" }}>
                  {c.day}
                </div>
                {c.rate !== null && (
                  <div style={{ height: "4px", background: "var(--bg-surface-sub)" }}>
                    <div style={{ height: "4px", width: `${c.rate}%`, background: "var(--clr-primary-400)" }} />
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   No-show queue — moved here from Settings.jsx (mockup puts this
   review queue as the Attendance page's second tab, not a Settings
   section). Same NoShowReviewsAPI the Settings panel used to call —
   real backend-generated flags (task 4.7), just relocated.
═══════════════════════════════════════════ */
function NoShowQueueTab() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterStatus, setFilterStatus] = useState("pending");
  const [reviewingId, setReviewingId] = useState(null);
  const [note, setNote] = useState("");
  const [actionLoading, setActionLoading] = useState(null);
  const [toast, setToast] = useState("");

  const loadRequests = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await NoShowReviewsAPI.list({ status: filterStatus });
      setRequests(res.items ?? []);
    } catch (err) {
      setError(err.message || t("settings.noShowReview.loadFailed"));
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
    setActionLoading(decision);
    try {
      await NoShowReviewsAPI.review(requestId, decision, note);
      setToast(decision === "approved" ? t("settings.noShowReview.confirmSuccess") : t("settings.noShowReview.dismissSuccess"));
      setReviewingId(null);
      setNote("");
      loadRequests();
    } catch (err) {
      setToast(`Error: ${err.message}`);
    }
    setActionLoading(null);
  };

  return (
    <div className="content-card">
      <div style={{ marginBottom: "var(--sp-5)" }}>
        <h3 style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-semibold)", margin: 0 }}>
          {t("settings.sections.noShowReviewQueue.title")}
        </h3>
        <p style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)", marginTop: "2px" }}>
          {t("settings.sections.noShowReviewQueue.description")}
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", marginBottom: "var(--sp-5)", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "var(--sp-1)", padding: "3px", background: "var(--bg-surface-alt)", borderRadius: "var(--radius-sm)" }}>
          {["pending", "approved", "rejected", "all"].map((s) => (
            <button
              key={s} type="button"
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
        <Button variant="secondary" size="sm" onClick={loadRequests}>{t("settings.refresh")}</Button>
        <span style={{ marginLeft: "auto", fontSize: "var(--fs-xs)", color: "var(--txt-secondary)" }}>
          {t("settings.noShowReview.flagCount", { count: requests.length })}
        </span>
      </div>

      {toast && (
        <div style={{
          marginBottom: "var(--sp-4)", padding: "var(--sp-3) var(--sp-4)",
          background: toast.startsWith("Error") ? "var(--bg-danger-subtle)" : "var(--bg-success-subtle)",
          border: `1px solid ${toast.startsWith("Error") ? "var(--bdr-danger)" : "var(--bdr-success)"}`,
          borderRadius: "var(--radius-md)", fontSize: "var(--fs-sm)",
          color: toast.startsWith("Error") ? "var(--txt-danger)" : "var(--txt-success)",
        }}>{toast}</div>
      )}
      {error && (
        <div style={{
          marginBottom: "var(--sp-4)", padding: "var(--sp-3) var(--sp-4)",
          background: "var(--bg-danger-subtle)", border: "1px solid var(--bdr-danger)",
          borderRadius: "var(--radius-md)", color: "var(--txt-danger)", fontSize: "var(--fs-sm)",
        }}>{error}</div>
      )}

      {loading ? (
        <div style={{ padding: "var(--sp-6)", textAlign: "center", color: "var(--txt-secondary)", fontSize: "var(--fs-sm)" }}>
          {t("settings.noShowReview.loadingFlags")}
        </div>
      ) : requests.length === 0 ? (
        <div style={{ padding: "var(--sp-8)", textAlign: "center", color: "var(--txt-secondary)", fontSize: "var(--fs-sm)" }}>
          {filterStatus !== "all"
            ? t("settings.noShowReview.noFlagsFiltered", { status: t(`settings.statusFilter.${filterStatus}`) })
            : t("settings.noShowReview.noFlags")}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
          {requests.map((req) => {
            const isOpen = reviewingId === req.id;
            return (
              <div key={req.id} style={{
                border: `1px solid ${isOpen ? "var(--bdr-brand)" : "var(--bdr-subtle)"}`,
                borderRadius: "var(--radius-md)", padding: "var(--sp-4)",
                background: "var(--bg-surface-alt)", transition: "border-color 0.15s",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", flexWrap: "wrap" }}>
                  <Avatar name={req.employeeName ?? "?"} size="sm" />
                  <div style={{ flex: 1, minWidth: "180px" }}>
                    <div style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-medium)", color: "var(--txt-primary)" }}>
                      {req.employeeName} <span style={{ color: "var(--txt-secondary)", fontWeight: "var(--fw-regular)" }}>({req.employeeCode})</span>
                    </div>
                    <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", marginTop: "2px" }}>
                      {t("settings.noShowReview.recordLine", { count: req.noShowCount, date: formatDate(req.flaggedAt ?? req.createdAt, language) })}
                    </div>
                  </div>
                  <Badge variant={req.status === "pending" ? "warning" : req.status === "approved" ? "success" : "danger"} size="sm">
                    {t(`settings.statusFilter.${req.status}`) || req.status}
                  </Badge>
                  {req.status === "pending" && (
                    <Button
                      variant="secondary" size="sm"
                      onClick={() => { setReviewingId(isOpen ? null : req.id); setNote(""); }}
                    >{isOpen ? t("settings.close") : t("settings.review")}</Button>
                  )}
                </div>

                {isOpen && (
                  <div style={{ marginTop: "var(--sp-4)", paddingTop: "var(--sp-4)", borderTop: "1px solid var(--bdr-subtle)" }}>
                    <div style={{
                      marginBottom: "var(--sp-4)", padding: "var(--sp-3) var(--sp-4)",
                      background: "var(--bg-warning-subtle)", border: "1px solid var(--bdr-warning)",
                      borderRadius: "var(--radius-md)", color: "var(--txt-warning)", fontSize: "var(--fs-sm)",
                    }}>
                      {t("settings.noShowReview.autoStatusWarning")}
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor={`noshow-note-${req.id}`}>
                        {t("settings.reviewNoteLabel")} <span style={{ color: "var(--txt-secondary)", fontWeight: "var(--fw-regular)" }}>{t("settings.optional")}</span>
                      </label>
                      <textarea
                        id={`noshow-note-${req.id}`} rows={2} value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder={t("settings.noShowReview.notePlaceholder")}
                        style={{ resize: "vertical" }}
                      />
                    </div>
                    <div style={{ display: "flex", gap: "var(--sp-3)", flexWrap: "wrap" }}>
                      <Button variant="success" disabled={actionLoading !== null} onClick={() => handleReview(req.id, "approved")}>
                        {actionLoading === "approved" ? t("settings.savingEllipsis") : t("settings.noShowReview.confirmPattern")}
                      </Button>
                      <Button variant="danger" disabled={actionLoading !== null} onClick={() => handleReview(req.id, "rejected")}>
                        {actionLoading === "rejected" ? t("settings.savingEllipsis") : t("settings.noShowReview.dismiss")}
                      </Button>
                    </div>
                  </div>
                )}

                {req.status !== "pending" && req.reviewNote && (
                  <div style={{
                    marginTop: "var(--sp-3)", paddingTop: "var(--sp-3)",
                    borderTop: "1px solid var(--bdr-subtle)", fontStyle: "italic",
                    fontSize: "var(--fs-sm)", color: "var(--txt-secondary)",
                  }}>{t("settings.adminNote", { note: req.reviewNote })}</div>
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
function Attendance() {
  const { t } = useTranslation();
  const days = t("common.days", { returnObjects: true });
  const months = t("common.months", { returnObjects: true });
  const monthsShort = months.map((m) => m.slice(0, 3));
  const { attendance, employees, getAppNow, clockIn, clockOut } = useStore();
  const { user: currentUser, isAdmin, isManager } = useAuth();
  const navigate = useNavigate();

  const [searchParams] = useSearchParams();
  const linkedEmployeeId = searchParams.get("employee");

  // 8.0e Day 7 — department-scoped roster: Admin sees everyone, Manager is
  // scoped to their own department, Employee sees only themselves.
  const [myEmployee, setMyEmployee] = useState(null);
  useEffect(() => {
    let cancelled = false;
    EmployeesAPI.myProfile()
      .then((res) => { if (!cancelled) setMyEmployee(res.data ?? null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const scopedEmployees = useMemo(() => {
    if (isAdmin) return employees;
    if (isManager && myEmployee?.department) {
      return employees.filter((e) => e.department === myEmployee.department);
    }
    if (myEmployee) return employees.filter((e) => idsMatch(e.id, myEmployee.id));
    return employees;
  }, [employees, isAdmin, isManager, myEmployee]);

  const today = getAppNow();
  const todayStr = isoOf(today);

  // Admin-only "Roster" / "No-show queue" tabs, matching the mockup's
  // isAdminRole-gated toggle. The queue itself moved here wholesale from
  // Settings.jsx (see NoShowQueueTab above) — mockup never shows it there.
  const [activeTab, setActiveTab] = useState("roster");

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [granularity, setGranularity] = useState("weekly"); // "weekly" | "monthly"
  const [weekAnchor, setWeekAnchor] = useState(() => today);
  const [selectedDay, setSelectedDay] = useState(todayStr);
  const [search, setSearch] = useState("");
  const [showReport, setShowReport] = useState(false);
  const [actionLoadingKey, setActionLoadingKey] = useState(null);

  // Deep link from ViewEmployee (`/attendance?employee=<id>`) — narrow the
  // roster search to that employee instead of switching views entirely.
  useEffect(() => {
    if (!linkedEmployeeId) return;
    const emp = employees.find((e) => idsMatch(e.id, linkedEmployeeId));
    if (emp) setSearch(emp.name);
  }, [linkedEmployeeId, employees]);

  /* ── Enrich real attendance with employee names + Late status ── */
  const enriched = useMemo(() => attendance
    .filter((r) => scopedEmployees.some((e) => idsMatch(e.id, r.employeeId)))
    .map((r) => {
      const emp = scopedEmployees.find((e) => idsMatch(e.id, r.employeeId));
      return { ...r, name: emp?.name ?? `Employee #${r.employeeId}`, status: resolveStatus(r) };
    }), [attendance, scopedEmployees]);

  const fullMonth = useMemo(
    () => buildMonthAttendance(viewYear, viewMonth, scopedEmployees, enriched),
    [viewYear, viewMonth, scopedEmployees, enriched]
  );
  const dayData = useMemo(() => buildDayData(fullMonth, scopedEmployees), [fullMonth, scopedEmployees]);

  const weekDates = useMemo(() => {
    const d = new Date(weekAnchor);
    d.setHours(0, 0, 0, 0);
    const sunday = new Date(d);
    sunday.setDate(d.getDate() - d.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(sunday);
      day.setDate(sunday.getDate() + i);
      return day;
    });
  }, [weekAnchor]);

  const weekDayData = useMemo(() => {
    const monthKeys = new Set(weekDates.map((d) => `${d.getFullYear()}-${d.getMonth()}`));
    const merged = {};
    monthKeys.forEach((key) => {
      const [y, m] = key.split("-").map(Number);
      const prefix = `${y}-${String(m + 1).padStart(2, "0")}-`;
      const existingForMonth = enriched.filter((r) => r.date.startsWith(prefix));
      const monthFull = buildMonthAttendance(y, m, scopedEmployees, existingForMonth);
      Object.assign(merged, buildDayData(monthFull, scopedEmployees));
    });
    return merged;
  }, [weekDates, scopedEmployees, enriched]);

  const activeDayData = granularity === "weekly" ? weekDayData : dayData;
  const selectedData = activeDayData[selectedDay] ?? null;

  const prevMonth = () => { if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); } else setViewMonth((m) => m - 1); };
  const nextMonth = () => { if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); } else setViewMonth((m) => m + 1); };
  const prevWeek = () => setWeekAnchor((d) => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; });
  const nextWeek = () => setWeekAnchor((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; });

  const dSel = new Date(selectedDay + "T00:00:00");
  const dayLabel = granularity === "monthly"
    ? `${monthsShort[dSel.getMonth()]} ${dSel.getDate()}${selectedDay === todayStr ? ` (${t("attendance.today", { defaultValue: "Today" })})` : ""}`
    : `${days[dSel.getDay()]}${selectedDay === todayStr ? ` (${t("attendance.today", { defaultValue: "Today" })})` : ""}`;

  /* ── Stat strip (scoped to the selected day) ── */
  const statCells = [
    {
      label: t("attendance.stats.checkedIn", { defaultValue: "Checked In" }),
      value: selectedData ? `${selectedData.present + selectedData.late}/${selectedData.total}` : "0/0",
      trend: selectedData ? `${Math.round(((selectedData.present + selectedData.late) / selectedData.total) * 100)}% attendance` : "—",
    },
    {
      label: t("attendance.stats.present", { defaultValue: "Present" }),
      value: String(selectedData?.present ?? 0),
      trend: t("attendance.stats.presentTrend", { defaultValue: "On time" }),
    },
    {
      label: t("attendance.stats.late", { defaultValue: "Late" }),
      value: String(selectedData?.late ?? 0),
      trend: t("attendance.stats.lateTrend", { defaultValue: "Checked in late" }),
    },
    {
      label: t("attendance.stats.absentLeave", { defaultValue: "Absent / Leave" }),
      value: String((selectedData?.absent ?? 0) + (selectedData?.leave ?? 0)),
      trend: `${selectedData?.leave ?? 0} on leave`,
    },
  ];

  /* ── Roster rows for the selected day, filtered by search ── */
  const rosterRows = useMemo(() => {
    const records = selectedData?.records ?? [];
    const searchLower = search.trim().toLowerCase();
    const canAct = (isAdmin || isManager) && selectedDay === todayStr;
    return records
      .map((r) => {
        const emp = scopedEmployees.find((e) => idsMatch(e.id, r.employeeId));
        return {
          ...r,
          department: emp?.department ?? "—",
          designation: emp?.designation ?? "",
          employeeCode: emp?.employeeId ?? "",
          canCheckIn: canAct && r.status !== "On Leave" && !r.checkIn,
          canCheckOut: canAct && r.status !== "On Leave" && Boolean(r.checkIn) && !r.checkOut,
        };
      })
      .filter((r) =>
        !searchLower ||
        r.name.toLowerCase().includes(searchLower) ||
        r.department.toLowerCase().includes(searchLower) ||
        r.designation.toLowerCase().includes(searchLower)
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [selectedData, search, scopedEmployees, isAdmin, isManager, selectedDay, todayStr]);

  const handleInlineCheckIn = async (employeeId) => {
    setActionLoadingKey(`${employeeId}-in`);
    const now = getAppNow();
    const t = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    try { await clockIn(employeeId, todayStr, t); } catch { /* surfaced via row staying unchanged */ }
    setActionLoadingKey(null);
  };
  const handleInlineCheckOut = async (employeeId) => {
    setActionLoadingKey(`${employeeId}-out`);
    const now = getAppNow();
    const t = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    try { await clockOut(employeeId, todayStr, t); } catch { /* surfaced via row staying unchanged */ }
    setActionLoadingKey(null);
  };

  /* ── "Report" modal — month-to-date rate + most-missed-this-week ── */
  const cellsSoFar = Object.entries(dayData)
    .filter(([d]) => d.startsWith(`${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-`) && new Date(d + "T00:00:00") <= today)
    .map(([d, v]) => ({ date: d, rate: Math.round(((v.present + v.late) / v.total) * 100) }));
  const avgMonthRate = cellsSoFar.length ? Math.round(cellsSoFar.reduce((s, c) => s + c.rate, 0) / cellsSoFar.length) : 0;
  const bestCell = cellsSoFar.reduce((a, b) => (!a || b.rate > a.rate ? b : a), null);
  const worstCell = cellsSoFar.reduce((a, b) => (!a || b.rate < a.rate ? b : a), null);
  const fmtCal = (iso) => { const d = new Date(iso + "T00:00:00"); return `${monthsShort[d.getMonth()]} ${d.getDate()}`; };
  const reportStatCells = [
    { label: "Month to date", value: `${avgMonthRate}%`, trend: "Avg. attendance" },
    { label: "Best day", value: bestCell ? `${bestCell.rate}%` : "—", trend: bestCell ? fmtCal(bestCell.date) : "" },
    { label: "Toughest day", value: worstCell ? `${worstCell.rate}%` : "—", trend: worstCell ? fmtCal(worstCell.date) : "" },
    { label: "Days logged", value: String(cellsSoFar.length), trend: months[viewMonth] },
  ];
  const missedThisWeek = useMemo(() => {
    return scopedEmployees.map((e) => {
      let absent = 0, late = 0;
      weekDates.forEach((d) => {
        const dow = d.getDay();
        if (dow === 0 || dow === 6) return;
        const rec = weekDayData[isoOf(d)]?.records?.find((r) => idsMatch(r.employeeId, e.id));
        if (rec?.status === "Absent") absent++;
        else if (rec?.status === "Late") late++;
      });
      return { name: e.name, department: e.department, absent, late };
    }).filter((r) => r.absent + r.late > 0).sort((a, b) => (b.absent * 2 + b.late) - (a.absent * 2 + a.late)).slice(0, 5);
  }, [scopedEmployees, weekDates, weekDayData]);

  const noShowCountBadge = ""; // pending-flag count intentionally omitted here — see disclosure below the tab row

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-5)" }}>

      {/* ── Roster / No-show queue tabs (admin only) ── */}
      {isAdmin && (
        <div style={{ display: "flex", gap: "var(--sp-1)", padding: "3px", background: "var(--bg-surface-alt)", borderRadius: "var(--radius-sm)", alignSelf: "flex-start" }}>
          {[
            { key: "roster", label: t("attendance.tabs.roster", { defaultValue: "Roster" }) },
            { key: "noshow", label: t("attendance.tabs.noShowQueue", { defaultValue: "No-show queue" }) },
          ].map(({ key, label }) => (
            <button key={key} type="button" onClick={() => setActiveTab(key)} style={{
              padding: "7px 16px", borderRadius: "6px", border: "none", cursor: "pointer",
              background: activeTab === key ? "var(--bg-surface)" : "transparent",
              color: activeTab === key ? "var(--txt-primary)" : "var(--txt-secondary)",
              fontFamily: "var(--font-family)", fontSize: "var(--fs-sm)",
              fontWeight: activeTab === key ? "var(--fw-semibold)" : "var(--fw-regular)",
              boxShadow: activeTab === key ? "var(--shadow-xs)" : "none",
            }}>{label}{noShowCountBadge}</button>
          ))}
        </div>
      )}

      {activeTab === "noshow" ? (
        <NoShowQueueTab />
      ) : (
        <>
          {isManager && (
            <p style={{ fontSize: "var(--fs-xs)", color: "var(--txt-info)", margin: 0 }}>
              Showing your team{myEmployee?.department ? ` (${myEmployee.department})` : ""} — {scopedEmployees.length} employee{scopedEmployees.length === 1 ? "" : "s"}
            </p>
          )}
          {!isAdmin && !isManager && (
            <p style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", margin: 0 }}>
              Showing your own attendance
            </p>
          )}

          {/* ── Stat strip ── */}
          <div className="stat-strip">
            {statCells.map((c) => (
              <div key={c.label} className="stat-cell" style={{ cursor: "default" }}>
                <div className="stat-cell-label">{c.label}</div>
                <div className="stat-cell-value">{c.value}</div>
                <div className="stat-cell-trend">{c.trend}</div>
              </div>
            ))}
          </div>

          {/* ── Weekly bars / Monthly heatmap panel ── */}
          <div className="content-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--sp-3)", marginBottom: "var(--sp-4)", flexWrap: "wrap" }}>
              <div>
                <h3 style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-semibold)", margin: 0 }}>
                  {granularity === "monthly" ? "Monthly attendance" : "Weekly attendance"}
                </h3>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", marginTop: "2px" }}>
                  {granularity === "monthly" ? `${months[viewMonth]} ${viewYear} · ` : ""}Click a day to view its roster
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", flexWrap: "wrap" }}>
                {granularity === "monthly" ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
                    <Button variant="secondary" size="sm" onClick={prevMonth}>‹</Button>
                    <span style={{ fontSize: "var(--fs-sm)", fontWeight: "var(--fw-medium)", minWidth: "110px", textAlign: "center" }}>
                      {months[viewMonth]} {viewYear}
                    </span>
                    <Button variant="secondary" size="sm" onClick={nextMonth}>›</Button>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
                    <Button variant="secondary" size="sm" onClick={prevWeek}>‹</Button>
                    <span style={{ fontSize: "var(--fs-sm)", fontWeight: "var(--fw-medium)", minWidth: "150px", textAlign: "center" }}>
                      {monthsShort[weekDates[0].getMonth()]} {weekDates[0].getDate()} – {weekDates[6].getMonth() !== weekDates[0].getMonth() ? `${monthsShort[weekDates[6].getMonth()]} ` : ""}{weekDates[6].getDate()}
                    </span>
                    <Button variant="secondary" size="sm" onClick={nextWeek}>›</Button>
                  </div>
                )}
                <div style={{ display: "flex", border: "1px solid var(--bdr-default)" }}>
                  {[["weekly", "Weekly"], ["monthly", "Monthly"]].map(([v, label]) => (
                    <button key={v} type="button" onClick={() => setGranularity(v)} style={{
                      padding: "6px 14px", border: "none", cursor: "pointer",
                      background: granularity === v ? "var(--txt-primary)" : "transparent",
                      color: granularity === v ? "var(--bg-surface)" : "var(--txt-secondary)",
                      fontFamily: "var(--font-family)", fontSize: "var(--fs-xs)", fontWeight: "var(--fw-semibold)",
                    }}>{label}</button>
                  ))}
                </div>
                <Button variant="secondary" size="sm" onClick={() => setShowReport(true)}>Report</Button>
              </div>
            </div>

            {granularity === "weekly" ? (
              <WeeklyBars weekDates={weekDates} dayData={weekDayData} selectedDay={selectedDay} onSelectDay={setSelectedDay} days={days} />
            ) : (
              <MonthlyHeatmap
                year={viewYear} month={viewMonth} dayData={dayData}
                selectedDay={selectedDay} onSelectDay={setSelectedDay}
                todayStr={todayStr} weekdayLabels={days}
              />
            )}
          </div>

          {/* ── Roster panel ── */}
          <div className="content-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--sp-3)", marginBottom: "var(--sp-5)", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Roster</div>
                <h3 style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-semibold)", margin: 0 }}>{dayLabel} roster</h3>
              </div>
              <input
                type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder={t("common2.searchEmployeesPlaceholder", { defaultValue: "Search employees…" })}
                style={{
                  fontFamily: "var(--font-family)", fontSize: "var(--fs-sm)", padding: "9px var(--sp-4)",
                  background: "var(--bg-surface)", color: "var(--txt-primary)",
                  border: "1px solid var(--bdr-default)", borderRadius: "var(--radius-md)", width: "240px",
                }}
              />
            </div>

            {rosterRows.length === 0 ? (
              <div className="empty-state">
                <h3 className="empty-state-title">No employees match</h3>
                <p className="empty-state-description">Try a different search, or pick another day.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t("attendance.table.headers.employee")}</th>
                      <th>Department</th>
                      <th>{t("attendance.table.headers.checkIn")}</th>
                      <th>{t("attendance.table.headers.checkOut")}</th>
                      <th>{t("attendance.table.headers.status")}</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rosterRows.map((r) => (
                      <tr key={r.employeeId} style={{ cursor: "pointer" }} onClick={() => navigate(`/employees/${r.employeeId}`)}>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
                            <Avatar name={r.name} size="xs" />
                            <div>
                              <div style={{ fontWeight: "var(--fw-medium)" }}>{r.name}</div>
                              {r.employeeCode && <div style={{ fontSize: "var(--fs-2xs)", color: "var(--txt-secondary)" }}>{r.employeeCode}</div>}
                            </div>
                          </div>
                        </td>
                        <td style={{ color: "var(--txt-secondary)" }}>{r.department}</td>
                        <td style={{ color: r.status === "Late" ? "var(--txt-warning)" : "var(--txt-primary)" }}>{fmt(r.checkIn)}</td>
                        <td style={{ color: "var(--txt-secondary)" }}>{fmt(r.checkOut)}</td>
                        <td><Badge variant={variantMap(r.status)} size="sm">{statusLabel(t, r.status)}</Badge></td>
                        <td onClick={(e) => e.stopPropagation()}>
                          {r.canCheckIn && (
                            <Button
                              variant="primary" size="xs"
                              loading={actionLoadingKey === `${r.employeeId}-in`}
                              onClick={() => handleInlineCheckIn(r.employeeId)}
                              style={{ marginRight: "var(--sp-2)" }}
                            >Check-in</Button>
                          )}
                          {r.canCheckOut && (
                            <Button
                              variant="secondary" size="xs"
                              loading={actionLoadingKey === `${r.employeeId}-out`}
                              onClick={() => handleInlineCheckOut(r.employeeId)}
                              style={{ marginRight: "var(--sp-2)" }}
                            >Check-out</Button>
                          )}
                          <Button variant="link" size="xs" onClick={() => navigate(`/employees/${r.employeeId}`)}>View</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Report modal ── */}
      {showReport && (
        <div
          role="dialog" aria-modal="true"
          style={{ position: "fixed", inset: 0, background: "rgba(11,22,38,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: "var(--z-modal)" }}
          onClick={() => setShowReport(false)}
        >
          <div
            className="content-card"
            style={{
              width: "560px", maxWidth: "92vw", maxHeight: "85vh", overflowY: "auto",
              background: "var(--bg-page)", boxShadow: "var(--shadow-xl)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--sp-5)" }}>
              <h3 style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-semibold)", margin: 0 }}>{months[viewMonth]} {viewYear} attendance summary</h3>
              <button onClick={() => setShowReport(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--txt-secondary)", fontSize: "18px", lineHeight: 1 }}>×</button>
            </div>

            <div className="stat-strip" style={{ marginBottom: "var(--sp-5)", gridTemplateColumns: "repeat(4, 1fr)" }}>
              {reportStatCells.map((c) => (
                <div key={c.label} className="stat-cell" style={{ cursor: "default", padding: "var(--sp-3) var(--sp-3)" }}>
                  <div className="stat-cell-label" style={{ height: "28px", lineHeight: "1.35", overflow: "hidden" }}>{c.label}</div>
                  <div className="stat-cell-value sm">{c.value}</div>
                  <div className="stat-cell-trend">{c.trend}</div>
                </div>
              ))}
            </div>

            <h4 style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-semibold)", marginBottom: "var(--sp-3)" }}>Most missed this week</h4>
            {missedThisWeek.length === 0 ? (
              <p style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)" }}>No absences or late check-ins recorded this week.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                {missedThisWeek.map((r) => (
                  <div key={r.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--sp-2) 0", borderBottom: "1px solid var(--bdr-subtle)" }}>
                    <div>
                      <div style={{ fontSize: "var(--fs-sm)", fontWeight: "var(--fw-medium)" }}>{r.name}</div>
                      <div style={{ fontSize: "var(--fs-2xs)", color: "var(--txt-secondary)" }}>{r.department}</div>
                    </div>
                    <div style={{ display: "flex", gap: "var(--sp-2)" }}>
                      {r.absent > 0 && <Badge variant="danger" size="sm">{r.absent} absent</Badge>}
                      {r.late > 0 && <Badge variant="warning" size="sm">{r.late} late</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Attendance;
