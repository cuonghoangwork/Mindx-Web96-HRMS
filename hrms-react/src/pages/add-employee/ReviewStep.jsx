import { useTranslation } from "react-i18next";
import Avatar from "../../components/Avatar";
import { StatusBadge, TypeBadge } from "../../components/Badge";
import { roleLabel } from './formRules'

/* ─────────────────────────────────
   Review step
───────────────────────────────── */
export function ReviewStep({ formData, onEdit, loginEmail }) {
  const { t } = useTranslation();
  const notFilled = t("employees.addEmployee.review.notFilled", { defaultValue: "Not filled" });
  const sections = [
    {
      title: t("employees.addEmployee.review.sectionPersonal", { defaultValue: "Personal" }), stepId: 1,
      rows: [
        { label: t("common.fieldLabels.fullName", { defaultValue: "Full Name" }),    value: formData.name },
        { label: t("common.fieldLabels.age", { defaultValue: "Age" }),          value: formData.age },
        { label: t("common.fieldLabels.gender", { defaultValue: "Gender" }),       value: formData.sex ? t(`common.gender.${formData.sex}`, { defaultValue: formData.sex }) : "" },
        { label: t("common.fieldLabels.email", { defaultValue: "Email" }),       value: formData.email },
        { label: t("common.fieldLabels.phone", { defaultValue: "Phone" }),        value: formData.phone },
        { label: t("common.fieldLabels.address", { defaultValue: "Address" }),      value: formData.address },
      ],
    },
    {
      title: t("employees.addEmployee.review.sectionJob", { defaultValue: "Job" }), stepId: 2,
      rows: [
        { label: t("common.fieldLabels.employeeId", { defaultValue: "Employee ID" }),   value: formData.employeeId },
        { label: t("common.fieldLabels.department", { defaultValue: "Department" }),    value: formData.department },
        { label: t("common.fieldLabels.designation", { defaultValue: "Designation" }),   value: formData.designation },
        { label: t("common.fieldLabels.contractType", { defaultValue: "Contract Type" }), value: formData.type ? t(`common.contractType.${formData.type}`, { defaultValue: formData.type }) : "" },
        { label: t("common.fieldLabels.startDate", { defaultValue: "Start Date" }),    value: formData.startDate },
        { label: t("common.fieldLabels.status", { defaultValue: "Status" }),        value: formData.status ? t(`common.employeeStatus.${formData.status}`, { defaultValue: formData.status }) : "" },
      ],
    },
    {
      title: t("employees.addEmployee.review.sectionAccount", { defaultValue: "Account" }), stepId: 2,
      rows: [
        { label: t("employees.addEmployee.review.loginAccount", { defaultValue: "Login account" }), value: formData.createAccount ? t("employees.addEmployee.review.willBeCreated", { defaultValue: "Will be created" }) : t("employees.addEmployee.review.notCreated", { defaultValue: "Not created" }) },
        { label: t("employees.addEmployee.review.loginEmail", { defaultValue: "Login email" }),   value: formData.createAccount ? loginEmail : "" },
        { label: t("common.fieldLabels.role", { defaultValue: "Role" }),          value: formData.createAccount ? roleLabel(t, formData.accountRole) : "" },
      ],
    },
    {
      title: t("employees.addEmployee.review.sectionFinance", { defaultValue: "Finance" }), stepId: 3,
      rows: [
        { label: t("common.fieldLabels.annualSalary", { defaultValue: "Annual Salary" }), value: formData.salary ? `$${Number(formData.salary).toLocaleString("en-US")}` : "" },
        { label: t("employees.addEmployee.review.monthly", { defaultValue: "Monthly" }),       value: formData.salary ? `$${Math.round(formData.salary / 12).toLocaleString("en-US")}` : "" },
        { label: t("common.fieldLabels.notes", { defaultValue: "Notes" }),         value: formData.notes },
      ],
    },
  ];

  return (
    <div>
      {/* Profile card */}
      <div style={{
        display: "flex", alignItems: "center", gap: "var(--sp-4)",
        padding: "var(--sp-5)", marginBottom: "var(--sp-6)",
        background: "var(--bg-primary-subtle)",
        border: "2px solid var(--bdr-brand)", borderRadius: "var(--radius-lg)",
      }}>
        <Avatar name={formData.name || t("employees.addEmployee.review.newEmployee", { defaultValue: "New Employee" })} size="lg" status={formData.status === "Active" ? "active" : "leave"} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "var(--fs-2xl)", fontWeight: "var(--fw-semibold)", color: "var(--txt-primary)" }}>
            {formData.name || "—"}
          </div>
          <div style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)", marginTop: "3px" }}>
            {[formData.designation, formData.department, formData.employeeId].filter(Boolean).join(" · ") || "—"}
          </div>
          <div style={{ display: "flex", gap: "var(--sp-2)", marginTop: "var(--sp-3)", flexWrap: "wrap" }}>
            <StatusBadge status={formData.status} />
            <TypeBadge type={formData.type} />
            {formData.salary && (
              <span style={{
                fontSize: "var(--fs-xs)", padding: "3px 10px", borderRadius: "var(--radius-full)",
                background: "var(--bg-success-subtle)", color: "var(--txt-success)",
                border: "1px solid var(--bdr-success)",
              }}>
                ${Number(formData.salary).toLocaleString("en-US")}/yr
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Sections */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--sp-4)" }}>
        {sections.map((sec) => (
          <div key={sec.title} style={{
            background: "var(--bg-surface)", border: "1px solid var(--bdr-subtle)",
            borderRadius: "var(--radius-md)", padding: "var(--sp-4)",
            gridColumn: sec.stepId === 3 ? "1 / -1" : undefined,
          }}>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              marginBottom: "var(--sp-3)",
            }}>
              <span style={{
                fontSize: "var(--fs-xs)", fontWeight: "var(--fw-semibold)",
                textTransform: "uppercase", letterSpacing: "0.08em",
                color: "var(--txt-secondary)",
              }}>{sec.title}</span>
              <button
                type="button"
                onClick={() => onEdit(sec.stepId)}
                style={{
                  fontSize: "var(--fs-xs)", color: "var(--txt-primary-brand)",
                  background: "none", border: "none", cursor: "pointer",
                  padding: "2px 6px", borderRadius: "var(--radius-sm)",
                  fontFamily: "inherit",
                }}
              >✏ {t("common.actions.edit", { defaultValue: "Edit" })}</button>
            </div>
            {sec.rows
              .filter((r) => sec.stepId === 3 ? r.label !== t("employees.addEmployee.review.monthly", { defaultValue: "Monthly" }) : true)
              .map((row) => (
                <div key={row.label} style={{
                  display: "flex", justifyContent: "space-between",
                  padding: "7px 0", borderBottom: "1px solid var(--bdr-subtle)",
                  gap: "var(--sp-4)",
                }}>
                  <span style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)", flexShrink: 0 }}>{row.label}</span>
                  <span style={{
                    fontSize: "var(--fs-sm)", fontWeight: "var(--fw-medium)",
                    color: row.value ? "var(--txt-primary)" : "var(--txt-disabled)",
                    fontStyle: row.value ? "normal" : "italic",
                    textAlign: "right",
                  }}>{row.value || notFilled}</span>
                </div>
              ))}
          </div>
        ))}
      </div>

      <div style={{
        marginTop: "var(--sp-5)", padding: "var(--sp-4)",
        background: "var(--bg-info-subtle)", border: "1px solid var(--bdr-info)",
        borderRadius: "var(--radius-md)", fontSize: "var(--fs-sm)", color: "var(--txt-info)",
        display: "flex", gap: "var(--sp-3)", alignItems: "flex-start",
      }}>
        <span aria-hidden="true" style={{ flexShrink: 0 }}>ℹ️</span>
        <span>
          {t("employees.addEmployee.review.infoBannerPrefix", { defaultValue: "Please review carefully before clicking" })}{" "}
          <strong>{t("employees.addEmployee.nav.createEmployee", { defaultValue: "Create Employee" })}</strong>
          {t("employees.addEmployee.review.infoBannerMiddle", { defaultValue: ". Click" })}{" "}
          <strong>✏ {t("common.actions.edit", { defaultValue: "Edit" })}</strong>
          {t("employees.addEmployee.review.infoBannerSuffix", { defaultValue: " on any section to go back and make changes." })}
        </span>
      </div>
    </div>
  );
}
