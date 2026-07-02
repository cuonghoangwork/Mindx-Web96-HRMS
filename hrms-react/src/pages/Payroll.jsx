import { useState, useMemo, Fragment } from "react";
import { useStore } from "../context/StoreContext";
import Avatar from "../components/Avatar";
import { StatusBadge, TypeBadge } from "../components/Badge";

/* ─── Helpers ───
   fmt/fmtK take an amount already expressed in the app's canonical unit — an annual USD
   figure, matching how `employee.salary` is stored — plus an optional `currency` ("USD"
   default, or "VND"). When "VND" is requested, the amount is converted using the same
   USD_TO_VND rate the Vietnam payroll engine below uses, so switching currency and
   switching to a VN-computed breakdown always agree on the same conversion. (USD_TO_VND
   is declared further down in this file; that's fine since these functions aren't
   invoked until render time, well after the whole module has finished evaluating.) */
function fmt(amountUsd, currency = "USD") {
  if (currency === "VND") {
    const vnd = Math.round(amountUsd * USD_TO_VND);
    return `${vnd.toLocaleString("vi-VN")} ₫`;
  }
  return `$${Number(amountUsd).toLocaleString()}`;
}

function fmtK(amountUsd, currency = "USD") {
  if (currency === "VND") {
    const vnd = amountUsd * USD_TO_VND;
    if (vnd >= 1_000_000_000) return `${(vnd / 1_000_000_000).toFixed(1)} tỷ ₫`;
    if (vnd >= 1_000_000)     return `${(vnd / 1_000_000).toFixed(0)} triệu ₫`;
    return `${Math.round(vnd).toLocaleString("vi-VN")} ₫`;
  }
  return amountUsd >= 1_000_000 ? `$${(amountUsd / 1_000_000).toFixed(1)}M`
       : amountUsd >= 1_000     ? `$${(amountUsd / 1_000).toFixed(0)}K`
       : `$${amountUsd}`;
}

// Matches AllEmployees.jsx's EMPLOYEES_PER_PAGE pattern — the salary table previously
// rendered every filtered row unpaginated, which doesn't scale past demo data volume.
const PAYROLL_PER_PAGE = 10;

/* ─── Vietnam payroll deduction engine ───
   Replaces the previous flat US-style 22% federal / 6.2% Social Security / 1.45%
   Medicare estimate with Vietnam's actual statutory formulas:
     - Employee-side social/health/unemployment insurance contributions
     - Progressive monthly Personal Income Tax (PIT) on resident employment income

   Currency note: `employee.salary` is stored and displayed as an ANNUAL USD figure
   throughout the rest of the app (seed data, `fmt`/`fmtK`, the salary table). Vietnamese
   payroll law is denominated in VND with brackets/caps set in VND, so this function
   converts the USD gross to a monthly VND figure, runs the real VN formulas against
   that, then converts each resulting bucket back to an annual USD-equivalent so every
   existing caller (`SalaryBar`, `BreakdownPanel`, `exportCSV`, the salary table) keeps
   working with its current "$" formatting unchanged. The conversion rate is a constant
   below rather than a live FX lookup — real payroll would lock in a rate per pay period,
   but a fixed rate is enough to make the VN brackets/caps apply meaningfully to this
   demo's USD-denominated seed salaries. */

// Approximate USD → VND conversion used only to translate this demo's USD-denominated
// salaries into a realistic VND monthly gross before applying Vietnamese payroll law.
const USD_TO_VND = 25_000;

// Statutory base salary ("lương cơ sở"), effective July 1, 2024 (Decree 73/2024/NĐ-CP).
// Caps employee BHXH (social insurance) + BHYT (health insurance) contributions at 20×.
const BASE_SALARY_VND = 2_340_000;
const BHXH_BHYT_CAP_VND = BASE_SALARY_VND * 20; // 46,800,000 VND/month

// Region I regional minimum wage, effective July 1, 2024 (Decree 74/2024/NĐ-CP).
// Caps employee BHTN (unemployment insurance) contributions at 20×.
const REGION_I_MIN_WAGE_VND = 4_960_000;
const BHTN_CAP_VND = REGION_I_MIN_WAGE_VND * 20; // 99,200,000 VND/month

// Employee-side statutory insurance contribution rates (Law on Social Insurance).
const BHXH_RATE = 0.08;  // Social insurance ("bảo hiểm xã hội")
const BHYT_RATE = 0.015; // Health insurance  ("bảo hiểm y tế")
const BHTN_RATE = 0.01;  // Unemployment insurance ("bảo hiểm thất nghiệp")

