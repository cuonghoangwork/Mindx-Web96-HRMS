import { useState, useMemo, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { EmployeesAPI } from "../api";
import { formatDate } from "../utils/format";
import Avatar from "../components/Avatar";
import Badge from "../components/Badge";
import Button from "../components/Button";
import OvertimeTab from "../components/OvertimeTab";
import { idsMatch } from "../utils/id";
import { resolveStatus, buildMonthAttendance, buildDayData, hhmmOf, isoOf } from "../utils/attendance";
import { WeeklyBars } from './attendance/WeeklyBars'
import { MonthlyHeatmap } from './attendance/MonthlyHeatmap'
import { NoShowQueueTab } from './attendance/NoShowQueueTab'

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

/* ═══════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════ */
function Attendance() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const days = t("common.days", { returnObjects: true });
  const months = t("common.months", { returnObjects: true });
  const { attendance, employees, getAppNow, clockIn, clockOut } = useStore();
  const { isManager, isHRTier, isManagerTier } = useAuth();
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
    if (isHRTier) return employees;
    if (isManager && myEmployee?.department) {
      return employees.filter((e) => e.department === myEmployee.department);
    }
    if (myEmployee) return employees.filter((e) => idsMatch(e.id, myEmployee.id));
    return employees;
  }, [employees, isHRTier, isManager, myEmployee]);

  const today = getAppNow();
  const todayStr = isoOf(today);

  // Admin-only "Roster" / "No-show queue" tabs, matching the mockup's
  // isAdminRole-gated toggle. The queue itself moved here wholesale from
  // Settings.jsx (see attendance/NoShowQueueTab.jsx) — mockup never shows it there.
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
    ? `${formatDate(dSel, language, { month: "short", day: "numeric" })}${selectedDay === todayStr ? ` (${t("attendance.today", { defaultValue: "Today" })})` : ""}`
    : `${days[dSel.getDay()]}${selectedDay === todayStr ? ` (${t("attendance.today", { defaultValue: "Today" })})` : ""}`;

  /* ── Stat strip (scoped to the selected day) ── */
  const statCells = [
    {
      label: t("attendance.stats.checkedIn", { defaultValue: "Checked In" }),
      value: selectedData ? `${selectedData.present + selectedData.late}/${selectedData.total}` : "0/0",
      trend: selectedData ? t("attendance.stats.attendanceRateTrend", { pct: Math.round(((selectedData.present + selectedData.late) / selectedData.total) * 100), defaultValue: "{{pct}}% attendance" }) : "—",
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
      trend: t("attendance.stats.onLeaveTrend", { count: selectedData?.leave ?? 0, defaultValue: "{{count}} on leave" }),
    },
  ];

  /* ── Roster rows for the selected day, filtered by search ── */
  const rosterRows = useMemo(() => {
    const records = selectedData?.records ?? [];
    const searchLower = search.trim().toLowerCase();
    const canAct = isManagerTier && selectedDay === todayStr;
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
  }, [selectedData, search, scopedEmployees, isManagerTier, selectedDay, todayStr]);

  // hhmmOf, not getHours() — see utils/attendance.js. The clock time is
  // evaluated server-side against company-timezone rules.
  const handleInlineCheckIn = async (employeeId) => {
    setActionLoadingKey(`${employeeId}-in`);
    try { await clockIn(employeeId, todayStr, hhmmOf(getAppNow())); } catch { /* surfaced via row staying unchanged */ }
    setActionLoadingKey(null);
  };
  const handleInlineCheckOut = async (employeeId) => {
    setActionLoadingKey(`${employeeId}-out`);
    try { await clockOut(employeeId, todayStr, hhmmOf(getAppNow())); } catch { /* surfaced via row staying unchanged */ }
    setActionLoadingKey(null);
  };

  /* ── "Report" modal — month-to-date rate + most-missed-this-week ── */
  const cellsSoFar = Object.entries(dayData)
    .filter(([d]) => d.startsWith(`${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-`) && new Date(d + "T00:00:00") <= today)
    .map(([d, v]) => ({ date: d, rate: Math.round(((v.present + v.late) / v.total) * 100) }));
  const avgMonthRate = cellsSoFar.length ? Math.round(cellsSoFar.reduce((s, c) => s + c.rate, 0) / cellsSoFar.length) : 0;
  const bestCell = cellsSoFar.reduce((a, b) => (!a || b.rate > a.rate ? b : a), null);
  const worstCell = cellsSoFar.reduce((a, b) => (!a || b.rate < a.rate ? b : a), null);
  const fmtCal = (iso) => formatDate(new Date(iso + "T00:00:00"), language, { month: "short", day: "numeric" });
  const reportStatCells = [
    { label: t("attendance.report.monthToDate", { defaultValue: "Month to date" }), value: `${avgMonthRate}%`, trend: t("attendance.report.avgAttendance", { defaultValue: "Avg. attendance" }) },
    { label: t("attendance.report.bestDay", { defaultValue: "Best day" }), value: bestCell ? `${bestCell.rate}%` : "—", trend: bestCell ? fmtCal(bestCell.date) : "" },
    { label: t("attendance.report.toughestDay", { defaultValue: "Toughest day" }), value: worstCell ? `${worstCell.rate}%` : "—", trend: worstCell ? fmtCal(worstCell.date) : "" },
    { label: t("attendance.report.daysLogged", { defaultValue: "Days logged" }), value: String(cellsSoFar.length), trend: months[viewMonth] },
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

  const tabs = [
    { key: "roster", label: t("attendance.tabs.roster", { defaultValue: "Roster" }) },
    ...(isHRTier
      ? [{ key: "noshow", label: t("attendance.tabs.noShowQueue", { defaultValue: "No-show queue" }) }]
      : []),
    { key: "overtime", label: t("attendance.tabs.overtime", { defaultValue: "Overtime" }) },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-5)" }}>

      {/* ── Roster / No-show queue / Overtime tabs ──
           The tab row is no longer HR-only: every employee needs the Overtime
           tab to file their own requests. The No-show queue stays HR-tier, so
           an employee sees two tabs and HR sees three. ── */}
      {(isHRTier || tabs.length > 1) && (
        <div style={{ display: "flex", gap: "var(--sp-1)", padding: "3px", background: "var(--bg-surface-alt)", borderRadius: "var(--radius-sm)", alignSelf: "flex-start" }}>
          {tabs.map(({ key, label }) => (
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
      ) : activeTab === "overtime" ? (
        <OvertimeTab />
      ) : (
        <>
          {isManager && (
            <p style={{ fontSize: "var(--fs-xs)", color: "var(--txt-info)", margin: 0 }}>
              {t("attendance.scope.team", {
                deptSuffix: myEmployee?.department ? ` (${myEmployee.department})` : "",
                count: scopedEmployees.length,
                defaultValue_one: "Showing your team{{deptSuffix}} — {{count}} employee",
                defaultValue_other: "Showing your team{{deptSuffix}} — {{count}} employees",
              })}
            </p>
          )}
          {!isManagerTier && (
            <p style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", margin: 0 }}>
              {t("attendance.scope.own", { defaultValue: "Showing your own attendance" })}
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
                <h3 className="panel-title">
                  {granularity === "monthly" ? t("attendance.granularity.monthlyHeading", { defaultValue: "Monthly attendance" }) : t("attendance.granularity.weeklyHeading", { defaultValue: "Weekly attendance" })}
                </h3>
                <div className="hint-xs">
                  {granularity === "monthly" ? `${months[viewMonth]} ${viewYear} · ` : ""}{t("attendance.granularity.clickToViewRoster", { defaultValue: "Click a day to view its roster" })}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", flexWrap: "wrap" }}>
                {granularity === "monthly" ? (
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={prevMonth}>‹</Button>
                    <span style={{ fontSize: "var(--fs-sm)", fontWeight: "var(--fw-medium)", minWidth: "110px", textAlign: "center" }}>
                      {months[viewMonth]} {viewYear}
                    </span>
                    <Button variant="secondary" size="sm" onClick={nextMonth}>›</Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={prevWeek}>‹</Button>
                    <span style={{ fontSize: "var(--fs-sm)", fontWeight: "var(--fw-medium)", minWidth: "150px", textAlign: "center" }}>
                      {formatDate(weekDates[0], language, { month: "short", day: "numeric" })} – {weekDates[6].getMonth() !== weekDates[0].getMonth() ? `${formatDate(weekDates[6], language, { month: "short" })} ` : ""}{weekDates[6].getDate()}
                    </span>
                    <Button variant="secondary" size="sm" onClick={nextWeek}>›</Button>
                  </div>
                )}
                <div style={{ display: "flex", border: "1px solid var(--bdr-default)" }}>
                  {[["weekly", t("attendance.granularity.weekly", { defaultValue: "Weekly" })], ["monthly", t("attendance.granularity.monthly", { defaultValue: "Monthly" })]].map(([v, label]) => (
                    <button key={v} type="button" onClick={() => setGranularity(v)} style={{
                      padding: "6px 14px", border: "none", cursor: "pointer",
                      background: granularity === v ? "var(--txt-primary)" : "transparent",
                      color: granularity === v ? "var(--bg-surface)" : "var(--txt-secondary)",
                      fontFamily: "var(--font-family)", fontSize: "var(--fs-xs)", fontWeight: "var(--fw-semibold)",
                    }}>{label}</button>
                  ))}
                </div>
                <Button variant="secondary" size="sm" onClick={() => setShowReport(true)}>{t("attendance.granularity.reportButton", { defaultValue: "Report" })}</Button>
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
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{t("attendance.roster.eyebrow", { defaultValue: "Roster" })}</div>
                <h3 className="panel-title">{t("attendance.roster.heading", { day: dayLabel, defaultValue: "{{day}} roster" })}</h3>
              </div>
              <input
                type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder={t("common.placeholders.searchEmployees", { defaultValue: "Search employees…" })}
                style={{
                  fontFamily: "var(--font-family)", fontSize: "var(--fs-sm)", padding: "9px var(--sp-4)",
                  background: "var(--bg-surface)", color: "var(--txt-primary)",
                  border: "1px solid var(--bdr-default)", borderRadius: "var(--radius-md)", width: "240px",
                }}
              />
            </div>

            {rosterRows.length === 0 ? (
              <div className="empty-state">
                <h3 className="empty-state-title">{t("attendance.roster.empty.title", { defaultValue: "No employees match" })}</h3>
                <p className="empty-state-description">{t("attendance.roster.empty.description", { defaultValue: "Try a different search, or pick another day." })}</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t("attendance.table.headers.employee")}</th>
                      <th>{t("common.fieldLabels.department", { defaultValue: "Department" })}</th>
                      <th>{t("attendance.table.headers.checkIn")}</th>
                      <th>{t("attendance.table.headers.checkOut")}</th>
                      <th>{t("attendance.table.headers.status")}</th>
                      <th>{t("common.columns.action", { defaultValue: "Action" })}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rosterRows.map((r) => (
                      <tr key={r.employeeId} style={{ cursor: "pointer" }} onClick={() => navigate(`/employees/${r.employeeId}`)}>
                        <td>
                          <div className="flex items-center gap-2">
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
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", flexWrap: "wrap" }}>
                            <Badge variant={variantMap(r.status)} size="sm">{statusLabel(t, r.status)}</Badge>
                            {/* Paid overtime, with the rate that earned it. The
                                percentages come from the server so the statutory
                                multipliers are not duplicated here. */}
                            {r.otHours > 0 && (
                              <Badge variant="info" size="sm">
                                {r.otNightHours > 0
                                  ? t("attendance.overtime.badgeWithNight", {
                                      hours: r.otHours, percent: r.otDayPercent, nightPercent: r.otNightPercent,
                                      defaultValue: "OT {{hours}}h · {{percent}}% + {{nightPercent}}% night",
                                    })
                                  : t("attendance.overtime.badge", {
                                      hours: r.otHours, percent: r.otDayPercent,
                                      defaultValue: "OT {{hours}}h · {{percent}}%",
                                    })}
                              </Badge>
                            )}
                            {/* Recorded, never paid — the pattern a labour
                                inspection actually looks for. */}
                            {r.otUnapprovedHours > 0 && (
                              <Badge variant="warning" size="sm">
                                {t("attendance.overtime.unapproved", {
                                  hours: r.otUnapprovedHours,
                                  defaultValue: "⚠ {{hours}}h unapproved",
                                })}
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          {r.canCheckIn && (
                            <Button
                              variant="primary" size="xs"
                              loading={actionLoadingKey === `${r.employeeId}-in`}
                              onClick={() => handleInlineCheckIn(r.employeeId)}
                              style={{ marginRight: "var(--sp-2)" }}
                            >{t("attendance.roster.checkInButton", { defaultValue: "Check-in" })}</Button>
                          )}
                          {r.canCheckOut && (
                            <Button
                              variant="secondary" size="xs"
                              loading={actionLoadingKey === `${r.employeeId}-out`}
                              onClick={() => handleInlineCheckOut(r.employeeId)}
                              style={{ marginRight: "var(--sp-2)" }}
                            >{t("attendance.roster.checkOutButton", { defaultValue: "Check-out" })}</Button>
                          )}
                          <Button variant="link" size="xs" onClick={() => navigate(`/employees/${r.employeeId}`)}>{t("common.actions.view", { defaultValue: "View" })}</Button>
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
              <h3 className="panel-title">{t("attendance.report.heading", { month: months[viewMonth], year: viewYear, defaultValue: "{{month}} {{year}} attendance summary" })}</h3>
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

            <h4 style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-semibold)", marginBottom: "var(--sp-3)" }}>{t("attendance.report.mostMissed", { defaultValue: "Most missed this week" })}</h4>
            {missedThisWeek.length === 0 ? (
              <p className="meta-sm">{t("attendance.report.noneRecorded", { defaultValue: "No absences or late check-ins recorded this week." })}</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                {missedThisWeek.map((r) => (
                  <div key={r.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--sp-2) 0", borderBottom: "1px solid var(--bdr-subtle)" }}>
                    <div>
                      <div style={{ fontSize: "var(--fs-sm)", fontWeight: "var(--fw-medium)" }}>{r.name}</div>
                      <div style={{ fontSize: "var(--fs-2xs)", color: "var(--txt-secondary)" }}>{r.department}</div>
                    </div>
                    <div style={{ display: "flex", gap: "var(--sp-2)" }}>
                      {r.absent > 0 && <Badge variant="danger" size="sm">{t("attendance.report.absentBadge", { count: r.absent, defaultValue: "{{count}} absent" })}</Badge>}
                      {r.late > 0 && <Badge variant="warning" size="sm">{t("attendance.report.lateBadge", { count: r.late, defaultValue: "{{count}} late" })}</Badge>}
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
