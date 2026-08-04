import { useState, useEffect, useMemo, useCallback, Fragment } from "react";
import { useAuth } from "../context/AuthContext";
import { PayrollAPI } from "../api";
import Avatar from "../components/Avatar";
import { TypeBadge } from "../components/Badge";

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

function fmtMoney(vnd, currency, fxRate) {
  const n = Number(vnd) || 0;
  if (currency === "USD" && fxRate > 0) {
    return `$${Math.round(n / fxRate).toLocaleString()}`;
  }
  return `${Math.round(n).toLocaleString("vi-VN")} ₫`;
}

function fmtMoneyK(vnd, currency, fxRate) {
  const n = Number(vnd) || 0;
  if (currency === "USD" && fxRate > 0) {
    const usd = n / fxRate;
    if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
    if (usd >= 1_000) return `$${(usd / 1_000).toFixed(0)}K`;
    return `$${Math.round(usd)}`;
  }
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} tỷ ₫`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)} triệu ₫`;
  return `${Math.round(n).toLocaleString("vi-VN")} ₫`;
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

function MoneyInput({ value, disabled, onCommit }) {
  const [draft, setDraft] = useState(String(value ?? 0));
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraft(String(value ?? 0)); }, [value]);

  const commit = async () => {
    if (saving || disabled) return;
    const next = draft.trim();
    if (next === "" || Number(next) === Number(value)) {
      setDraft(String(value ?? 0));
      return;
    }
    setSaving(true);
    try {
      await onCommit(Number(next));
    } finally {
      setSaving(false);
    }
  };

  return (
    <input
      type="number"
      min="0"
      step="1000"
      value={draft}
      disabled={disabled || saving}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setDraft(String(value ?? 0));
      }}
      style={{
        width: "112px", padding: "4px 6px", textAlign: "right",
        border: "1px solid var(--bdr-default)", borderRadius: "var(--radius-sm)",
        background: disabled ? "var(--bg-surface-alt)" : "var(--bg-surface)",
        color: "var(--txt-primary)", fontFamily: "var(--font-family)", fontSize: "var(--fs-xs)",
      }}
    />
  );
}

function BreakdownPanel({ slip, currency, fxRate, period }) {
  const rows = [
    { label: "Base salary", value: slip.baseSalary, sign: 1 },
    { label: "Bonus", value: slip.bonus, sign: 1 },
    { label: "Allowance", value: slip.allowance, sign: 1 },
    { label: "Deduction", value: slip.deduction, sign: -1 },
    { label: "Gross pay", value: slip.grossPay, total: true },
    { label: "Social insurance (BHXH 8%)", value: slip.bhxh, sign: -1 },
    { label: "Health insurance (BHYT 1.5%)", value: slip.bhyt, sign: -1 },
    { label: "Unemployment (BHTN 1%)", value: slip.bhtn, sign: -1 },
    { label: "Personal income tax", value: slip.pit, sign: -1 },
    { label: "Net pay", value: slip.netPay, total: true },
  ];

  return (
    <div style={{
      padding: "var(--sp-5)", background: "var(--bg-surface-alt)",
      borderRadius: "var(--radius-md)", border: "1px solid var(--bdr-subtle)",
    }}>
      <div style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-semibold)", color: "var(--txt-primary)", marginBottom: "var(--sp-4)" }}>
        Salary breakdown — {slip.employeeName}
      </div>

      <div style={{ maxWidth: "520px" }}>
        {rows.map((r) => (
          <div key={r.label} style={{
            display: "flex", justifyContent: "space-between", gap: "var(--sp-4)",
            padding: "7px 0", borderBottom: "1px solid var(--bdr-subtle)",
            fontWeight: r.total ? "var(--fw-semibold)" : "var(--fw-regular)",
          }}>
            <span style={{ fontSize: "var(--fs-sm)", color: r.total ? "var(--txt-primary)" : "var(--txt-secondary)" }}>
              {r.label}
            </span>
            <span style={{
              fontSize: "var(--fs-sm)",
              color: r.total ? "var(--txt-primary)" : r.sign === -1 ? "var(--txt-danger)" : "var(--txt-primary)",
            }}>
              {r.sign === -1 ? "− " : ""}{fmtMoney(r.value, currency, fxRate)}
            </span>
          </div>
        ))}
      </div>

      <div style={{
        marginTop: "var(--sp-4)", padding: "var(--sp-3) var(--sp-4)",
        background: "var(--bg-info-subtle)", border: "1px solid var(--bdr-info)",
        borderRadius: "var(--radius-md)", fontSize: "var(--fs-xs)", color: "var(--txt-info)",
      }}>
        Period {period.label} · {period.standardWorkingDays} standard working days · FX rate locked at{" "}
        {Number(period.fxRate).toLocaleString()} VND/USD
        {period.fxRateSource && period.fxRateSource !== "manual"
          ? ` (${period.fxRateSource === "api" ? "live" : "fallback"} rate)`
          : ""} · {slip.unpaidLeaveDays} unpaid leave day
        {slip.unpaidLeaveDays === 1 ? "" : "s"} · {slip.absentDays} absent day
        {slip.absentDays === 1 ? "" : "s"} · assumes 0 registered dependents.
      </div>
    </div>
  );
}