// Personal Income Tax family circumstance deductions (Resolution 954/2020/UBTVQH14).
const PERSONAL_DEDUCTION_VND = 11_000_000; // per month, for the taxpayer themselves

// Progressive monthly PIT brackets for resident employment income (Law on Personal
// Income Tax, "lũy tiến từng phần" — partial progressive method: each VND of taxable
// income is taxed at the rate of the bracket it falls in, not the top bracket rate
// applied to the whole amount).
const PIT_BRACKETS_VND = [
  { upTo: 5_000_000,     rate: 0.05 },
  { upTo: 10_000_000,    rate: 0.10 },
  { upTo: 18_000_000,    rate: 0.15 },
  { upTo: 32_000_000,    rate: 0.20 },
  { upTo: 52_000_000,    rate: 0.25 },
  { upTo: 80_000_000,    rate: 0.30 },
  { upTo: Infinity,      rate: 0.35 },
];

/** Progressive PIT on a monthly VND taxable-income figure (already net of insurance + deductions). */
function calcProgressivePitVnd(taxableIncomeVnd) {
  let tax = 0;
  let lowerBound = 0;
  for (const { upTo, rate } of PIT_BRACKETS_VND) {
    if (taxableIncomeVnd <= lowerBound) break;
    const bandAmount = Math.min(taxableIncomeVnd, upTo) - lowerBound;
    tax += bandAmount * rate;
    lowerBound = upTo;
  }
  return tax;
}

/**
 * Computes a Vietnamese payroll breakdown for an ANNUAL USD gross salary.
 * Returns annual USD-equivalent buckets so existing "$"-formatted callers are unaffected.
 *
 * NOTE: assumes a resident taxpayer with 0 registered dependents (the `Employee` schema
 * has no `dependents` field yet — see PAYROLL_IMPROVEMENT_SUGGESTIONS.md for a suggestion
 * to add one and apply the 4,400,000 VND/month per-dependent deduction here).
 */
function calcDeductions(grossAnnualUsd) {
  const monthlyGrossVnd = (grossAnnualUsd / 12) * USD_TO_VND;

  // Employee-side insurance, each capped independently per its own statutory ceiling.
  const bhxhBase = Math.min(monthlyGrossVnd, BHXH_BHYT_CAP_VND);
  const bhtnBase = Math.min(monthlyGrossVnd, BHTN_CAP_VND);
  const bhxhVnd = bhxhBase * BHXH_RATE;
  const bhytVnd = bhxhBase * BHYT_RATE;
  const bhtnVnd = bhtnBase * BHTN_RATE;
  const insuranceTotalVnd = bhxhVnd + bhytVnd + bhtnVnd;

  // PIT taxable base = gross − insurance − personal deduction (dependents: none tracked yet).
  const taxableIncomeVnd = Math.max(0, monthlyGrossVnd - insuranceTotalVnd - PERSONAL_DEDUCTION_VND);
  const pitVnd = calcProgressivePitVnd(taxableIncomeVnd);

  // Convert each monthly VND bucket back to an annual USD-equivalent, at the same rate
  // used to convert gross in. Round tax/social/medicare independently, then let `net`
  // absorb whatever rounding remainder is left — same "last bucket absorbs the remainder"
  // approach already used for the distribution percentages in BreakdownPanel below —
  // so the four buckets always reconcile exactly to the original USD gross figure.
  const toAnnualUsd = (vnd) => Math.round((vnd / USD_TO_VND) * 12);
  const taxUsd      = toAnnualUsd(pitVnd);
  const socialUsd   = toAnnualUsd(bhxhVnd);
  const medicareUsd = toAnnualUsd(bhytVnd + bhtnVnd);
  const netUsd       = Math.round(grossAnnualUsd) - taxUsd - socialUsd - medicareUsd;

  return {
    tax:      taxUsd,      // Personal Income Tax (PIT)
    social:   socialUsd,   // Social insurance (BHXH)
    medicare: medicareUsd, // Health + Unemployment (BHYT + BHTN)
    net:      netUsd,
    // Exposed for the breakdown panel's transparency note — not used by SalaryBar/CSV.
    monthlyGrossVnd,
  };
}

/* ─── Horizontal bar chart (dept salary) ─── */
const DEPT_COLORS = [
  "var(--clr-primary-400)",
  "var(--clr-success-500)",
  "var(--clr-warning-500)",
  "var(--clr-info-500)",
  "var(--clr-primary-300)",
  "var(--clr-success-400)",
  "var(--clr-danger-400)",
];

