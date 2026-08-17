import { useState, useEffect, useMemo, useCallback, Fragment } from "react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useCurrency } from "../context/CurrencyContext";
import { formatDateTime } from "../utils/format";
import { PayrollAPI, EmployeesAPI } from "../api";
import { fmtMoney, fmtMoneyK } from "../utils/payroll";
import PayrollBreakdownPanel from "../components/PayrollBreakdownPanel";
import Avatar from "../components/Avatar";
import { TypeBadge } from "../components/Badge";
import Button from "../components/Button";

const PAYROLL_PER_PAGE = 10;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const STATUS_STYLE = {
  draft: { bg: "var(--bg-warning-subtle)", color: "var(--txt-warning)", border: "var(--bdr-warning)" },
  approved: { bg: "var(--bg-info-subtle)", color: "var(--txt-info)", border: "var(--bdr-info)" },
  paid: { bg: "var(--bg-success-subtle)", color: "var(--txt-success)", border: "var(--bdr-success)" },
};

const DEPT_COLORS = [
  "var(--clr-primary-400)",
  "var(--clr-info-500)",
  "var(--clr-success-500)",
  "var(--clr-warning-500)",
  "var(--clr-danger-500)",
  "var(--clr-primary-300)",
  "var(--clr-info-400)",
];

function colorForName(name, palette) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

function csvCell(value) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function StatusPill({ status }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.draft;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "5px",
      padding: "3px 10px", borderRadius: "var(--radius-full)",
      fontSize: "var(--fs-xs)", fontWeight: "var(--fw-medium)",
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      textTransform: "capitalize",
    }}>
      <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "currentColor" }} />
      {status}
    </span>
  );
}

