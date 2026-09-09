import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useCurrency } from "../../context/CurrencyContext";
import { PayrollAPI } from "../../api";
import PayrollBreakdownPanel from "../../components/PayrollBreakdownPanel";
import { idsMatch } from "../../utils/id";
import { translateApiError } from "../../utils/apiError";

/**
 * SalaryTab — full payslip history reused from Payroll (8.0e Day 8).
 *
 * MANAGER/HR/ADMIN get every period they're authorized to see via the
 * payroll API (MANAGER gets back only their own department's payslips —
 * payrollController.js scopes it server-side — HR/ADMIN get everything),
 * filtered client-side to this employee (fine for a small period count). A
 * plain Employee viewing their own profile instead uses the self-service
 * GET /payroll/my-payslips endpoint (10.8), which the backend already
 * resolves to "my own Employee record" and only ever returns
 * approved/paid periods (a draft's numbers are still subject to HR edits).
 */
export function SalaryTab({ employee, isManagerTier }) {
  const { t } = useTranslation();
  const { currency } = useCurrency();
  const [records, setRecords] = useState([]); // [{ period, slip }]
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        if (isManagerTier) {
          const periodsRes = await PayrollAPI.listPeriods();
          const periods = periodsRes.items ?? [];
          const perPeriod = await Promise.all(
            periods.map((period) =>
              PayrollAPI.listPayslips(period.id)
                .then((res) => ({ period, slips: res.items ?? [] }))
                .catch(() => ({ period, slips: [] })),
            ),
          );
          if (cancelled) return;
          const mine = [];
          perPeriod.forEach(({ period, slips }) => {
            slips
              .filter((s) => idsMatch(s.employeeId, employee.id))
              .forEach((slip) => mine.push({ period, slip }));
          });
          mine.sort((a, b) => (b.period.year - a.period.year) || (b.period.month - a.period.month));
          if (!cancelled) { setRecords(mine); setSelectedIdx(0); }
        } else {
          const res = await PayrollAPI.myPayslips();
          if (cancelled) return;
          const mine = (res.items ?? []).map((slip) => ({
            slip,
            period: {
              label: slip.periodLabel,
              fxRate: slip.fxRate,
              standardWorkingDays: slip.standardWorkingDays,
              fxRateSource: slip.fxRateSource,
            },
          }));
          setRecords(mine);
          setSelectedIdx(0);
        }
      } catch (err) {
        if (!cancelled) setError(translateApiError(err, t) || t("employees.viewEmployee.salaryTab.loadError", { defaultValue: "Could not load payroll data." }));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isManagerTier, employee.id, t]);

  if (loading) return <div className="skeleton skeleton-text" style={{ width: "50%" }} />;
  if (error) return <p className="form-error">{error}</p>;

  if (records.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--txt-disabled)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="2" y="6" width="20" height="12" rx="2" />
            <circle cx="12" cy="12" r="2.5" />
          </svg>
        </div>
        <div className="empty-state-title">{t("employees.viewEmployee.salaryTab.noPayslipsTitle", { defaultValue: "No payslips on file" })}</div>
        <div className="empty-state-description">{t("employees.viewEmployee.salaryTab.noPayslipsDesc", { defaultValue: "This employee hasn't been included in a payroll run yet." })}</div>
      </div>
    );
  }

  const current = records[selectedIdx];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", marginBottom: "var(--sp-4)" }}>
        <label htmlFor="salary-period" style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)" }}>
          {t("employees.viewEmployee.salaryTab.periodLabel", { defaultValue: "Period" })}
        </label>
        <select
          id="salary-period"
          value={selectedIdx}
          onChange={(e) => setSelectedIdx(Number(e.target.value))}
          style={{
            padding: "7px var(--sp-3)", border: "1px solid var(--bdr-default)",
            borderRadius: "var(--radius-md)", background: "var(--bg-surface)",
            color: "var(--txt-primary)", fontFamily: "var(--font-family)",
            fontSize: "var(--fs-sm)", outline: "none", cursor: "pointer",
          }}
        >
          {records.map((r, i) => (
            <option key={r.slip.id} value={i}>{r.period.label}</option>
          ))}
        </select>
      </div>

      <PayrollBreakdownPanel slip={current.slip} currency={currency} fxRate={current.period.fxRate} period={current.period} />
    </div>
  );
}
