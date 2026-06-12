import { useState, useMemo } from "react";
import { useStore } from "../context/StoreContext";
import Avatar from "../components/Avatar";
import { StatusBadge, TypeBadge } from "../components/Badge";

/* ─── Helpers ─── */
const fmt  = (n) => `$${Number(n).toLocaleString()}`;
const fmtK = (n) => n >= 1_000_000 ? `$${(n/1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${(n/1_000).toFixed(0)}K` : `$${n}`;

/* ─── Tax / deduction estimates ─── */
function calcDeductions(gross) {
  const tax      = Math.round(gross * 0.22);   // ~22% income tax estimate
  const social   = Math.round(gross * 0.062);  // Social security 6.2%
  const medicare = Math.round(gross * 0.0145); // Medicare 1.45%
  const net      = gross - tax - social - medicare;
  return { tax, social, medicare, net };
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

function DeptChart({ data }) {
  const max = Math.max(...data.map((d) => d.total), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {data.map((d, i) => (
        <div key={d.name} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{
            fontSize: "var(--fs-xs)", color: "var(--txt-secondary)",
            width: "88px", textAlign: "right", flexShrink: 0,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{d.name}</span>
          <div style={{ flex: 1, background: "var(--bg-surface-sub)", borderRadius: "var(--radius-full)", height: "10px" }}>
            <div style={{
              height: "10px", borderRadius: "var(--radius-full)",
              background: DEPT_COLORS[i % DEPT_COLORS.length],
              width: `${Math.round((d.total / max) * 100)}%`,
              transition: "width 0.5s ease",
            }} />
          </div>
          <span style={{
            fontSize: "var(--fs-xs)", fontWeight: "var(--fw-medium)",
            color: "var(--txt-primary)", minWidth: "52px", textAlign: "right",
          }}>{fmtK(d.total)}</span>
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
function TypeDonut({ segments, total }) {
  const r = 32, cx = 48, cy = 48;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-5)" }}>
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
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1 }}>
        {segments.map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ width: "9px", height: "9px", borderRadius: "2px", background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", flex: 1 }}>{s.label}</span>
            <span style={{ fontSize: "var(--fs-xs)", fontWeight: "var(--fw-medium)", color: "var(--txt-primary)" }}>
              {fmtK(s.total)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Salary breakdown inline bar ─── */
function SalaryBar({ gross }) {
  const { tax, social, medicare, net } = calcDeductions(gross);
  const segs = [
    { label: "Net", value: net,      color: "var(--clr-success-500)" },
    { label: "Tax", value: tax,      color: "var(--clr-danger-400)" },
    { label: "SS",  value: social,   color: "var(--clr-warning-400)" },
    { label: "Med", value: medicare, color: "var(--clr-info-400)" },
  ];
  return (
    <div style={{ display: "flex", gap: "2px", height: "6px", borderRadius: "var(--radius-full)", overflow: "hidden", width: "80px" }}>
      {segs.map((s) => (
        <div key={s.label} style={{
          height: "100%",
          width: `${Math.round((s.value / gross) * 100)}%`,
          background: s.color,
        }} title={`${s.label}: ${fmt(s.value)}`} />
      ))}
    </div>
  );
}

/* ─── Export CSV ─── */
function exportCSV(employees) {
  const headers = ["Name","Employee ID","Department","Type","Status","Annual Salary","Monthly","Tax (est.)","Net (est.)"];
  const rows = employees.map((e) => {
    const { tax, net } = calcDeductions(e.salary || 0);
    return [
      e.name, e.employeeId, e.department, e.type, e.status,
      e.salary || 0,
      Math.round((e.salary || 0) / 12),
      tax, net,
    ].join(",");
  });
  const csv  = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = "payroll.csv"; a.click();
  URL.revokeObjectURL(url);
}

/* ═══════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════ */
function Payroll() {
  const { employees, departments } = useStore();

  const [search, setSearch]           = useState("");
  const [deptFilter, setDeptFilter]   = useState("all");
  const [typeFilter, setTypeFilter]   = useState("all");
  const [sortField, setSortField]     = useState("salary");
  const [sortDir, setSortDir]         = useState("desc");
  const [showBreakdown, setShowBreakdown] = useState(null); // employee id

  /* ── Computed totals ── */
  const totalSalary   = employees.reduce((s, e) => s + (e.salary || 0), 0);
  const avgSalary     = employees.length ? Math.round(totalSalary / employees.length) : 0;
  const maxSalary     = Math.max(...employees.map((e) => e.salary || 0));
  const onLeaveCount  = employees.filter((e) => e.status === "On Leave").length;

  /* ── Dept breakdown ── */
  const deptData = useMemo(() => departments.map((d, i) => ({
    name:  d.name,
    total: employees.filter((e) => e.department === d.name).reduce((s, e) => s + (e.salary || 0), 0),
    count: employees.filter((e) => e.department === d.name).length,
    color: DEPT_COLORS[i % DEPT_COLORS.length],
  })).sort((a, b) => b.total - a.total), [employees, departments]);

  /* ── Type donut ── */
  const types = ["Full-time", "Part-time", "Contract", "Intern"];
  const typeColors = ["var(--clr-primary-400)", "var(--clr-success-500)", "var(--clr-warning-500)", "var(--clr-info-500)"];
  const typeSegs = types.map((t, i) => ({
    label: t,
    value: employees.filter((e) => e.type === t).length,
    total: employees.filter((e) => e.type === t).reduce((s, e) => s + (e.salary || 0), 0),
    color: typeColors[i],
  })).filter((s) => s.value > 0);

  /* ── Filtered + sorted table ── */
  const filtered = useMemo(() => employees
    .filter((e) => {
      const q = search.toLowerCase();
      const matchSearch  = !q || e.name.toLowerCase().includes(q) || e.employeeId?.toLowerCase().includes(q);
      const matchDept    = deptFilter === "all" || e.department === deptFilter;
      const matchType    = typeFilter === "all" || e.type === typeFilter;
      return matchSearch && matchDept && matchType;
    })
    .sort((a, b) => {
      const va = sortField === "name" ? a.name : (a[sortField] || 0);
      const vb = sortField === "name" ? b.name : (b[sortField] || 0);
      if (typeof va === "string") return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortDir === "asc" ? va - vb : vb - va;
    }),
  [employees, search, deptFilter, typeFilter, sortField, sortDir]);

  const filteredTotal = filtered.reduce((s, e) => s + (e.salary || 0), 0);

  const handleSort = (field) => {
    if (sortField === field) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const sortIcon = (field) => sortField === field ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-5)" }}>

      {/* ── STAT CARDS ── */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-card-label">Total Annual Payroll</div>
          <div className="stat-card-value" style={{ color: "var(--clr-primary-400)" }}>{fmtK(totalSalary)}</div>
          <div className="stat-card-hint">All {employees.length} employees</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Average Salary</div>
          <div className="stat-card-value" style={{ color: "var(--clr-success-600)" }}>{fmtK(avgSalary)}</div>
          <div className="stat-card-hint">Per employee / year</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Highest Salary</div>
          <div className="stat-card-value" style={{ color: "var(--clr-info-600)" }}>{fmtK(maxSalary)}</div>
          <div className="stat-card-hint">{employees.find((e) => e.salary === maxSalary)?.name}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Monthly Payroll</div>
          <div className="stat-card-value" style={{ color: "var(--clr-warning-600)" }}>{fmtK(Math.round(totalSalary / 12))}</div>
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
          <DeptChart data={deptData} />
        </div>

        {/* Type donut */}
        <div className="content-card">
          <h3 className="section-title" style={{ marginBottom: "var(--sp-5)" }}>By Contract Type</h3>
          <TypeDonut segments={typeSegs} total={employees.length} />
        </div>
      </div>

      {/* ── SALARY TABLE ── */}
      <div className="content-card">
        {/* Toolbar */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", marginBottom: "var(--sp-5)", flexWrap: "wrap" }}>
          <h3 className="section-title" style={{ margin: 0, flex: "0 0 auto" }}>Salary Table</h3>
          <div style={{ flex: 1 }} />

          {/* Search */}
          <input
            type="text" value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employee..."
            style={{
              padding: "7px var(--sp-3)", border: "1px solid var(--bdr-default)",
              borderRadius: "var(--radius-md)", background: "var(--bg-surface)",
              color: "var(--txt-primary)", fontFamily: "var(--font-family)",
              fontSize: "var(--fs-sm)", outline: "none", width: "180px",
            }}
          />

          {/* Dept filter */}
          <select
            value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}
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

          {/* Type filter */}
          <select
            value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
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

          {/* Export */}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => exportCSV(filtered)}
          >
            ↓ Export CSV
          </button>
        </div>

        {/* Table */}
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Department</th>
                <th>Type</th>
                <th>Status</th>
                <th
                  className="sortable-header"
                  onClick={() => handleSort("salary")}
                  style={{ textAlign: "right" }}
                >
                  Annual{sortIcon("salary")}
                </th>
                <th style={{ textAlign: "right" }}>Monthly</th>
                <th style={{ textAlign: "right" }}>Net (est.)</th>
                <th>Breakdown</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((emp) => {
                const { net } = calcDeductions(emp.salary || 0);
                const isOpen  = showBreakdown === emp.id;
                return (
                  <>
                    <tr
                      key={emp.id}
                      style={{ background: isOpen ? "var(--bg-primary-subtle)" : undefined, cursor: "pointer" }}
                      onClick={() => setShowBreakdown(isOpen ? null : emp.id)}
                    >
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
                          <Avatar name={emp.name} size="sm" />
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
                        {emp.salary ? fmt(emp.salary) : "—"}
                      </td>
                      <td style={{ textAlign: "right", fontSize: "var(--fs-sm)", color: "var(--txt-secondary)" }}>
                        {emp.salary ? fmt(Math.round(emp.salary / 12)) : "—"}
                      </td>
                      <td style={{ textAlign: "right", fontSize: "var(--fs-sm)", color: "var(--clr-success-700)" }}>
                        {emp.salary ? fmt(net) : "—"}
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
                          {emp.salary ? <SalaryBar gross={emp.salary} /> : "—"}
                          <span style={{ fontSize: "10px", color: "var(--txt-disabled)" }}>
                            {isOpen ? "▲" : "▼"}
                          </span>
                        </div>
                      </td>
                    </tr>

                    {/* Expanded breakdown row */}
                    {isOpen && (
                      <tr key={`${emp.id}-breakdown`}>
                        <td colSpan={8} style={{ padding: 0 }}>
                          <BreakdownPanel emp={emp} />
                        </td>
                      </tr>
                    )}
                  </>
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
                    {filtered.length} employees shown
                  </td>
                  <td style={{
                    textAlign: "right", padding: "var(--sp-3) var(--sp-4)",
                    fontWeight: "var(--fw-semibold)", color: "var(--txt-primary)",
                    fontSize: "var(--fs-md)",
                  }}>
                    {fmt(filteredTotal)}
                  </td>
                  <td style={{
                    textAlign: "right", padding: "var(--sp-3) var(--sp-4)",
                    fontWeight: "var(--fw-semibold)", color: "var(--txt-secondary)",
                    fontSize: "var(--fs-sm)",
                  }}>
                    {fmt(Math.round(filteredTotal / 12))}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

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
function BreakdownPanel({ emp }) {
  const { tax, social, medicare, net } = calcDeductions(emp.salary || 0);
  const monthly = (n) => fmt(Math.round(n / 12));
  const rows = [
    { label: "Gross Salary",       value: emp.salary,  color: "var(--txt-primary)",   note: "Before deductions" },
    { label: "Income Tax (est.)",  value: -tax,        color: "var(--txt-danger)",     note: "~22% estimate" },
    { label: "Social Security",    value: -social,     color: "var(--txt-warning)",    note: "6.2%" },
    { label: "Medicare",           value: -medicare,   color: "var(--txt-info)",       note: "1.45%" },
    { label: "Net Pay",            value: net,         color: "var(--clr-success-600)", note: "Take-home" },
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
                  {r.value < 0 ? `−${fmt(Math.abs(r.value))}` : fmt(r.value)}
                </span>
                <span style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)", minWidth: "80px" }}>
                  {monthly(Math.abs(r.value))}/mo
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Mini visual */}
        <div>
          <div style={{ fontSize: "var(--fs-xs)", fontWeight: "var(--fw-semibold)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--txt-secondary)", marginBottom: "var(--sp-3)" }}>
            Distribution
          </div>
          {[
            { label: "Net Pay",        value: net,         pct: Math.round((net / emp.salary) * 100),     color: "var(--clr-success-500)" },
            { label: "Income Tax",     value: tax,         pct: Math.round((tax / emp.salary) * 100),     color: "var(--clr-danger-400)" },
            { label: "Social Sec.",    value: social,      pct: Math.round((social / emp.salary) * 100),  color: "var(--clr-warning-400)" },
            { label: "Medicare",       value: medicare,    pct: Math.round((medicare / emp.salary) * 100),color: "var(--clr-info-400)" },
          ].map((s) => (
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
          ))}
        </div>

      </div>
    </div>
  );
}

export default Payroll;