function DeptChart({ data, currency, fxRate }) {
  const max = Math.max(...data.map((d) => d.total), 1);
  if (!data.length) {
    return (
      <div style={{ color: "var(--txt-secondary)", fontSize: "var(--fs-sm)", padding: "var(--sp-4) 0" }}>
        No department data for this period.
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
      {data.map((d) => (
        <div key={d.name} style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
          <span style={{
            width: "88px", flexShrink: 0, textAlign: "right", fontSize: "var(--fs-xs)",
            color: "var(--txt-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{d.name}</span>
          <div style={{ flex: 1, height: "10px", background: "var(--bg-surface-sub)", borderRadius: "var(--radius-full)" }}>
            <div style={{
              height: "10px", borderRadius: "var(--radius-full)", background: d.color,
              width: `${Math.round((d.total / max) * 100)}%`, transition: "width 0.5s ease",
            }} />
          </div>
          <span style={{ width: "92px", textAlign: "right", fontSize: "var(--fs-xs)", color: "var(--txt-primary)" }}>
            {fmtMoneyK(d.total, currency, fxRate)}
          </span>
          <span style={{ width: "28px", textAlign: "right", fontSize: "var(--fs-xs)", color: "var(--txt-secondary)" }}>
            {d.count}
          </span>
        </div>
      ))}
    </div>
  );
}

function TypeDonut({ segments, total, currency, fxRate }) {
  const sum = segments.reduce((acc, s) => acc + s.value, 0) || 1;
  let offset = 0;
  const circumference = 2 * Math.PI * 32;
  return (
    <div>
      <div style={{ position: "relative", width: "96px", height: "96px", margin: "0 auto var(--sp-4)" }}>
        <svg width="96" height="96" viewBox="0 0 96 96" style={{ transform: "rotate(-90deg)" }}>
          {segments.map((s) => {
            const len = (s.value / sum) * circumference;
            const el = (
              <circle
                key={s.label}
                cx="48" cy="48" r="32" fill="none"
                stroke={s.color} strokeWidth="13"
                strokeDasharray={`${len} ${circumference - len}`}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return el;
          })}
        </svg>
        <div style={{
          position: "absolute", inset: 0, display: "grid", placeItems: "center",
          flexDirection: "column", textAlign: "center",
        }}>
          <div>
            <div style={{ fontSize: "var(--fs-xl)", fontWeight: "var(--fw-semibold)", color: "var(--txt-primary)" }}>{total}</div>
            <div style={{ fontSize: "var(--fs-2xs)", color: "var(--txt-secondary)" }}>staff</div>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {segments.map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", fontSize: "var(--fs-xs)" }}>
            <span style={{ width: "9px", height: "9px", borderRadius: "2px", background: s.color, flexShrink: 0 }} />
            <span style={{ flex: 1, color: "var(--txt-secondary)" }}>{s.label}</span>
            <span style={{ color: "var(--txt-primary)" }}>{fmtMoneyK(s.total, currency, fxRate)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SortableHeader({ field, label, sortField, sortDir, onSort, align = "left" }) {
  const active = sortField === field;
  return (
    <th
      onClick={() => onSort(field)}
      style={{ cursor: "pointer", userSelect: "none", textAlign: align, whiteSpace: "nowrap" }}
    >
      {label}
      <span style={{ marginLeft: "4px", opacity: active ? 1 : 0.25 }}>
        {active && sortDir === "asc" ? "▲" : "▼"}
      </span>
    </th>
  );
}

function MoneyInput({ value, disabled, onCommit, currency = "VND", fxRate = 0 }) {
  // The figure stored on the payslip (`value`) is always VND. When the
  // topbar currency toggle is set to USD, this edits in USD instead — same
  // as every read-only money cell on this page (fmtMoney) — and converts
  // back to VND on commit rather than silently editing raw VND under a
  // "$" label.
  const isUsd = currency === "USD" && fxRate > 0;
  const toUnit = (vnd) => (isUsd ? Math.round((Number(vnd) || 0) / fxRate) : Math.round(Number(vnd) || 0));
  const toVnd = (unitAmount) => (isUsd ? Math.round(Number(unitAmount) * fxRate) : Number(unitAmount));

  const [draft, setDraft] = useState(String(toUnit(value)));
  const [saving, setSaving] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => { setDraft(String(toUnit(value))); }, [value, isUsd, fxRate]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = async () => {
    setFocused(false);
    if (saving || disabled) return;
    const next = draft.trim();
    const nextVnd = next === "" ? 0 : toVnd(next);
    if (next === "" || nextVnd === Number(value)) {
      setDraft(String(toUnit(value)));
      return;
    }
    setSaving(true);
    try {
      const ok = await onCommit(nextVnd);
      if (!ok) setDraft(String(toUnit(value)));
    } finally {
      setSaving(false);
    }
  };

  // These figures can run into the hundreds of millions/billions in VND —
  // showing raw digits at all times ("21800535693") is unreadable, so this
  // only shows the plain editable digits while focused and renders a
  // thousands-grouped, currency-matched preview otherwise (still a real
  // <input>, still fully editable — just formatted like every other money
  // figure on this page when you're not actively typing in it).
  const displayValue = focused ? draft : (Number(draft) || 0).toLocaleString(isUsd ? "en-US" : "vi-VN");

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
      <span style={{ fontSize: "var(--fs-xs)", color: "var(--txt-disabled)" }}>{isUsd ? "$" : "₫"}</span>
      <input
        type="text"
        inputMode="numeric"
        value={displayValue}
        disabled={disabled || saving}
        onFocus={() => setFocused(true)}
        onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ""))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") { setDraft(String(toUnit(value))); e.currentTarget.blur(); }
        }}
        style={{
          width: "112px", padding: "5px 8px", textAlign: "right",
          border: "1px solid var(--bdr-default)", borderRadius: "var(--radius-sm)",
          background: disabled ? "var(--bg-surface-alt)" : "var(--bg-surface)",
          color: "var(--txt-primary)", fontFamily: "var(--font-family)", fontSize: "var(--fs-xs)",
          fontVariantNumeric: "tabular-nums",
        }}
      />
    </div>
  );
}


function Payroll() {
  const { language } = useLanguage();
  const { isAdmin, isHRTier, isManager } = useAuth();

  // MANAGER gets a real, backend-enforced department-scoped view here (see
  // payrollController.js's departmentId filtering) — this client-side
  // filter is now redundant with what the API already returns for MANAGER,
  // kept only because it's harmless and matches Attendance's equivalent
  // "your team" pattern. isHRTier (HR+ADMIN) gates every write action
  // below (create/regenerate/approve/pay/edit) — MANAGER is read-only.
  const [myEmployee, setMyEmployee] = useState(null);
  useEffect(() => {
    let cancelled = false;
    EmployeesAPI.myProfile()
      .then((res) => { if (!cancelled) setMyEmployee(res.data ?? null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const [periods, setPeriods] = useState([]);
  const [periodId, setPeriodId] = useState("");
  const [period, setPeriod] = useState(null);
  const [payslips, setPayslips] = useState([]);
  const [loadingPeriods, setLoadingPeriods] = useState(true);
  const [loadingSlips, setLoadingSlips] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);

  const [showNewForm, setShowNewForm] = useState(false);
  const now = new Date();
  const [newPeriod, setNewPeriod] = useState({
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    fxRate: 25000,
  });
  // Task 3.8: last fetched FX snapshot for the New Period form's "Fetch live
  // rate" button — cleared whenever the target month/year changes so a
  // stale rate/source combo is never shown against a different month.
  const [fxPreview, setFxPreview] = useState(null);
  const [fxPreviewLoading, setFxPreviewLoading] = useState(false);
  // Task 3.9: manual trigger for the same job the scheduler runs on the 1st.
  const [draftBusy, setDraftBusy] = useState(false);

  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortField, setSortField] = useState("netPay");
  const [sortDir, setSortDir] = useState("desc");
  const [expanded, setExpanded] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  // Currency display preference now lives in the shared topbar toggle
  // (CurrencyContext) instead of page-local state — single source of
  // truth, no duplicate in-page control.
  const { currency } = useCurrency();

  const fxRate = period?.fxRate ?? 0;
  const isDraft = period?.status === "draft";
  const canEdit = isDraft && isHRTier;

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  // A fetched preview is only valid for the month/year it was fetched for.
  useEffect(() => {
    setFxPreview(null);
  }, [newPeriod.month, newPeriod.year]);

  const loadPeriods = useCallback(async (preferId) => {
    setLoadingPeriods(true);
    setError("");
    try {
      const res = await PayrollAPI.listPeriods();
      const items = res.items ?? [];
      setPeriods(items);
      setPeriodId((prev) => {
        const wanted = preferId ?? prev;
        if (wanted && items.some((p) => p.id === wanted)) return wanted;
        return items[0]?.id ?? "";
      });
    } catch (err) {
      setError(err.message || "Failed to load pay periods.");
    }
    setLoadingPeriods(false);
  }, []);

  useEffect(() => { loadPeriods(); }, [loadPeriods]);

  const loadPayslips = useCallback(async (id) => {
    if (!id) {
      setPeriod(null);
      setPayslips([]);
      return;
    }
    setLoadingSlips(true);
    setError("");
    try {
      const res = await PayrollAPI.listPayslips(id);
      setPeriod(res.period);
      setPayslips(res.items ?? []);
    } catch (err) {
      setError(err.message || "Failed to load payslips.");
      setPeriod(null);
      setPayslips([]);
    }
    setLoadingSlips(false);
  }, []);

  useEffect(() => {
    setCurrentPage(1);
    setExpanded(null);
    loadPayslips(periodId);
  }, [periodId, loadPayslips]);

  const scopedPayslips = useMemo(() => {
    if (isManager && myEmployee?.department) {
      return payslips.filter((p) => p.departmentName === myEmployee.department);
    }
    return payslips;
  }, [payslips, isManager, myEmployee]);

  const deptOptions = useMemo(
    () => [...new Set(scopedPayslips.map((p) => p.departmentName).filter(Boolean))].sort(),
    [scopedPayslips],
  );
  const typeOptions = useMemo(
    () => [...new Set(scopedPayslips.map((p) => p.type).filter(Boolean))].sort(),
    [scopedPayslips],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = scopedPayslips.filter((p) => {
      const matchesSearch =
        !q ||
        p.employeeName?.toLowerCase().includes(q) ||
        p.employeeCode?.toLowerCase().includes(q);
      const matchesDept = deptFilter === "all" || p.departmentName === deptFilter;
      const matchesType = typeFilter === "all" || p.type === typeFilter;
      return matchesSearch && matchesDept && matchesType;
    });
    return rows.sort((a, b) => {
      const va = a[sortField];
      const vb = b[sortField];
      if (typeof va === "string" || typeof vb === "string") {
        const cmp = String(va ?? "").localeCompare(String(vb ?? ""));
        return sortDir === "asc" ? cmp : -cmp;
      }
      const cmp = (Number(va) || 0) - (Number(vb) || 0);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [scopedPayslips, search, deptFilter, typeFilter, sortField, sortDir]);

  const deptData = useMemo(() => {
    const map = new Map();
    for (const p of scopedPayslips) {
      const name = p.departmentName ?? "Unassigned";
      const cur = map.get(name) ?? { name, total: 0, count: 0 };
      cur.total += p.grossPay;
      cur.count += 1;
      map.set(name, cur);
    }
    return [...map.values()]
      .sort((a, b) => b.total - a.total)
      .map((d) => ({ ...d, color: colorForName(d.name, DEPT_COLORS) }));
  }, [scopedPayslips]);

  const typeSegs = useMemo(() => {
    const map = new Map();
    for (const p of scopedPayslips) {
      const label = p.type ?? "Unspecified";
      const cur = map.get(label) ?? { label, value: 0, total: 0 };
      cur.value += 1;
      cur.total += p.grossPay;
      map.set(label, cur);
    }
    return [...map.values()].map((s) => ({ ...s, color: colorForName(s.label, DEPT_COLORS) }));
  }, [scopedPayslips]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAYROLL_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * PAYROLL_PER_PAGE;
  const paginated = filtered.slice(startIndex, startIndex + PAYROLL_PER_PAGE);

  const handleSort = (field) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("desc"); }
    setCurrentPage(1);
  };

  const patchPayslip = async (id, body) => {
    const reason = window.prompt("Reason for this salary adjustment (recorded in the audit log):");
    if (!reason || !reason.trim()) return false;
    try {
      const res = await PayrollAPI.updatePayslip(id, { ...body, reason: reason.trim() });
      setPayslips((prev) => prev.map((p) => (p.id === id ? res.data : p)));
      await refreshPeriodTotals();
      return true;
    } catch (err) {
      setToast(`Error: ${err.message}`);
      return false;
    }
  };

  const refreshPeriodTotals = async () => {
    try {
      const res = await PayrollAPI.listPeriods();
      const items = res.items ?? [];
      setPeriods(items);
      const fresh = items.find((p) => p.id === periodId);
      if (fresh) setPeriod((prev) => (prev ? { ...prev, totals: fresh.totals, payslipCount: fresh.payslipCount } : prev));
    } catch (err) {
      setError(err.message || "Could not refresh period totals.");
    }
  };

  const handleRecompute = async (id) => {
    try {
      const res = await PayrollAPI.recomputeDeduction(id);
      setPayslips((prev) => prev.map((p) => (p.id === id ? res.data : p)));
      setToast("Deduction recomputed from attendance and leave.");
      await refreshPeriodTotals();
    } catch (err) {
      setToast(`Error: ${err.message}`);
    }
  };

  const handleCreatePeriod = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await PayrollAPI.createPeriod({
        year: Number(newPeriod.year),
        month: Number(newPeriod.month),
        fxRate: Number(newPeriod.fxRate),
      });
      setToast(`${res.generated} draft payslip${res.generated === 1 ? "" : "s"} generated.`);
      setShowNewForm(false);
      await loadPeriods(res.data.id);
    } catch (err) {
      setToast(`Error: ${err.message}`);
    }
    setBusy(false);
  };

  // Task 3.8: pulls the get-or-create-once-per-month FX snapshot for the
  // month/year currently selected in the form and prefills the fxRate
  // field with it. Does not create a PayrollPeriod.
  const handleFetchLiveRate = async () => {
    setFxPreviewLoading(true);
    try {
      const res = await PayrollAPI.fxRatePreview(Number(newPeriod.year), Number(newPeriod.month));
      setFxPreview(res.data);
      setNewPeriod((p) => ({ ...p, fxRate: res.data.rateVndPerUsd }));
      if (res.data.source !== "api") {
        setToast("Live FX provider was unreachable — using the fallback rate. You can still edit it manually.");
      }
    } catch (err) {
      setToast(`Error: ${err.message}`);
    }
    setFxPreviewLoading(false);
  };

  // Task 3.9: same job the scheduler runs on the 1st of the month, exposed
  // here for demos and for hosts where the scheduler is off. No-op (with a
  // clear toast) if this month's period already exists.
  const handleGenerateMonthlyDraft = async () => {
    setDraftBusy(true);
    try {
      const res = await PayrollAPI.generateMonthlyDraft();
      if (res.data.skipped) {
        const reasonText = {
          "already-drafted": "This month already has an auto-drafted period.",
          "already-exists": "This month already has a manually-created period.",
          "no-payable-employees": "No active employees to pay this month.",
        }[res.data.reason] ?? "Nothing to generate.";
        setToast(reasonText);
      } else {
        setToast(
          `${res.data.generated} draft payslip${res.data.generated === 1 ? "" : "s"} auto-generated ` +
            `at ${res.data.fxRate.toLocaleString("vi-VN")} VND/USD (${res.data.fxRateSource === "api" ? "live" : "fallback"} rate).`,
        );
        await loadPeriods(res.data.periodId);
      }
    } catch (err) {
      setToast(`Error: ${err.message}`);
    }
    setDraftBusy(false);
  };

  const handleRunMonthly = async () => {
    if (!window.confirm(
      "Run last month's payroll now? Approved payslips are marked paid and can never be edited again.",
    )) return;
    setDraftBusy(true);
    try {
      const res = await PayrollAPI.runMonthly();
      if (res.data.skipped) {
        const reasonText = {
          "no-period": "Last month has no payroll period. Create one first.",
          "already-paid": "Last month's payroll has already been paid.",
          "no-payslips": "Last month's period has no payslips, so nothing was paid.",
        }[res.data.reason] ?? "Nothing to run.";
        setToast(reasonText);
      } else {
        setToast(`${res.data.year}-${String(res.data.month).padStart(2, "0")} payroll paid — ${res.data.payslipCount} payslips.`);
      }
      await loadPeriods(res.data.periodId);
      await loadPayslips(periodId);
    } catch (err) {
      setToast(`Error: ${err.message}`);
    }
    setDraftBusy(false);
  };

  const handleStatus = async (status, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    try {
      await PayrollAPI.setPeriodStatus(periodId, status);
      setToast(`Period marked ${status}.`);
      await loadPeriods(periodId);
      await loadPayslips(periodId);
    } catch (err) {
      setToast(`Error: ${err.message}`);
    }
    setBusy(false);
  };

  const handleRegenerate = async () => {
    if (!window.confirm("Regenerate discards every manual bonus, allowance and deduction edit for this period. Continue?")) return;
    setBusy(true);
    try {
      const res = await PayrollAPI.regenerate(periodId);
      setToast(`${res.generated} payslip${res.generated === 1 ? "" : "s"} regenerated.`);
      await loadPayslips(periodId);
      await refreshPeriodTotals();
    } catch (err) {
      setToast(`Error: ${err.message}`);
    }
    setBusy(false);
  };

  const handleDeletePeriod = async (id = periodId) => {
    if (!window.confirm("Delete this draft period and all of its payslips?")) return;
    setBusy(true);
    try {
      await PayrollAPI.removePeriod(id);
      setToast("Period deleted.");
      if (id === periodId) setPeriodId("");
      await loadPeriods();
    } catch (err) {
      setToast(`Error: ${err.message}`);
    }
    setBusy(false);
  };

  const exportCSV = () => {
    if (!period) return;
    const headers = [
      "Employee", "Employee ID", "Department", "Type",
      "Base Salary (VND)", "Bonus (VND)", "Allowance (VND)", "Deduction (VND)",
      "Gross (VND)", "BHXH (VND)", "BHYT (VND)", "BHTN (VND)", "PIT (VND)", "Net (VND)",
    ];
    const lines = filtered.map((p) => [
      p.employeeName, p.employeeCode, p.departmentName ?? "", p.type ?? "",
      p.baseSalary, p.bonus, p.allowance, p.deduction,
      p.grossPay, p.bhxh, p.bhyt, p.bhtn, p.pit, p.netPay,
    ].map(csvCell).join(","));

    const disclosure = `# Payroll ${period.label} — status ${period.status} — FX rate ${period.fxRate} VND/USD — all amounts in VND`;
    const blob = new Blob([[disclosure, headers.map(csvCell).join(","), ...lines].join("\n")], {
      type: "text/csv",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payroll-${period.label}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {/* ── Period bar ── */}
      <div className="content-card" style={{ marginBottom: "var(--sp-5)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", flexWrap: "wrap" }}>
          <h2 style={{ fontSize: "var(--fs-2xl)", fontWeight: "var(--fw-semibold)", color: "var(--txt-primary)", margin: 0 }}>
            Payroll
          </h2>

          {period && <StatusPill status={period.status} />}
          {period?.systemGenerated && (
            <span title={`FX rate source: ${period.fxRateSource === "api" ? "live" : "fallback"}`} style={{
              display: "inline-flex", alignItems: "center", gap: "5px",
              padding: "3px 10px", borderRadius: "var(--radius-full)",
              fontSize: "var(--fs-xs)", fontWeight: "var(--fw-medium)",
              background: "var(--bg-info-subtle)", color: "var(--txt-info)",
              border: "1px solid var(--bdr-info)",
            }}>
              Auto-drafted · {period.fxRateSource === "api" ? "live rate" : "fallback rate"}
            </span>
          )}

          <div style={{ marginLeft: "auto", display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
            {isAdmin && (
              <Button
                variant="secondary"
                size="sm"
                disabled={draftBusy}
                onClick={handleGenerateMonthlyDraft}
                title="Runs the same start-of-month job the scheduler runs automatically"
              >
                {draftBusy ? "Generating…" : "Generate this month's draft"}
              </Button>
            )}
            {isAdmin && (
              <Button
                variant="secondary"
                size="sm"
                disabled={draftBusy}
                onClick={handleRunMonthly}
                title="Runs the same 10th-of-month job the scheduler runs automatically, for last month"
              >
                Run last month&rsquo;s payroll
              </Button>
            )}
          </div>
        </div>

        {period?.status === "paid" && (
          <div style={{
            marginTop: "var(--sp-4)", padding: "var(--sp-3) var(--sp-4)",
            background: "var(--bg-success-subtle)", border: "1px solid var(--bdr-success)",
            borderRadius: "var(--radius-md)", color: "var(--txt-success)", fontSize: "var(--fs-sm)",
          }}>
            This period is closed. Payslips are read-only.
          </div>
        )}
        {period?.status === "approved" && (
          <div style={{
            marginTop: "var(--sp-4)", padding: "var(--sp-3) var(--sp-4)",
            background: "var(--bg-info-subtle)", border: "1px solid var(--bdr-info)",
            borderRadius: "var(--radius-md)", color: "var(--txt-info)", fontSize: "var(--fs-sm)",
          }}>
            This period is approved and locked. An Administrator can reopen it to make changes.
          </div>
        )}

        {showNewForm && (
          <form onSubmit={handleCreatePeriod} style={{
            marginTop: "var(--sp-4)", paddingTop: "var(--sp-4)", borderTop: "1px solid var(--bdr-subtle)",
            display: "flex", gap: "var(--sp-4)", alignItems: "flex-start", flexWrap: "wrap",
          }}>
            <div className="form-group" style={{ marginBottom: 0, width: "140px", flexShrink: 0 }}>
              <label className="form-label" htmlFor="np-month">Month</label>
              <select id="np-month" value={newPeriod.month}
                onChange={(e) => setNewPeriod((p) => ({ ...p, month: e.target.value }))}>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0, width: "100px", flexShrink: 0 }}>
              <label className="form-label" htmlFor="np-year">Year</label>
              <input id="np-year" type="number" min="2000" max="2100" value={newPeriod.year}
                onChange={(e) => setNewPeriod((p) => ({ ...p, year: e.target.value }))} />
            </div>
            <div className="form-group" style={{ marginBottom: 0, width: "320px", flex: "1 1 320px" }}>
              <label className="form-label" htmlFor="np-fx">FX rate (VND per USD)</label>
              <div style={{ display: "flex", gap: "var(--sp-2)", alignItems: "stretch" }}>
                <input id="np-fx" type="number" min="1" step="any" value={newPeriod.fxRate}
                  style={{ flex: 1, minWidth: 0 }}
                  onChange={(e) => setNewPeriod((p) => ({ ...p, fxRate: e.target.value }))} />
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={fxPreviewLoading}
                  onClick={handleFetchLiveRate}
                  style={{ flexShrink: 0 }}
                >
                  {fxPreviewLoading ? "Fetching…" : "Fetch live rate"}
                </Button>
              </div>
              <span className="form-hint">
                {fxPreview
                  ? `${fxPreview.source === "api" ? "Live" : "Fallback"} rate as of ${formatDateTime(fxPreview.fetchedAt, language)} — locked once the period is created.`
                  : "Locked once the period is created. “Fetch live rate” pulls the same monthly snapshot the auto-draft job uses."}
              </span>
            </div>
            <div className="form-group" style={{ marginBottom: 0, flexShrink: 0 }}>
              <label className="form-label" style={{ visibility: "hidden" }}>Action</label>
              <Button variant="primary" type="submit" disabled={busy} style={{ whiteSpace: "nowrap" }}>
                {busy ? "Generating…" : "Create & generate drafts"}
              </Button>
            </div>
          </form>
        )}
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

      {loadingPeriods ? (
        <div className="content-card" style={{ textAlign: "center", color: "var(--txt-secondary)" }}>
          Loading pay periods…
        </div>
      ) : periods.length === 0 ? (
        <div className="content-card">
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--txt-disabled)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
                <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
                <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
              </svg>
            </div>
            <div className="empty-state-title">No pay periods yet</div>
            <div className="empty-state-description">
              Create your first pay period to generate draft payslips for every employee.
            </div>
          </div>
        </div>
      ) : (
        <>
          {isManager && (
            <p style={{ fontSize: "var(--fs-xs)", color: "var(--txt-info)", margin: "0 0 var(--sp-3)" }}>
              Showing your team{myEmployee?.department ? ` (${myEmployee.department})` : ""} — {scopedPayslips.length} payslip{scopedPayslips.length === 1 ? "" : "s"} this period
            </p>
          )}

          {/* ── Stat strip ── */}
          {(() => {
            // Scoped totals — for Manager these reflect only their own
            // department's payslips (scopedPayslips), summed client-side
            // since the backend's period.totals/payslipCount are always
            // org-wide aggregates. Admin sees the full period as before.
            const totalSlips = scopedPayslips.length;
            const grossSum = scopedPayslips.reduce((s, p) => s + p.grossPay, 0);
            const netSum = scopedPayslips.reduce((s, p) => s + p.netPay, 0);
            // Real backend tracks pay status per PERIOD (draft/approved/paid),
            // not per payslip — there's no individual "mark this one employee
            // paid" endpoint like the mockup's demo has. "Paid" below reflects
            // that: everyone in a paid period, nobody otherwise.
            const paidCount = period?.status === "paid" ? totalSlips : 0;
            const pendingCount = totalSlips - paidCount;
            const pendingTrend = period?.status === "approved" ? "Awaiting payment" : period?.status === "paid" ? "—" : "Awaiting run";
            const statCells = [
              { label: period ? `${MONTHS[period.month - 1]} ${period.year}` : "Payroll", value: fmtMoneyK(grossSum, currency, fxRate), trend: "Gross payout" },
              { label: "Net payout", value: fmtMoneyK(netSum, currency, fxRate), trend: "After deductions" },
              { label: "Paid", value: `${paidCount}/${totalSlips}`, trend: "Employees settled" },
              { label: "Pending", value: String(pendingCount), trend: pendingTrend },
            ];
            return (
              <div className="stat-strip" style={{ marginBottom: "var(--sp-5)" }}>
                {statCells.map((c) => (
                  <div key={c.label} className="stat-cell" style={{ cursor: "default" }}>
                    <div className="stat-cell-label">{c.label}</div>
                    <div className="stat-cell-value">{c.value}</div>
                    <div className="stat-cell-trend">{c.trend}</div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* ── Pay run history — every period, click a row to select it
              (replaces the old dropdown selector) ── */}
          <div className="content-card" style={{ marginBottom: "var(--sp-5)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--sp-3)", marginBottom: "var(--sp-5)", flexWrap: "wrap" }}>
              <div>
                <h3 style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-semibold)", margin: 0 }}>Pay run history</h3>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", marginTop: "2px" }}>Click a run to view its breakdown</div>
              </div>
              {isHRTier && (
                <Button variant="secondary" size="sm" onClick={() => setShowNewForm((v) => !v)}>
                  {showNewForm ? "Cancel" : "+ New draft"}
                </Button>
              )}
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Pay date</th>
                    <th>Employees</th>
                    <th>Gross</th>
                    <th>Net</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {periods.map((p) => {
                    const payDate = new Date(p.year, p.month, 0);
                    const canDelete = p.status === "draft";
                    return (
                      <tr
                        key={p.id}
                        onClick={() => setPeriodId(p.id)}
                        style={{ cursor: "pointer", background: p.id === periodId ? "var(--bg-primary-subtle)" : "transparent" }}
                      >
                        <td style={{ fontWeight: p.id === periodId ? "var(--fw-semibold)" : "var(--fw-regular)" }}>{MONTHS[p.month - 1]} {p.year}</td>
                        <td style={{ color: "var(--txt-secondary)" }}>{MONTHS[payDate.getMonth()].slice(0, 3)} {payDate.getDate()}, {payDate.getFullYear()}</td>
                        <td style={{ color: "var(--txt-secondary)" }}>{p.payslipCount ?? 0}</td>
                        <td>{fmtMoney(p.totals?.grossPay, currency, p.fxRate ?? fxRate)}</td>
                        <td>{fmtMoney(p.totals?.netPay, currency, p.fxRate ?? fxRate)}</td>
                        <td><StatusPill status={p.status} /></td>
                        <td onClick={(e) => e.stopPropagation()}>
                          {isAdmin && (
                            <>
                              <Button variant="link" size="xs" onClick={() => setPeriodId(p.id)} style={{ marginRight: "var(--sp-3)" }}>Edit</Button>
                              {canDelete ? (
                                <Button
                                  variant="link" size="xs" className="btn-link-muted"
                                  onClick={() => handleDeletePeriod(p.id)}
                                >Delete</Button>
                              ) : (
                                <span style={{ fontSize: "var(--fs-xs)", color: "var(--txt-disabled)" }}>Delete</span>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Current period / payslips ── */}
          <div className="content-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--sp-3)", marginBottom: "var(--sp-5)", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Current period</div>
                <h3 style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-semibold)", margin: 0 }}>
                  {period ? `${MONTHS[period.month - 1]} ${period.year}` : "—"}
                </h3>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", flexWrap: "wrap" }}>
                <input
                  className="search-input"
                  style={{ width: "180px" }}
                  placeholder="Search employee…"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                />
                <select
                  value={deptFilter}
                  onChange={(e) => { setDeptFilter(e.target.value); setCurrentPage(1); }}
                  style={{
                    padding: "10px var(--sp-4)", border: "1px solid var(--bdr-default)",
                    borderRadius: "var(--radius-md)", background: "var(--bg-surface)",
                    color: "var(--txt-primary)", fontFamily: "var(--font-family)", fontSize: "var(--fs-sm)",
                  }}
                >
                  <option value="all">All departments</option>
                  {deptOptions.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                <select
                  value={typeFilter}
                  onChange={(e) => { setTypeFilter(e.target.value); setCurrentPage(1); }}
                  style={{
                    padding: "10px var(--sp-4)", border: "1px solid var(--bdr-default)",
                    borderRadius: "var(--radius-md)", background: "var(--bg-surface)",
                    color: "var(--txt-primary)", fontFamily: "var(--font-family)", fontSize: "var(--fs-sm)",
                  }}
                >
                  <option value="all">All types</option>
                  {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={exportCSV}
                  title="CSV export is always raw VND, regardless of the currency toggle in the top bar."
                >
                  ↓ Export CSV
                </Button>
                {period && isDraft && isHRTier && (
                  <>
                    <Button
                      variant="secondary" size="sm" disabled={busy} onClick={handleRegenerate}
                      title={isManager ? "Regenerates drafts for the whole company's payroll this period, not just your department." : undefined}
                    >Regenerate drafts</Button>
                    <Button
                      variant="primary" size="sm" disabled={busy} onClick={() => handleStatus("approved")}
                      title={isManager ? "Approves the whole company's payroll for this period, not just your department." : undefined}
                    >Approve payroll</Button>
                  </>
                )}
                {period && isDraft && isAdmin && (
                  <Button variant="danger" size="sm" disabled={busy} onClick={() => handleDeletePeriod()}>Delete period</Button>
                )}
                {period?.status === "approved" && isHRTier && (
                  <Button
                    variant="primary" size="sm" disabled={busy}
                    onClick={() => handleStatus("paid", "Mark this period as paid? It cannot be reopened afterwards.")}
                    title={isManager ? "Marks the whole company's payroll as paid for this period, not just your department." : undefined}
                  >
                    Mark as paid
                  </Button>
                )}
                {period?.status === "approved" && isAdmin && (
                  <Button variant="secondary" size="sm" disabled={busy} onClick={() => handleStatus("draft")}>Reopen to draft</Button>
                )}
              </div>
            </div>

            {loadingSlips ? (
              <div style={{ padding: "var(--sp-8)", textAlign: "center", color: "var(--txt-secondary)" }}>
                Loading payslips…
              </div>
            ) : scopedPayslips.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--txt-disabled)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <path d="M14 2v6h6" />
                    <path d="M9 13h6M9 17h6M9 9h1" />
                  </svg>
                </div>
                <div className="empty-state-title">
                  {isManager && payslips.length > 0 ? "No payslips for your department in this period" : "No payslips in this period"}
                </div>
                <div className="empty-state-description">
                  {isManager && payslips.length > 0
                    ? "Other departments have payslips this period, but none in yours yet."
                    : isDraft && isHRTier ? "Use Regenerate drafts to build them." : "This period has no payslips."}
                </div>
              </div>
            ) : filtered.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--txt-disabled)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="11" cy="11" r="7" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                </div>
                <div className="empty-state-title">No results</div>
                <div className="empty-state-description">Try adjusting your search or filters.</div>
              </div>
            ) : (
              <>
                <div style={{ overflowX: "auto" }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <SortableHeader field="employeeName" label="Employee" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                        <SortableHeader field="departmentName" label="Department" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                        <SortableHeader field="type" label="Type" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                        <SortableHeader field="baseSalary" label="Base" sortField={sortField} sortDir={sortDir} onSort={handleSort} align="right" />
                        <th style={{ textAlign: "right" }}>Bonus</th>
                        <th style={{ textAlign: "right" }}>Allowance</th>
                        <th style={{ textAlign: "right" }}>Deduction</th>
                        <SortableHeader field="grossPay" label="Gross" sortField={sortField} sortDir={sortDir} onSort={handleSort} align="right" />
                        <th style={{ textAlign: "right" }}>Insurance</th>
                        <th style={{ textAlign: "right" }}>PIT</th>
                        <SortableHeader field="netPay" label="Net" sortField={sortField} sortDir={sortDir} onSort={handleSort} align="right" />
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {paginated.map((p) => (
                        <Fragment key={p.id}>
                          <tr
                            onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                            aria-expanded={expanded === p.id}
                            style={{ cursor: "pointer" }}
                          >
                            <td style={{ minWidth: "180px", verticalAlign: "top" }}>
                              <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--sp-3)" }}>
                                <Avatar name={p.employeeName} size="sm" style={{ marginTop: "1px" }} />
                                <div>
                                  <div style={{ fontWeight: "var(--fw-medium)", color: "var(--txt-primary)", lineHeight: 1.3 }}>{p.employeeName}</div>
                                  <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)" }}>{p.employeeCode}</div>
                                </div>
                              </div>
                            </td>
                            <td style={{ minWidth: "90px", verticalAlign: "top" }}>{p.departmentName ?? "—"}</td>
                            <td style={{ verticalAlign: "top" }}>{p.type ? <TypeBadge type={p.type} /> : "—"}</td>
                            <td style={{ textAlign: "right", minWidth: "150px", verticalAlign: "top" }} onClick={(e) => canEdit && e.stopPropagation()}>
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                                {canEdit
                                  ? <MoneyInput value={p.baseSalary} currency={currency} fxRate={fxRate} onCommit={(v) => patchPayslip(p.id, { baseSalary: v })} />
                                  : fmtMoney(p.baseSalary, currency, fxRate)}
                              </div>
                            </td>
                            <td style={{ textAlign: "right", minWidth: "150px", verticalAlign: "top" }} onClick={(e) => canEdit && e.stopPropagation()}>
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                                {canEdit
                                  ? <MoneyInput value={p.bonus} currency={currency} fxRate={fxRate} onCommit={(v) => patchPayslip(p.id, { bonus: v })} />
                                  : fmtMoney(p.bonus, currency, fxRate)}
                              </div>
                            </td>
                            <td style={{ textAlign: "right", minWidth: "150px", verticalAlign: "top" }} onClick={(e) => canEdit && e.stopPropagation()}>
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                                {canEdit
                                  ? <MoneyInput value={p.allowance} currency={currency} fxRate={fxRate} onCommit={(v) => patchPayslip(p.id, { allowance: v })} />
                                  : fmtMoney(p.allowance, currency, fxRate)}
                              </div>
                            </td>
                            <td style={{ textAlign: "right", minWidth: "150px", verticalAlign: "top" }} onClick={(e) => canEdit && e.stopPropagation()}>
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                              {canEdit
                                ? <MoneyInput value={p.deduction} currency={currency} fxRate={fxRate} onCommit={(v) => patchPayslip(p.id, { deduction: v })} />
                                : fmtMoney(p.deduction, currency, fxRate)}
                              <div style={{ fontSize: "var(--fs-2xs)", color: "var(--txt-secondary)", marginTop: "2px" }}>
                                {p.unpaidLeaveDays} unpaid + {p.absentDays} absent
                                {p.deductionOverridden && canEdit && (
                                  <button
                                    type="button"
                                    onClick={() => handleRecompute(p.id)}
                                    style={{
                                      marginLeft: "6px", background: "none", border: "none", padding: 0,
                                      cursor: "pointer", color: "var(--txt-primary-brand)",
                                      font: "inherit", textDecoration: "underline",
                                    }}
                                  >recompute</button>
                                )}
                              </div>
                              </div>
                            </td>
                            <td style={{ textAlign: "right", fontWeight: "var(--fw-medium)", whiteSpace: "nowrap", minWidth: "100px", verticalAlign: "top" }}>{fmtMoney(p.grossPay, currency, fxRate)}</td>
                            <td style={{ textAlign: "right", color: "var(--txt-danger)", whiteSpace: "nowrap", minWidth: "90px", verticalAlign: "top" }}>
                              {p.insuranceExempt ? (
                                <span
                                  title={`Exempt — ${p.unpaidLeaveDays + p.absentDays} unpaid working days reached the 14-day threshold`}
                                  style={{ color: "var(--txt-secondary)" }}
                                >
                                  Exempt
                                </span>
                              ) : (
                                `−${fmtMoney(p.insuranceTotal, currency, fxRate)}`
                              )}
                            </td>
                            <td style={{ textAlign: "right", color: "var(--txt-danger)", whiteSpace: "nowrap", minWidth: "90px", verticalAlign: "top" }}>−{fmtMoney(p.pit, currency, fxRate)}</td>
                            <td style={{ textAlign: "right", fontWeight: "var(--fw-semibold)", color: "var(--txt-success)", whiteSpace: "nowrap", minWidth: "100px", verticalAlign: "top" }}>
                              {fmtMoney(p.netPay, currency, fxRate)}
                            </td>
                            <td style={{ textAlign: "right", verticalAlign: "top" }}>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setExpanded(expanded === p.id ? null : p.id); }}
                                aria-expanded={expanded === p.id}
                                style={{
                                  background: "none", border: "none", cursor: "pointer",
                                  color: "var(--txt-secondary)", fontSize: "var(--fs-sm)",
                                }}
                              >{expanded === p.id ? "▲" : "▼"}</button>
                            </td>
                          </tr>
                          {expanded === p.id && (
                            <tr>
                              <td colSpan={12} style={{ padding: "var(--sp-4)" }}>
                                <PayrollBreakdownPanel slip={p} currency={currency} fxRate={fxRate} period={period} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={7} style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)" }}>
                          {filtered.length} payslip{filtered.length === 1 ? "" : "s"} match filters
                        </td>
                        <td style={{ textAlign: "right", fontWeight: "var(--fw-semibold)" }}>
                          {fmtMoney(filtered.reduce((s, p) => s + p.grossPay, 0), currency, fxRate)}
                        </td>
                        <td colSpan={2} />
                        <td style={{ textAlign: "right", fontWeight: "var(--fw-semibold)" }}>
                          {fmtMoney(filtered.reduce((s, p) => s + p.netPay, 0), currency, fxRate)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="pagination">
                    <div className="pagination-info">
                      Showing {startIndex + 1}–{Math.min(startIndex + PAYROLL_PER_PAGE, filtered.length)} of {filtered.length}
                    </div>
                    <div className="pagination-controls">
                      <Button
                        disabled={safePage === 1}
                        onClick={() => setCurrentPage(safePage - 1)}
                        className="page-btn"
                      >‹</Button>
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                        <button
                          key={n}
                          type="button"
                          className={`page-btn ${n === safePage ? "active" : ""}`}
                          onClick={() => setCurrentPage(n)}
                        >{n}</button>
                      ))}
                      <Button
                        disabled={safePage === totalPages}
                        onClick={() => setCurrentPage(safePage + 1)}
                        className="page-btn"
                      >›</Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Gross-by-department / contract-type mix — not in the mockup,
              kept as a real, already-working breakdown of this period's
              payslips rather than dropped for parity's sake. Dropped for
              Manager: once the view is scoped to a single department, a
              "gross pay by department" bar chart with one bar (and a
              contract-type donut of just their own team) isn't useful. ── */}
          {!isManager && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 240px", gap: "var(--sp-5)", marginTop: "var(--sp-5)" }}>
              <div className="content-card">
                <div style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-semibold)", color: "var(--txt-primary)", marginBottom: "var(--sp-4)" }}>
                  Gross pay by department
                </div>
                <DeptChart data={deptData} currency={currency} fxRate={fxRate} />
              </div>
              <div className="content-card">
                <div style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-semibold)", color: "var(--txt-primary)", marginBottom: "var(--sp-4)" }}>
                  By contract type
                </div>
                <TypeDonut segments={typeSegs} total={scopedPayslips.length} currency={currency} fxRate={fxRate} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default Payroll;
