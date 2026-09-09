import { useTranslation } from "react-i18next";
import { Field } from './Field'
import { StepIcons } from './stepIcons'

export function FinanceStep({ form, errors, touched, fieldProps, handleChange, inputStyle }) {
  const { t } = useTranslation();
  return (
    <div>
      <h3 style={{ fontSize: "var(--fs-xl)", fontWeight: "var(--fw-semibold)", marginBottom: "var(--sp-6)", color: "var(--txt-primary)", display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
        <span style={{ color: "var(--clr-primary-400)", display: "inline-flex" }}>{StepIcons.finance}</span>
        {t("employees.addEmployee.step3.heading", { defaultValue: "Finance Information" })}
      </h3>
      <div className="form-grid">
        <Field label={t("employees.addEmployee.step3.annualSalaryLabel", { defaultValue: "Annual Salary (USD)" })} required error={errors.salary} touched={touched.salary} success={!errors.salary && !!form.salary} hint={t("employees.addEmployee.step3.salaryHint", { defaultValue: "Gross salary, before tax" })}>
          <input {...fieldProps("salary")} type="number" placeholder={t("employees.addEmployee.step3.salaryPlaceholder", { defaultValue: "60000" })} min="0" step="1000" />
        </Field>
        <div />
      </div>

      {/* Salary preview */}
      {Number(form.salary) > 0 && (
        <div style={{
          marginTop: "var(--sp-5)", padding: "var(--sp-5)",
          background: "var(--bg-primary-subtle)", border: "1px solid var(--bdr-brand)",
          borderRadius: "var(--radius-md)",
        }}>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-primary-brand)", fontWeight: "var(--fw-medium)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "var(--sp-4)" }}>
            {t("employees.addEmployee.step3.breakdownTitle", { defaultValue: "Salary Breakdown" })}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--sp-3)", textAlign: "center" }}>
            {[
              { label: t("employees.addEmployee.step3.annual", { defaultValue: "Annual" }),   value: `$${Number(form.salary).toLocaleString("en-US")}` },
              { label: t("employees.addEmployee.review.monthly", { defaultValue: "Monthly" }),  value: `$${Math.round(form.salary / 12).toLocaleString("en-US")}` },
              { label: t("employees.addEmployee.step3.weekly", { defaultValue: "Weekly" }),   value: `$${Math.round(form.salary / 52).toLocaleString("en-US")}` },
            ].map((item) => (
              <div key={item.label} style={{
                padding: "var(--sp-3)", background: "var(--bg-surface)",
                borderRadius: "var(--radius-md)", border: "1px solid var(--bdr-subtle)",
              }}>
                <div style={{ fontSize: "var(--fs-xl)", fontWeight: "var(--fw-semibold)", color: "var(--txt-primary-brand)" }}>{item.value}</div>
                <div className="hint-xs">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: "var(--sp-5)" }}>
        <Field label={t("common.fieldLabels.notes", { defaultValue: "Notes" })}>
          <textarea
            name="notes" value={form.notes} onChange={handleChange}
            style={{ ...inputStyle("notes"), resize: "vertical" }} rows={3}
            placeholder={t("employees.addEmployee.step3.notesPlaceholder", { defaultValue: "Additional information about the employee..." })}
          />
        </Field>
      </div>
    </div>
  );
}
