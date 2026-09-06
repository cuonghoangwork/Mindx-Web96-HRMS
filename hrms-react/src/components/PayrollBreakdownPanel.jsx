import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const exemptSuffix = slip.insuranceExempt ? t("payrollBreakdown.exemptSuffix", { defaultValue: " — exempt" }) : "";

  // "150% × 4h · 200% × 10h · 270% × 2h · PIT-exempt".
  //
  // The segments arrive pre-computed from the server (payslipToClient), so the
  // statutory multipliers live in exactly one place — utils/overtimeRate.js —
  // rather than being duplicated here and drifting the first time one changes.
  const overtimeNote = [
    ...(slip.overtimeSegments ?? []).map((s) =>
      t("payrollBreakdown.overtimeSegment", {
        percent: s.percent,
        hours: s.hours,
        defaultValue: "{{percent}}% × {{hours}}h",
      }),
    ),
    slip.overtimeTaxExempt
      ? t("payrollBreakdown.overtimePitExempt", { defaultValue: "PIT-exempt" })
      : t("payrollBreakdown.overtimePitTaxed", { defaultValue: "taxed" }),
  ].join(" · ");
  const rows = [
    { label: t("payrollBreakdown.rows.baseSalary", { defaultValue: "Base salary" }), value: slip.baseSalary, sign: 1 },
    { label: t("payrollBreakdown.rows.bonus", { defaultValue: "Bonus" }), value: slip.bonus, sign: 1 },
    // Overtime sits after Bonus, and only appears when there is some — a row
    // reading "Overtime (0 h) · PIT-exempt" on every payslip in the company
    // would be noise on the great majority of them.
    ...(slip.overtimePay > 0
      ? [{
          label: t("payrollBreakdown.rows.overtime", {
            hours: slip.overtimeHours,
            defaultValue: "Overtime ({{hours}} h)",
          }),
          value: slip.overtimePay,
          sign: 1,
          note: overtimeNote,
        }]
      : []),
    { label: t("payrollBreakdown.rows.allowance", { defaultValue: "Allowance" }), value: slip.allowance, sign: 1 },
    { label: t("payrollBreakdown.rows.deduction", { defaultValue: "Deduction" }), value: slip.deduction, sign: -1 },
    { label: t("payrollBreakdown.rows.grossPay", { defaultValue: "Gross pay" }), value: slip.grossPay, total: true },
    { label: `${t("payrollBreakdown.rows.socialInsurance", { defaultValue: "Social insurance (BHXH 8%)" })}${exemptSuffix}`, value: slip.bhxh, sign: -1 },
    { label: `${t("payrollBreakdown.rows.healthInsurance", { defaultValue: "Health insurance (BHYT 1.5%)" })}${exemptSuffix}`, value: slip.bhyt, sign: -1 },
    { label: `${t("payrollBreakdown.rows.unemployment", { defaultValue: "Unemployment (BHTN 1%)" })}${exemptSuffix}`, value: slip.bhtn, sign: -1 },
    { label: t("payrollBreakdown.rows.personalIncomeTax", { defaultValue: "Personal income tax" }), value: slip.pit, sign: -1 },
    { label: t("payrollBreakdown.rows.netPay", { defaultValue: "Net pay" }), value: slip.netPay, total: true },
  ];

  const rateSourceSuffix = period.fxRateSource && period.fxRateSource !== "manual"
    ? ` (${period.fxRateSource === "api" ? t("payroll.rateType.live", { defaultValue: "live rate" }) : t("payroll.rateType.fallback", { defaultValue: "fallback rate" })})`
    : "";
  const leaveClause = t("payrollBreakdown.unpaidLeaveDay", {
    count: slip.unpaidLeaveDays,
    defaultValue_one: "{{count}} unpaid leave day",
    defaultValue_other: "{{count}} unpaid leave days",
  });
  const absentClause = t("payrollBreakdown.absentDay", {
    count: slip.absentDays,
    defaultValue_one: "{{count}} absent day",
    defaultValue_other: "{{count}} absent days",
  });

  return (
    <div style={{
      padding: "var(--sp-5)", background: "var(--bg-surface-alt)",
      borderRadius: "var(--radius-md)", border: "1px solid var(--bdr-subtle)",
    }}>
      <div style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-semibold)", color: "var(--txt-primary)", marginBottom: "var(--sp-4)" }}>
        {t("payrollBreakdown.heading", { name: slip.employeeName, defaultValue: "Salary breakdown — {{name}}" })}
      </div>

      <div style={{ maxWidth: "520px" }}>
        {rows.map((r) => (
          <div key={r.label} style={{
            padding: "7px 0", borderBottom: "1px solid var(--bdr-subtle)",
            fontWeight: r.total ? "var(--fw-semibold)" : "var(--fw-regular)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--sp-4)" }}>
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
            {r.note && (
              <div style={{
                fontSize: "var(--fs-xs)", color: "var(--txt-secondary)",
                marginTop: "2px", fontWeight: "var(--fw-regular)",
              }}>
                └ {r.note}
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{
        marginTop: "var(--sp-4)", padding: "var(--sp-3) var(--sp-4)",
        background: "var(--bg-info-subtle)", border: "1px solid var(--bdr-info)",
        borderRadius: "var(--radius-md)", fontSize: "var(--fs-xs)", color: "var(--txt-info)",
      }}>
        {t("payrollBreakdown.disclosure", {
          label: period.label,
          workDays: period.standardWorkingDays,
          rate: Number(period.fxRate).toLocaleString("vi-VN"),
          rateSourceSuffix,
          leaveClause,
          absentClause,
          defaultValue: "Period {{label}} · {{workDays}} standard working days · FX rate locked at {{rate}} VND/USD{{rateSourceSuffix}} · {{leaveClause}} · {{absentClause}} · assumes 0 registered dependents.",
        })}
      </div>

      {slip.insuranceExempt && (
        <div style={{
          marginTop: "var(--sp-3)", padding: "var(--sp-3) var(--sp-4)",
          background: "var(--bg-warning-subtle)", border: "1px solid var(--bdr-default)",
          borderRadius: "var(--radius-md)", fontSize: "var(--fs-xs)", color: "var(--txt-secondary)",
        }}>
          {t("payrollBreakdown.insuranceExemptWarning", {
            days: slip.unpaidLeaveDays + slip.absentDays,
            defaultValue: "No social, health or unemployment insurance is charged this period: {{days}} unpaid working days reached the 14-day statutory exemption. Personal income tax still applies.",
          })}
        </div>
      )}
    </div>
  );
}

export default PayrollBreakdownPanel;
