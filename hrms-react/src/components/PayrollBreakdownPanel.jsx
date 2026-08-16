import { fmtMoney } from "../utils/payroll";

/**
 * PayrollBreakdownPanel — full payslip line-item breakdown (base salary,
 * bonus, allowance, deductions, insurance, PIT, net pay).
 *
 * Extracted from pages/Payroll.jsx's local BreakdownPanel (8.0e Day 8) so
 * the Employee Detail "Salary" tab can reuse the exact same breakdown UI
 * instead of duplicating it, per the sprint plan.
 */
function PayrollBreakdownPanel({ slip, currency, fxRate, period }) {
  const rows = [
    { label: "Base salary", value: slip.baseSalary, sign: 1 },
    { label: "Bonus", value: slip.bonus, sign: 1 },
    { label: "Allowance", value: slip.allowance, sign: 1 },
    { label: "Deduction", value: slip.deduction, sign: -1 },
    { label: "Gross pay", value: slip.grossPay, total: true },
    { label: `Social insurance (BHXH 8%)${slip.insuranceExempt ? " — exempt" : ""}`, value: slip.bhxh, sign: -1 },
    { label: `Health insurance (BHYT 1.5%)${slip.insuranceExempt ? " — exempt" : ""}`, value: slip.bhyt, sign: -1 },
    { label: `Unemployment (BHTN 1%)${slip.insuranceExempt ? " — exempt" : ""}`, value: slip.bhtn, sign: -1 },
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
        {Number(period.fxRate).toLocaleString("vi-VN")} VND/USD
        {period.fxRateSource && period.fxRateSource !== "manual"
          ? ` (${period.fxRateSource === "api" ? "live" : "fallback"} rate)`
          : ""} · {slip.unpaidLeaveDays} unpaid leave day
        {slip.unpaidLeaveDays === 1 ? "" : "s"} · {slip.absentDays} absent day
        {slip.absentDays === 1 ? "" : "s"} · assumes 0 registered dependents.
      </div>

      {slip.insuranceExempt && (
        <div style={{
          marginTop: "var(--sp-3)", padding: "var(--sp-3) var(--sp-4)",
          background: "var(--bg-warning-subtle)", border: "1px solid var(--bdr-default)",
          borderRadius: "var(--radius-md)", fontSize: "var(--fs-xs)", color: "var(--txt-secondary)",
        }}>
          No social, health or unemployment insurance is charged this period: {slip.unpaidLeaveDays + slip.absentDays} unpaid
          working days reached the 14-day statutory exemption. Personal income tax still applies.
        </div>
      )}
    </div>
  );
}

export default PayrollBreakdownPanel;
