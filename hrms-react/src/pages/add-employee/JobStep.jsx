import { useTranslation } from "react-i18next";
import { Field } from './Field'
import { StepIcons } from './stepIcons'
import { roleLabel } from './formRules'

export function JobStep({ form, setForm, errors, touched, fieldProps, handleChange, inputStyle, departments, isAdmin, roleOptions, loginEmail }) {
  const { t } = useTranslation();
  return (
    <div>
      <h3 style={{ fontSize: "var(--fs-xl)", fontWeight: "var(--fw-semibold)", marginBottom: "var(--sp-6)", color: "var(--txt-primary)", display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
        <span style={{ color: "var(--clr-primary-400)", display: "inline-flex" }}>{StepIcons.job}</span>
        {t("employees.addEmployee.step2.heading", { defaultValue: "Job Information" })}
      </h3>
      <div className="form-grid">
        <Field label={t("common.fieldLabels.employeeId", { defaultValue: "Employee ID" })} required error={errors.employeeId} touched={touched.employeeId} success={!errors.employeeId && !!form.employeeId} hint={t("employees.addEmployee.step2.employeeIdHint", { defaultValue: "Format: EMP001" })}>
          <input {...fieldProps("employeeId")} placeholder={t("employees.addEmployee.step2.employeeIdPlaceholder", { defaultValue: "EMP009" })} />
        </Field>

        <Field label={t("common.fieldLabels.startDate", { defaultValue: "Start Date" })}>
          <input
            name="startDate" value={form.startDate} onChange={handleChange}
            style={inputStyle("startDate")} type="date"
          />
        </Field>

        <Field label={t("common.fieldLabels.department", { defaultValue: "Department" })} required error={errors.department} touched={touched.department} success={!errors.department && !!form.department}>
          <select {...fieldProps("department")}>
            <option value="">{t("employees.addEmployee.step2.departmentSelectPlaceholder", { defaultValue: "Select department..." })}</option>
            {departments.map((d) => (
              <option key={d.id} value={d.name}>{d.name}</option>
            ))}
          </select>
        </Field>

        <Field label={t("common.fieldLabels.designation", { defaultValue: "Designation" })} required error={errors.designation} touched={touched.designation} success={!errors.designation && !!form.designation}>
          <input {...fieldProps("designation")} placeholder={t("employees.addEmployee.step2.designationPlaceholder", { defaultValue: "Frontend Developer" })} />
        </Field>

        <Field label={t("common.fieldLabels.contractType", { defaultValue: "Contract Type" })}>
          <select name="type" value={form.type} onChange={handleChange} style={inputStyle("type")}>
            <option value="Full-time">{t("common.contractType.Full-time", { defaultValue: "Full-time" })}</option>
            <option value="Part-time">{t("common.contractType.Part-time", { defaultValue: "Part-time" })}</option>
            <option value="Contract">{t("common.contractType.Contract", { defaultValue: "Contract" })}</option>
            <option value="Intern">{t("common.contractType.Intern", { defaultValue: "Intern" })}</option>
          </select>
        </Field>

        <Field label={t("employees.addEmployee.step2.initialStatusLabel", { defaultValue: "Initial Status" })}>
          <select name="status" value={form.status} onChange={handleChange} style={inputStyle("status")}>
            <option value="Active">{t("common.employeeStatus.Active", { defaultValue: "Active" })}</option>
            <option value="On Leave">{t("common.employeeStatus.On Leave", { defaultValue: "On Leave" })}</option>
          </select>
        </Field>
      </div>

      <div style={{
        marginTop: "var(--sp-6)", padding: "var(--sp-5)",
        background: "var(--bg-surface)", border: "1px solid var(--bdr-subtle)",
        borderRadius: "var(--radius-md)",
      }}>
        <div style={{
          fontSize: "var(--fs-xs)", fontWeight: "var(--fw-semibold)",
          textTransform: "uppercase", letterSpacing: "0.08em",
          color: "var(--txt-secondary)", marginBottom: "var(--sp-4)",
        }}>{t("employees.addEmployee.step2.accountAccessTitle", { defaultValue: "Account access" })}</div>

        <label style={{
          display: "flex", alignItems: "flex-start", gap: "var(--sp-3)",
          cursor: "pointer", marginBottom: form.createAccount ? "var(--sp-5)" : 0,
        }}>
          <input
            type="checkbox"
            name="createAccount"
            checked={form.createAccount}
            onChange={(e) => setForm((prev) => ({ ...prev, createAccount: e.target.checked }))}
            style={{ marginTop: "3px", flexShrink: 0 }}
          />
          <span>
            <span style={{ fontSize: "var(--fs-md)", color: "var(--txt-primary)", fontWeight: "var(--fw-medium)" }}>
              {t("employees.addEmployee.step2.createAccountLabel", { defaultValue: "Create a login account" })}
            </span>
            <span style={{ display: "block", fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", marginTop: "2px" }}>
              {t("employees.addEmployee.step2.createAccountHint", { defaultValue: "A temporary password is generated and shown once after saving. The employee must change it at first sign-in." })}
            </span>
          </span>
        </label>

        {form.createAccount && (
          <div className="form-grid">
            <Field label={t("common.fieldLabels.role", { defaultValue: "Role" })} hint={isAdmin ? undefined : t("employees.addEmployee.step2.roleHintRestricted", { defaultValue: "Only an Administrator can create HR or Admin accounts" })}>
              <select
                name="accountRole"
                value={form.accountRole}
                onChange={handleChange}
                style={inputStyle("accountRole")}
                disabled={roleOptions.length === 1}
              >
                {roleOptions.map((role) => (
                  <option key={role} value={role}>{roleLabel(t, role)}</option>
                ))}
              </select>
            </Field>

            <Field label={t("employees.addEmployee.step2.loginEmailLabel", { defaultValue: "Login email" })} hint={form.email ? t("employees.addEmployee.step2.loginEmailHintFromPersonal", { defaultValue: "Taken from the Personal step" }) : t("employees.addEmployee.step2.loginEmailHintDerived", { defaultValue: "Derived from the Employee ID" })}>
              <input
                value={loginEmail}
                readOnly
                placeholder={t("employees.addEmployee.step2.loginEmailPlaceholder", { defaultValue: "Enter an Employee ID or email" })}
                style={{ ...inputStyle("loginEmail"), background: "var(--bg-surface-alt)", cursor: "default" }}
              />
            </Field>
          </div>
        )}
      </div>
    </div>
  );
}