/** Deterministic per-name color pick — same hashing approach Avatar.jsx already uses
 *  for its per-employee gradient, applied here so a department's chart color is a
 *  function of its name alone, not its index in whatever array order/sort it happens
 *  to be rendered in. Previously `deptData` assigned color by position after a
 *  `.sort((a,b) => b.total - a.total)`, so a department's color could visibly flip
 *  whenever salary totals changed enough to reorder the list. */
function colorForName(name = "", palette) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

function DeptChart({ data, currency }) {
  const max = Math.max(...data.map((d) => d.total), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {data.map((d) => (
        <div key={d.name} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{
            fontSize: "var(--fs-xs)", color: "var(--txt-secondary)",
            width: "88px", textAlign: "right", flexShrink: 0,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{d.name}</span>
          <div style={{ flex: 1, background: "var(--bg-surface-sub)", borderRadius: "var(--radius-full)", height: "10px" }}>
            <div style={{
              height: "10px", borderRadius: "var(--radius-full)",
              background: d.color,
              width: `${Math.round((d.total / max) * 100)}%`,
              transition: "width 0.5s ease",
            }} />
          </div>
          <span style={{
            fontSize: "var(--fs-xs)", fontWeight: "var(--fw-medium)",
            color: "var(--txt-primary)", minWidth: "52px", textAlign: "right",
          }}>{fmtK(d.total, currency)}</span>
          <span style={{
            fontSize: "var(--fs-xs)", color: "var(--txt-secondary)",
            minWidth: "20px", textAlign: "right",
          }}>{d.count}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Donut chart (type breakdown) ─── */
function TypeDonut({ segments, total, currency }) {
  const r = 32, cx = 48, cy = 48;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--sp-5)" }}>
      <div style={{ position: "relative", width: 96, height: 96, flexShrink: 0 }}>
        <svg width={96} height={96} viewBox="0 0 96 96" style={{ transform: "rotate(-90deg)" }}>
          {segments.map((s, i) => {
            const dash = (s.value / (total || 1)) * circ;
            const el = (
              <circle key={i} cx={cx} cy={cy} r={r} fill="none"
                stroke={s.color} strokeWidth="13"
                strokeDasharray={`${dash} ${circ - dash}`}
                strokeDashoffset={-offset} />
            );
            offset += dash;
            return el;
          })}
        </svg>
        <div style={{
          position: "absolute", inset: 0, display: "flex",
          flexDirection: "column", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-semibold)", color: "var(--txt-primary)", lineHeight: 1 }}>
            {total}
          </span>
          <span style={{ fontSize: "var(--fs-2xs)", color: "var(--txt-secondary)", marginTop: "2px" }}>staff</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "100%" }}>
        {segments.map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ width: "9px", height: "9px", borderRadius: "2px", background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span>
            <span style={{ fontSize: "var(--fs-xs)", fontWeight: "var(--fw-medium)", color: "var(--txt-primary)", flexShrink: 0 }}>
              {fmtK(s.total, currency)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Salary breakdown inline bar ─── */
function SalaryBar({ gross, currency }) {
  const { tax, social, medicare, net } = calcDeductions(gross);
  const segs = [
    { label: "Net", title: "Net take-home pay",                    value: net,      color: "var(--clr-success-500)" },
    { label: "PIT", title: "Personal Income Tax",                   value: tax,      color: "var(--clr-danger-400)" },
    { label: "BHXH", title: "Social Insurance (BHXH, 8%)",          value: social,   color: "var(--clr-warning-400)" },
    { label: "BHYT/BHTN", title: "Health + Unemployment Insurance (BHYT 1.5% + BHTN 1%)", value: medicare, color: "var(--clr-info-400)" },
  ];
  return (
    <div style={{ display: "flex", gap: "2px", height: "6px", borderRadius: "var(--radius-full)", overflow: "hidden", width: "80px" }}>
      {segs.map((s) => (
        <div key={s.label} style={{
          height: "100%",
          width: `${Math.round((s.value / gross) * 100)}%`,
          background: s.color,
        }} title={`${s.title}: ${fmt(s.value, currency)}`} />
      ))}
    </div>
  );
}

/* ─── Export CSV ─── */
function exportCSV(employees) {
  const headers = [
    "Name", "Employee ID", "Department", "Type", "Status",
    "Annual Salary (USD)", "Monthly (USD)",
    "PIT (est.)", "BHXH 8% (est.)", "BHYT+BHTN 2.5% (est.)", "Net (est.)",
  ];
  const rows = employees.map((e) => {
    const { tax, social, medicare, net } = calcDeductions(e.salary || 0);
    return [
      e.name, e.employeeId, e.department, e.type, e.status,
      e.salary || 0,
      Math.round((e.salary || 0) / 12),
      tax, social, medicare, net,
    ].join(",");
  });
  // Disclosure row: these are estimates derived from Vietnamese PIT brackets and
  // statutory BHXH/BHYT/BHTN insurance rates, converted from the app's USD-denominated
  // salaries at a fixed demo exchange rate — not verified payroll figures.
  const disclosure = `# Estimated using Vietnamese PIT brackets + BHXH/BHYT/BHTN insurance rates, USD salaries converted at ${USD_TO_VND.toLocaleString()} VND/USD — not actual payroll figures.`;
  const csv  = [disclosure, headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = "payroll.csv"; a.click();
  URL.revokeObjectURL(url);
}

/* ─── Sortable column header — same pattern as AllEmployees.jsx's SortableHeader,
   reused here so Employee/Department/Type/Status/Annual are all sortable instead
   of only the Annual salary column. ─── */
function SortableHeader({ label, field, sortField, sortDir, onSort, align }) {
  const isActive = sortField === field;
  return (
    <th
      className="sortable-header"
      onClick={() => onSort(field)}
      title={`Sort by ${label}`}
      style={align ? { textAlign: align } : undefined}
    >
      {label}
      {isActive && (
        <span className="sort-indicator" aria-hidden="true">{sortDir === "asc" ? " ▲" : " ▼"}</span>
      )}
    </th>
  );
}

/* ═══════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════ */
function Payroll() {
  const { employees, departments } = useStore();

  const [search, setSearch]               = useState("");
  const [deptFilter, setDeptFilter]       = useState("all");
  const [typeFilter, setTypeFilter]       = useState("all");
  const [sortField, setSortField]         = useState("salary");
  const [sortDir, setSortDir]             = useState("desc");
  const [showBreakdown, setShowBreakdown] = useState(null);
  const [currentPage, setCurrentPage]     = useState(1);
  // Display currency toggle — the Vietnam payroll engine below computes internally in
  // VND regardless of this setting; this only controls how already-computed amounts are
  // formatted for display (USD, the app's historical default, or VND).
  const [currency, setCurrency]           = useState("USD");

  /* ── Filtered + sorted table ──
     Computed first (rather than after the stat cards, as it originally was) so the
     top-of-page stat cards below can be derived from it too — previously they always
     read from the raw `employees` array and silently ignored search/department/type
     filters, which disagreed with the table footer just below them. ── */
  const filtered = useMemo(() => employees
    .filter((e) => {
      const q           = search.toLowerCase();
      const matchSearch = !q || e.name.toLowerCase().includes(q) || e.employeeId?.toLowerCase().includes(q);
      const matchDept   = deptFilter === "all" || e.department === deptFilter;
      const matchType   = typeFilter === "all" || e.type === typeFilter;
      return matchSearch && matchDept && matchType;
    })
    .sort((a, b) => {
      const va = a[sortField] || 0;
      const vb = b[sortField] || 0;
      if (typeof va === "string") return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortDir === "asc" ? va - vb : vb - va;
    }),
  [employees, search, deptFilter, typeFilter, sortField, sortDir]);

  const hasActiveFilters = Boolean(search) || deptFilter !== "all" || typeFilter !== "all";

  /* ── Computed totals — now scoped to the current filters, matching the table footer ── */
  const totalSalary  = filtered.reduce((s, e) => s + (e.salary || 0), 0);
  const avgSalary    = filtered.length ? Math.round(totalSalary / filtered.length) : 0;
  // Math.max(...[]) is -Infinity — guard against an empty/loading employees list so the
  // "Highest Salary" stat card never renders "$-InfinityK".
  const maxSalary    = filtered.length ? Math.max(...filtered.map((e) => e.salary || 0)) : 0;
  const onLeaveCount = filtered.filter((e) => e.status === "On Leave").length;

  /* ── Dept breakdown — intentionally stays org-wide (all employees, not the filtered
     table view) since it's meant to answer "how is payroll distributed across the
     company", not "what does my current search/filter show" ── */
  const deptData = useMemo(() => departments.map((d) => ({
    name:  d.name,
    total: employees.filter((e) => e.department === d.name).reduce((s, e) => s + (e.salary || 0), 0),
    count: employees.filter((e) => e.department === d.name).length,
    color: colorForName(d.name, DEPT_COLORS),
  })).sort((a, b) => b.total - a.total), [employees, departments]);

  /* ── Type donut — same org-wide reasoning as deptData above ── */
  const types      = ["Full-time", "Part-time", "Contract", "Intern"];
  const typeColors = ["var(--clr-primary-400)", "var(--clr-success-500)", "var(--clr-warning-500)", "var(--clr-info-500)"];
  const typeSegs   = types.map((t, i) => ({
    label: t,
    value: employees.filter((e) => e.type === t).length,
    total: employees.filter((e) => e.type === t).reduce((s, e) => s + (e.salary || 0), 0),
    color: typeColors[i],
  })).filter((s) => s.value > 0);

  /* ── Pagination — totals/footer stay based on the full `filtered` set, only the
     rendered table rows are sliced, mirroring AllEmployees.jsx's approach ── */
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAYROLL_PER_PAGE));
  // Clamp defensively: if a filter shrinks the result set while on a later page
  // (e.g. searching while viewing page 3), fall back to the last valid page
  // instead of rendering an empty table with visible pagination controls.
  const safePage   = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * PAYROLL_PER_PAGE;
  const paginated  = filtered.slice(startIndex, startIndex + PAYROLL_PER_PAGE);

  const handleSort = (field) => {
    if (sortField === field) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
    setCurrentPage(1);
  };

  const handleSearchChange = (value) => {
    setSearch(value);
    setCurrentPage(1);
  };

  const handleDeptFilterChange = (value) => {
    setDeptFilter(value);
    setCurrentPage(1);
  };

  const handleTypeFilterChange = (value) => {
    setTypeFilter(value);
    setCurrentPage(1);
  };


  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-5)" }}>

      {/* Filter-scope banner — makes it explicit that the stat cards below now move
          with the active search/department/type filters, instead of silently always
          showing org-wide totals while the table below shows a filtered subset. */}
      {hasActiveFilters && (
        <div style={{
          display: "flex", alignItems: "center", gap: "var(--sp-2)",
          padding: "var(--sp-2) var(--sp-4)",
          background: "var(--bg-primary-subtle)", border: "1px solid var(--bdr-brand)",
          borderRadius: "var(--radius-md)",
          fontSize: "var(--fs-xs)", color: "var(--txt-primary-brand)",
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
            <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
          </svg>
          Stats below reflect your current filters — {filtered.length} of {employees.length} employees.
        </div>
      )}

      {/* ── STAT CARDS ── */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-card-label">Total Annual Payroll</div>
          <div className="stat-card-value" style={{ color: "var(--clr-primary-400)" }}>{fmtK(totalSalary, currency)}</div>
          <div className="stat-card-hint">
            {hasActiveFilters ? `${filtered.length} of ${employees.length} employees` : `All ${employees.length} employees`}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Average Salary</div>
          <div className="stat-card-value" style={{ color: "var(--clr-success-600)" }}>{fmtK(avgSalary, currency)}</div>
          <div className="stat-card-hint">Per employee / year</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Highest Salary</div>
          <div className="stat-card-value" style={{ color: "var(--clr-info-600)" }}>{fmtK(maxSalary, currency)}</div>
          <div className="stat-card-hint">{filtered.find((e) => e.salary === maxSalary)?.name}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Monthly Payroll</div>
          <div className="stat-card-value" style={{ color: "var(--clr-warning-600)" }}>{fmtK(Math.round(totalSalary / 12), currency)}</div>
          <div className="stat-card-hint">Next run: Jan 31</div>
          <div className="stat-card-trend down">
            <span>⚠</span> {onLeaveCount} on leave
          </div>
        </div>
      </div>

      {/* ── CHARTS ROW ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 240px", gap: "var(--sp-5)" }}>

        {/* Dept chart */}
        <div className="content-card" style={{ gridColumn: "span 2" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "var(--sp-5)" }}>
            <div>
              <h3 className="section-title" style={{ margin: 0 }}>Salary by Department</h3>
              <p style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", marginTop: "2px" }}>
                Annual payroll total · sorted by spend
              </p>
            </div>
            <div style={{ display: "flex", gap: "var(--sp-3)", alignItems: "center" }}>
              <span style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)" }}>Total · Count</span>
            </div>
          </div>
          <DeptChart data={deptData} currency={currency} />
        </div>

        {/* Type donut */}
        <div className="content-card" style={{ minWidth: 0, overflow: "hidden" }}>
          <h3 className="section-title" style={{ marginBottom: "var(--sp-5)" }}>By Contract Type</h3>
          <TypeDonut segments={typeSegs} total={employees.length} currency={currency} />
        </div>
      </div>

      {/* ── SALARY TABLE ── */}
      <div className="content-card">
        {/* Toolbar */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", marginBottom: "var(--sp-5)", flexWrap: "wrap" }}>
          <h3 className="section-title" style={{ margin: 0, flex: "0 0 auto" }}>Salary Table</h3>
          <div style={{ flex: 1 }} />

          <input
            type="text" value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search employee..."
            style={{
              padding: "7px var(--sp-3)", border: "1px solid var(--bdr-default)",
              borderRadius: "var(--radius-md)", background: "var(--bg-surface)",
              color: "var(--txt-primary)", fontFamily: "var(--font-family)",
              fontSize: "var(--fs-sm)", outline: "none", width: "180px",
            }}
          />

          <select
            value={deptFilter} onChange={(e) => handleDeptFilterChange(e.target.value)}
            style={{
              padding: "7px var(--sp-3)", border: "1px solid var(--bdr-default)",
              borderRadius: "var(--radius-md)", background: "var(--bg-surface)",
              color: "var(--txt-primary)", fontFamily: "var(--font-family)",
              fontSize: "var(--fs-sm)", outline: "none", cursor: "pointer",
            }}
          >
            <option value="all">All Departments</option>
            {departments.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
          </select>

          <select
            value={typeFilter} onChange={(e) => handleTypeFilterChange(e.target.value)}
            style={{
              padding: "7px var(--sp-3)", border: "1px solid var(--bdr-default)",
              borderRadius: "var(--radius-md)", background: "var(--bg-surface)",
              color: "var(--txt-primary)", fontFamily: "var(--font-family)",
              fontSize: "var(--fs-sm)", outline: "none", cursor: "pointer",
            }}
          >
            <option value="all">All Types</option>
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>

          {/* Currency display toggle — the VN payroll engine always computes internally
              in VND regardless of this setting; it only controls display formatting. */}
          <div style={{ display: "flex", gap: "var(--sp-1)", padding: "3px", background: "var(--bg-surface-alt)", borderRadius: "var(--radius-sm)" }}>
            {["USD", "VND"].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCurrency(c)}
                aria-pressed={currency === c}
                style={{
                  padding: "5px 12px", borderRadius: "6px", border: "none", cursor: "pointer",
                  background: currency === c ? "var(--bg-surface)" : "transparent",
                  color: currency === c ? "var(--txt-primary)" : "var(--txt-secondary)",
                  fontFamily: "var(--font-family)", fontSize: "var(--fs-xs)",
                  fontWeight: currency === c ? "var(--fw-medium)" : "var(--fw-regular)",
                  boxShadow: currency === c ? "var(--shadow-xs)" : "none",
                }}
              >
                {c}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => exportCSV(filtered)}
            title="CSV export is always USD-denominated with raw numeric columns, regardless of the display currency toggle above, so it stays spreadsheet-friendly."
          >
            ↓ Export CSV
          </button>
        </div>

        {/* Table */}
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <SortableHeader label="Employee"   field="name"       sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Department" field="department" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Type"       field="type"       sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Status"     field="status"     sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Annual"     field="salary"     sortField={sortField} sortDir={sortDir} onSort={handleSort} align="right" />
                <th style={{ textAlign: "right" }}>Monthly</th>
                <th style={{ textAlign: "right" }}>Net (est.)</th>
                <th>Breakdown</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((emp) => {
                const hasSalary = Boolean(emp.salary);
                const { net } = hasSalary ? calcDeductions(emp.salary) : { net: 0 };
                const isOpen  = showBreakdown === emp.id;
                return (
                  /* ── FIX: Fragment with key instead of bare <> ── */
                  <Fragment key={emp.id}>
                    <tr
                      style={{
                        background: isOpen ? "var(--bg-primary-subtle)" : undefined,
                        cursor: hasSalary ? "pointer" : "default",
                      }}
                      onClick={() => hasSalary && setShowBreakdown(isOpen ? null : emp.id)}
                      // Keyboard accessibility: the row acts as an expand/collapse toggle
                      // for its breakdown panel, so it needs the same semantics a button
                      // would — previously only mouse users could open a breakdown.
                      role={hasSalary ? "button" : undefined}
                      tabIndex={hasSalary ? 0 : undefined}
                      aria-expanded={hasSalary ? isOpen : undefined}
                      aria-label={hasSalary ? `${isOpen ? "Collapse" : "Expand"} salary breakdown for ${emp.name}` : undefined}
                      onKeyDown={hasSalary ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setShowBreakdown(isOpen ? null : emp.id);
                        }
                      } : undefined}
                    >
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
                          <Avatar name={emp.name} src={emp.avatar} size="sm" />
                          <div>
                            <div style={{ fontWeight: "var(--fw-medium)", fontSize: "var(--fs-md)" }}>{emp.name}</div>
                            <div style={{ fontSize: "var(--fs-2xs)", color: "var(--txt-secondary)" }}>{emp.employeeId}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ fontSize: "var(--fs-sm)" }}>{emp.department}</td>
                      <td><TypeBadge type={emp.type} size="sm" /></td>
                      <td><StatusBadge status={emp.status} dot /></td>
                      <td style={{ textAlign: "right", fontWeight: "var(--fw-semibold)", color: "var(--txt-primary)" }}>
                        {hasSalary ? fmt(emp.salary, currency) : "—"}
                      </td>
                      <td style={{ textAlign: "right", fontSize: "var(--fs-sm)", color: "var(--txt-secondary)" }}>
                        {hasSalary ? fmt(Math.round(emp.salary / 12), currency) : "—"}
                      </td>
                      <td style={{ textAlign: "right", fontSize: "var(--fs-sm)", color: "var(--clr-success-700)" }}>
                        {hasSalary ? fmt(net, currency) : "—"}
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
                          {hasSalary ? <SalaryBar gross={emp.salary} currency={currency} /> : "—"}
                          {hasSalary && (
                            <span style={{ fontSize: "10px", color: "var(--txt-disabled)" }} aria-hidden="true">
                              {isOpen ? "▲" : "▼"}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Expanded breakdown row — only ever opened for employees with a salary,
                        so BreakdownPanel's gross-based percentage math never divides by 0. */}
                    {isOpen && hasSalary && (
                      <tr>
                        <td colSpan={8} style={{ padding: 0 }}>
                          <BreakdownPanel emp={emp} currency={currency} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>

            {/* Footer totals */}
            {filtered.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--bdr-subtle)" }}>
                  <td colSpan={4} style={{
                    padding: "var(--sp-3) var(--sp-4)",
                    fontSize: "var(--fs-sm)", fontWeight: "var(--fw-medium)",
                    color: "var(--txt-secondary)",
                  }}>
                    {/* Totals below cover every filtered employee, not just this page —
                        wording updated so it doesn't imply "shown" = "on screen". */}
                    {filtered.length} employee{filtered.length === 1 ? "" : "s"} match filters
                  </td>
                  <td style={{
                    textAlign: "right", padding: "var(--sp-3) var(--sp-4)",
                    fontWeight: "var(--fw-semibold)", color: "var(--txt-primary)",
                    fontSize: "var(--fs-md)",
                  }}>
                    {fmt(totalSalary, currency)}
                  </td>
                  <td style={{
                    textAlign: "right", padding: "var(--sp-3) var(--sp-4)",
                    fontWeight: "var(--fw-semibold)", color: "var(--txt-secondary)",
                    fontSize: "var(--fs-sm)",
                  }}>
                    {fmt(Math.round(totalSalary / 12), currency)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* ── Pagination ── */}
        {filtered.length > 0 && totalPages > 1 && (
          <div className="pagination">
            <div className="pagination-info">
              Showing {startIndex + 1}–{Math.min(startIndex + PAYROLL_PER_PAGE, filtered.length)} of {filtered.length} employees
              {filtered.length !== employees.length && (
                <span style={{ color: "var(--txt-secondary)", marginLeft: "8px" }}>
                  (filtered from {employees.length})
                </span>
              )}
            </div>
            <div className="pagination-controls">
              <button
                className="page-btn"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
              >‹</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  className={`page-btn ${safePage === page ? "active" : ""}`}
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </button>
              ))}
              <button
                className="page-btn"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
              >›</button>
            </div>
          </div>
        )}

        {filtered.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">💰</div>
            <h3 className="empty-state-title">No results</h3>
            <p className="empty-state-description">Try adjusting your search or filters.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Inline breakdown panel ─── */
function BreakdownPanel({ emp, currency }) {
  const { tax, social, medicare, net, monthlyGrossVnd } = calcDeductions(emp.salary || 0);
  const monthly = (n) => fmt(Math.round(n / 12), currency);
  const rows = [
    { label: "Gross Salary",                     value: emp.salary, color: "var(--txt-primary)",    note: "Before deductions" },
    { label: "Personal Income Tax (PIT)",        value: -tax,       color: "var(--txt-danger)",      note: "VN progressive brackets" },
    { label: "Social Insurance (BHXH)",          value: -social,    color: "var(--txt-warning)",     note: "8%" },
    { label: "Health + Unemployment (BHYT/BHTN)", value: -medicare,  color: "var(--txt-info)",        note: "1.5% + 1%" },
    { label: "Net Pay",                           value: net,        color: "var(--clr-success-600)", note: "Take-home" },
  ];

  return (
    <div style={{
      background: "var(--bg-surface-alt)", padding: "var(--sp-4) var(--sp-6)",
      borderBottom: "1px solid var(--bdr-subtle)",
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "var(--sp-6)" }}>

        {/* Breakdown table */}
        <div style={{ gridColumn: "span 2" }}>
          <div style={{ fontSize: "var(--fs-xs)", fontWeight: "var(--fw-semibold)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--txt-secondary)", marginBottom: "var(--sp-3)" }}>
            Salary Breakdown — {emp.name}
          </div>
          {rows.map((r, i) => (
            <div key={r.label} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "8px 0",
              borderBottom: i < rows.length - 1 ? "1px solid var(--bdr-subtle)" : "2px solid var(--bdr-default)",
              borderTop: i === rows.length - 1 ? "2px solid var(--bdr-default)" : undefined,
            }}>
              <div>
                <span style={{ fontSize: "var(--fs-sm)", color: "var(--txt-primary)" }}>{r.label}</span>
                <span style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", marginLeft: "var(--sp-2)" }}>{r.note}</span>
              </div>
              <div style={{ display: "flex", gap: "var(--sp-5)", textAlign: "right" }}>
                <span style={{ fontSize: "var(--fs-sm)", color: r.color, fontWeight: i === rows.length - 1 ? "var(--fw-semibold)" : "var(--fw-regular)", minWidth: "90px" }}>
                  {r.value < 0 ? `−${fmt(Math.abs(r.value), currency)}` : fmt(r.value, currency)}
                </span>
                <span style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)", minWidth: "80px" }}>
                  {monthly(Math.abs(r.value))}/mo
                </span>
              </div>
            </div>
          ))}

          {/* Transparency note — discloses the FX assumption and the VND figure Vietnam's
              actual PIT/insurance formulas were applied to, since the table above still
              displays everything in the app's native "$" formatting. */}
          <div style={{
            marginTop: "var(--sp-3)", fontSize: "var(--fs-xs)", color: "var(--txt-secondary)",
            display: "flex", alignItems: "flex-start", gap: "6px",
          }}>
            <span aria-hidden="true" style={{ flexShrink: 0 }}>ℹ</span>
            <span>
              Computed on a monthly gross of ₫{Math.round(monthlyGrossVnd).toLocaleString("vi-VN")} using
              Vietnam's PIT brackets and statutory BHXH (8%) / BHYT (1.5%) / BHTN (1%) rates,
              converting at {USD_TO_VND.toLocaleString()} VND/USD. Assumes 0 registered dependents.
            </span>
          </div>
        </div>

        {/* Mini visual */}
        <div>
          <div style={{ fontSize: "var(--fs-xs)", fontWeight: "var(--fw-semibold)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--txt-secondary)", marginBottom: "var(--sp-3)" }}>
            Distribution
          </div>
          {(() => {
            // emp.salary is guaranteed truthy here — the caller only renders BreakdownPanel
            // when hasSalary is true — so this division is safe from NaN%/Infinity%.
            const netPct    = Math.round((net    / emp.salary) * 100);
            const taxPct    = Math.round((tax    / emp.salary) * 100);
            const socialPct = Math.round((social / emp.salary) * 100);
            // The "other insurance" bucket absorbs the rounding remainder so the four
            // percentages always sum to exactly 100.
            const otherInsurancePct = 100 - netPct - taxPct - socialPct;

            const distribution = [
              { label: "Net Pay",           value: net,      pct: netPct,           color: "var(--clr-success-500)" },
              { label: "PIT",                value: tax,      pct: taxPct,           color: "var(--clr-danger-400)" },
              { label: "BHXH (Social)",     value: social,   pct: socialPct,        color: "var(--clr-warning-400)" },
              { label: "BHYT/BHTN",         value: medicare, pct: otherInsurancePct, color: "var(--clr-info-400)" },
            ];

            return distribution.map((s) => (
              <div key={s.label} style={{ marginBottom: "var(--sp-2)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                  <span style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)" }}>{s.label}</span>
                  <span style={{ fontSize: "var(--fs-xs)", fontWeight: "var(--fw-medium)", color: "var(--txt-primary)" }}>{s.pct}%</span>
                </div>
                <div style={{ background: "var(--bg-surface-sub)", borderRadius: "var(--radius-full)", height: "6px" }}>
                  <div style={{
                    height: "6px", borderRadius: "var(--radius-full)",
                    background: s.color, width: `${s.pct}%`,
                  }} />
                </div>
              </div>
            ));
          })()}
        </div>

      </div>
    </div>
  );
}

export default Payroll;