function Payroll() {
  const { isAdmin, isHR } = useAuth();

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
  const [currency, setCurrency] = useState("VND");

  const fxRate = period?.fxRate ?? 0;
  const isDraft = period?.status === "draft";
  const canEdit = isDraft && isHR;

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

  const deptOptions = useMemo(
    () => [...new Set(payslips.map((p) => p.departmentName).filter(Boolean))].sort(),
    [payslips],
  );
  const typeOptions = useMemo(
    () => [...new Set(payslips.map((p) => p.type).filter(Boolean))].sort(),
    [payslips],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = payslips.filter((p) => {
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
  }, [payslips, search, deptFilter, typeFilter, sortField, sortDir]);

  const deptData = useMemo(() => {
    const map = new Map();
    for (const p of payslips) {
      const name = p.departmentName ?? "Unassigned";
      const cur = map.get(name) ?? { name, total: 0, count: 0 };
      cur.total += p.grossPay;
      cur.count += 1;
      map.set(name, cur);
    }
    return [...map.values()]
      .sort((a, b) => b.total - a.total)
      .map((d) => ({ ...d, color: colorForName(d.name, DEPT_COLORS) }));
  }, [payslips]);

  const typeSegs = useMemo(() => {
    const map = new Map();
    for (const p of payslips) {
      const label = p.type ?? "Unspecified";
      const cur = map.get(label) ?? { label, value: 0, total: 0 };
      cur.value += 1;
      cur.total += p.grossPay;
      map.set(label, cur);
    }
    return [...map.values()].map((s) => ({ ...s, color: colorForName(s.label, DEPT_COLORS) }));
  }, [payslips]);

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
    try {
      const res = await PayrollAPI.updatePayslip(id, body);
      setPayslips((prev) => prev.map((p) => (p.id === id ? res.data : p)));
      await refreshPeriodTotals();
    } catch (err) {
      setToast(`Error: ${err.message}`);
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
            `at ${res.data.fxRate.toLocaleString()} VND/USD (${res.data.fxRateSource === "api" ? "live" : "fallback"} rate).`,
        );
        await loadPeriods(res.data.periodId);
      }
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

  const handleDeletePeriod = async () => {
    if (!window.confirm("Delete this draft period and all of its payslips?")) return;
    setBusy(true);
    try {
      await PayrollAPI.removePeriod(periodId);
      setToast("Period deleted.");
      setPeriodId("");
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

  const totals = period?.totals ?? {};

  return (
    <div>
      {/* ── Period bar ── */}
      <div className="content-card" style={{ marginBottom: "var(--sp-5)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", flexWrap: "wrap" }}>
          <h2 style={{ fontSize: "var(--fs-2xl)", fontWeight: "var(--fw-semibold)", color: "var(--txt-primary)", margin: 0 }}>
            Payroll
          </h2>

          {periods.length > 0 && (
            <select
              value={periodId}
              onChange={(e) => setPeriodId(e.target.value)}
              style={{
                padding: "7px var(--sp-3)", border: "1px solid var(--bdr-default)",
                borderRadius: "var(--radius-md)", background: "var(--bg-surface)",
                color: "var(--txt-primary)", fontFamily: "var(--font-family)", fontSize: "var(--fs-sm)",
              }}
            >
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {MONTHS[p.month - 1]} {p.year} · {p.status}
                </option>
              ))}
            </select>
          )}

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
              <button type="button" className="btn btn-secondary btn-sm" disabled={draftBusy}
                onClick={handleGenerateMonthlyDraft}
                title="Runs the same start-of-month job the scheduler runs automatically">
                {draftBusy ? "Generating…" : "Generate this month's draft"}
              </button>
            )}
            {isHR && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowNewForm((v) => !v)}>
                {showNewForm ? "Cancel" : "+ New period"}
              </button>
            )}
            {period && isDraft && isHR && (
              <>
                <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={handleRegenerate}>
                  Regenerate drafts
                </button>
                <button type="button" className="btn btn-success btn-sm" disabled={busy}
                  onClick={() => handleStatus("approved")}>
                  Approve payroll
                </button>
              </>
            )}
            {period && isDraft && isAdmin && (
              <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={handleDeletePeriod}>
                Delete period
              </button>
            )}
            {period?.status === "approved" && isHR && (
              <button type="button" className="btn btn-success btn-sm" disabled={busy}
                onClick={() => handleStatus("paid", "Mark this period as paid? It cannot be reopened afterwards.")}>
                Mark as paid
              </button>
            )}
            {period?.status === "approved" && isAdmin && (
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy}
                onClick={() => handleStatus("draft")}>
                Reopen to draft
              </button>
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
            display: "flex", gap: "var(--sp-4)", alignItems: "flex-end", flexWrap: "wrap",
          }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" htmlFor="np-month">Month</label>
              <select id="np-month" value={newPeriod.month}
                onChange={(e) => setNewPeriod((p) => ({ ...p, month: e.target.value }))}>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" htmlFor="np-year">Year</label>
              <input id="np-year" type="number" min="2000" max="2100" value={newPeriod.year}
                onChange={(e) => setNewPeriod((p) => ({ ...p, year: e.target.value }))} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" htmlFor="np-fx">FX rate (VND per USD)</label>
              <div style={{ display: "flex", gap: "var(--sp-2)", alignItems: "center" }}>
                <input id="np-fx" type="number" min="1" step="any" value={newPeriod.fxRate}
                  onChange={(e) => setNewPeriod((p) => ({ ...p, fxRate: e.target.value }))} />
                <button type="button" className="btn btn-secondary btn-sm" disabled={fxPreviewLoading}
                  onClick={handleFetchLiveRate}>
                  {fxPreviewLoading ? "Fetching…" : "Fetch live rate"}
                </button>
              </div>
              <span className="form-hint">
                {fxPreview
                  ? `${fxPreview.source === "api" ? "Live" : "Fallback"} rate as of ${new Date(fxPreview.fetchedAt).toLocaleString()} — locked once the period is created.`
                  : "Locked once the period is created. “Fetch live rate” pulls the same monthly snapshot the auto-draft job uses."}
              </span>
            </div>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Generating…" : "Create & generate drafts"}
            </button>
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
            <div className="empty-state-icon">💰</div>
            <div className="empty-state-title">No pay periods yet</div>
            <div className="empty-state-description">
              Create your first pay period to generate draft payslips for every employee.
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* ── Stat cards ── */}
          <div className="stat-grid" style={{ marginBottom: "var(--sp-5)" }}>
            {[
              { label: "Total gross", value: totals.grossPay, color: "var(--clr-primary-400)", hint: `${period?.payslipCount ?? 0} payslips` },
              { label: "Total net", value: totals.netPay, color: "var(--clr-success-600)", hint: "Take-home total" },
              { label: "Tax + insurance", value: (totals.pit ?? 0) + (totals.insuranceTotal ?? 0), color: "var(--clr-info-600)", hint: "PIT + BHXH/BHYT/BHTN" },
              { label: "Total deductions", value: totals.deduction, color: "var(--clr-warning-600)", hint: "Unpaid leave & absence" },
            ].map((c) => (
              <div key={c.label} className="stat-card">
                <div className="stat-card-label">{c.label}</div>
                <div className="stat-card-value" style={{ color: c.color }}>
                  {fmtMoneyK(c.value, currency, fxRate)}
                </div>
                <div className="stat-card-hint">{c.hint}</div>
              </div>
            ))}
          </div>

          {/* ── Charts ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 240px", gap: "var(--sp-5)", marginBottom: "var(--sp-5)" }}>
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
              <TypeDonut segments={typeSegs} total={payslips.length} currency={currency} fxRate={fxRate} />
            </div>
          </div>

          {/* ── Payslip table ── */}
          <div className="content-card">
            <div className="toolbar">
              <div style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-semibold)", color: "var(--txt-primary)" }}>
                Payslips
              </div>
              <input
                className="search-input"
                style={{ width: "180px" }}
                placeholder="Search employee…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              />
              <select value={deptFilter} onChange={(e) => { setDeptFilter(e.target.value); setCurrentPage(1); }}>
                <option value="all">All departments</option>
                {deptOptions.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setCurrentPage(1); }}>
                <option value="all">All types</option>
                {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <div style={{ display: "flex", gap: "2px", padding: "3px", background: "var(--bg-surface-alt)", borderRadius: "var(--radius-sm)" }}>
                {["VND", "USD"].map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={currency === c}
                    onClick={() => setCurrency(c)}
                    style={{
                      padding: "4px 11px", borderRadius: "6px", border: "none", cursor: "pointer",
                      background: currency === c ? "var(--bg-surface)" : "transparent",
                      color: currency === c ? "var(--txt-primary)" : "var(--txt-secondary)",
                      fontFamily: "var(--font-family)", fontSize: "var(--fs-xs)",
                      boxShadow: currency === c ? "var(--shadow-xs)" : "none",
                    }}
                  >{c}</button>
                ))}
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={exportCSV}
                title="CSV export is always raw VND, regardless of the display currency above.">
                ↓ Export CSV
              </button>
            </div>

            {loadingSlips ? (
              <div style={{ padding: "var(--sp-8)", textAlign: "center", color: "var(--txt-secondary)" }}>
                Loading payslips…
              </div>
            ) : payslips.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📄</div>
                <div className="empty-state-title">No payslips in this period</div>
                <div className="empty-state-description">
                  {isDraft && isHR ? "Use Regenerate drafts to build them." : "This period has no payslips."}
                </div>
              </div>
            ) : filtered.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">💰</div>
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
                          <tr>
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
                                <Avatar name={p.employeeName} size="sm" />
                                <div>
                                  <div style={{ fontWeight: "var(--fw-medium)", color: "var(--txt-primary)" }}>{p.employeeName}</div>
                                  <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)" }}>{p.employeeCode}</div>
                                </div>
                              </div>
                            </td>
                            <td>{p.departmentName ?? "—"}</td>
                            <td>{p.type ? <TypeBadge type={p.type} /> : "—"}</td>
                            <td style={{ textAlign: "right" }}>
                              {canEdit
                                ? <MoneyInput value={p.baseSalary} onCommit={(v) => patchPayslip(p.id, { baseSalary: v })} />
                                : fmtMoney(p.baseSalary, currency, fxRate)}
                            </td>
                            <td style={{ textAlign: "right" }}>
                              {canEdit
                                ? <MoneyInput value={p.bonus} onCommit={(v) => patchPayslip(p.id, { bonus: v })} />
                                : fmtMoney(p.bonus, currency, fxRate)}
                            </td>
                            <td style={{ textAlign: "right" }}>
                              {canEdit
                                ? <MoneyInput value={p.allowance} onCommit={(v) => patchPayslip(p.id, { allowance: v })} />
                                : fmtMoney(p.allowance, currency, fxRate)}
                            </td>
                            <td style={{ textAlign: "right" }}>
                              {canEdit
                                ? <MoneyInput value={p.deduction} onCommit={(v) => patchPayslip(p.id, { deduction: v })} />
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
                            </td>
                            <td style={{ textAlign: "right", fontWeight: "var(--fw-medium)" }}>{fmtMoney(p.grossPay, currency, fxRate)}</td>
                            <td style={{ textAlign: "right", color: "var(--txt-danger)" }}>−{fmtMoney(p.insuranceTotal, currency, fxRate)}</td>
                            <td style={{ textAlign: "right", color: "var(--txt-danger)" }}>−{fmtMoney(p.pit, currency, fxRate)}</td>
                            <td style={{ textAlign: "right", fontWeight: "var(--fw-semibold)", color: "var(--txt-success)" }}>
                              {fmtMoney(p.netPay, currency, fxRate)}
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <button
                                type="button"
                                onClick={() => setExpanded(expanded === p.id ? null : p.id)}
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
                                <BreakdownPanel slip={p} currency={currency} fxRate={fxRate} period={period} />
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
                      <button type="button" className="page-btn" disabled={safePage === 1}
                        onClick={() => setCurrentPage(safePage - 1)}>‹</button>
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                        <button
                          key={n}
                          type="button"
                          className={`page-btn ${n === safePage ? "active" : ""}`}
                          onClick={() => setCurrentPage(n)}
                        >{n}</button>
                      ))}
                      <button type="button" className="page-btn" disabled={safePage === totalPages}
                        onClick={() => setCurrentPage(safePage + 1)}>›</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default Payroll;
