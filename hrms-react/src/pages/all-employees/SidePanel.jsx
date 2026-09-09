import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Avatar from "../../components/Avatar";
import { StatusBadge, TypeBadge } from "../../components/Badge";
import Button from "../../components/Button";

/* ─────────────────────────────────────────
   Employee Detail Side Panel
───────────────────────────────────────── */
export function SidePanel({ employee, onClose, onDelete, onStatusChange, canSeeSalary }) {
  const { t } = useTranslation();
  if (!employee) return null;

  const fields = [
    { label: t("common.fieldLabels.employeeId", { defaultValue: "Employee ID" }), value: employee.employeeId },
    { label: t("common.fieldLabels.department", { defaultValue: "Department" }),  value: employee.department },
    { label: t("common.fieldLabels.designation", { defaultValue: "Designation" }), value: employee.designation },
    { label: t("common.columns.type", { defaultValue: "Type" }),        value: employee.type, render: () => <TypeBadge type={employee.type} /> },
    { label: t("common.fieldLabels.age", { defaultValue: "Age" }),         value: employee.age || "—" },
    { label: t("common.fieldLabels.sex", { defaultValue: "Sex" }),      value: employee.sex ? t(`common.gender.${employee.sex}`, { defaultValue: employee.sex }) : "—" },
    { label: t("common.fieldLabels.email", { defaultValue: "Email" }),       value: employee.email || "—" },
    { label: t("common.fieldLabels.phone", { defaultValue: "Phone" }),       value: employee.phone || "—" },
    { label: t("common.fieldLabels.address", { defaultValue: "Address" }),     value: employee.address || "—" },
    // Salary — hidden from a plain EMPLOYEE viewing a colleague's card now
    // that Directory is open to every role (see App.jsx); MANAGER/HR/ADMIN
    // keep seeing it, matching this app's existing company-wide salary
    // visibility for those tiers (Payroll, "My Department" roster, etc.).
    ...(canSeeSalary
      ? [{ label: t("common.fieldLabels.salary", { defaultValue: "Salary" }), value: employee.salary ? `$${employee.salary.toLocaleString("en-US")}/yr` : "—" }]
      : []),
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(11,31,58,0.25)",
          backdropFilter: "blur(2px)",
          zIndex: "var(--z-overlay)",
        }}
      />

      {/* Panel */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0,
        width: "min(400px, 100vw)",
        background: "var(--bg-surface)",
        borderLeft: "1px solid var(--bdr-subtle)",
        boxShadow: "var(--shadow-xl)",
        zIndex: "var(--z-modal)",
        display: "flex", flexDirection: "column",
        animation: "slideIn 0.22s ease",
      }}>
        <style>{`
          @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to   { transform: translateX(0);    opacity: 1; }
          }
        `}</style>

        {/* Header */}
        <div style={{
          padding: "var(--sp-5) var(--sp-6)",
          borderBottom: "1px solid var(--bdr-subtle)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <span style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-semibold)", color: "var(--txt-primary)" }}>
            {t("employees.allEmployees.sidePanel.title", { defaultValue: "Employee Details" })}
          </span>
          <button
            type="button" onClick={onClose}
            style={{
              width: "32px", height: "32px", border: "1px solid var(--bdr-default)",
              borderRadius: "var(--radius-sm)", background: "transparent",
              cursor: "pointer", fontSize: "18px", color: "var(--txt-secondary)",
              display: "grid", placeItems: "center",
            }}
            aria-label={t("employees.allEmployees.sidePanel.closeAria", { defaultValue: "Close panel" })}
          >×</button>
        </div>

        {/* Profile */}
        <div style={{
          padding: "var(--sp-6)",
          borderBottom: "1px solid var(--bdr-subtle)",
          display: "flex", alignItems: "center", gap: "var(--sp-4)",
          flexShrink: 0,
        }}>
          <Avatar
            name={employee.name} src={employee.avatar} size="lg"
            status={employee.status === "Active" ? "active" : employee.status === "On Leave" ? "leave" : "terminated"}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "var(--fs-xl)", fontWeight: "var(--fw-semibold)", color: "var(--txt-primary)", marginBottom: "4px" }}>
              {employee.name}
            </div>
            <div style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)", marginBottom: "var(--sp-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {employee.designation} · {employee.department}
            </div>
            <StatusBadge status={employee.status} />
          </div>
        </div>

        {/* Fields */}
        <div style={{ flex: 1, overflowY: "auto", padding: "var(--sp-4) var(--sp-6)" }}>
          {fields.map(({ label, value, render }) => (
            <div key={label} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 0", borderBottom: "1px solid var(--bdr-subtle)", gap: "var(--sp-4)",
            }}>
              <span style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", textTransform: "uppercase", letterSpacing: "0.07em", flexShrink: 0 }}>
                {label}
              </span>
              <span style={{ fontSize: "var(--fs-sm)", fontWeight: "var(--fw-medium)", color: "var(--txt-primary)", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis" }}>
                {render ? render() : value}
              </span>
            </div>
          ))}

          {/* Quick status change */}
          <div style={{ marginTop: "var(--sp-5)" }}>
            <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "var(--sp-3)" }}>
              {t("employees.allEmployees.sidePanel.changeStatus", { defaultValue: "Change Status" })}
            </div>
            <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
              {["Active", "On Leave", "Terminated"].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onStatusChange(employee.id, s)}
                  style={{
                    padding: "6px 14px", borderRadius: "var(--radius-full)",
                    border: `1px solid ${employee.status === s ? "var(--bdr-brand)" : "var(--bdr-default)"}`,
                    background: employee.status === s ? "var(--bg-primary-subtle)" : "transparent",
                    color: employee.status === s ? "var(--txt-primary-brand)" : "var(--txt-secondary)",
                    fontSize: "var(--fs-xs)", fontWeight: "var(--fw-medium)",
                    cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
                  }}
                >
                  {t(`common.employeeStatus.${s}`, { defaultValue: s })}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{
          padding: "var(--sp-4) var(--sp-6)",
          borderTop: "1px solid var(--bdr-subtle)",
          display: "flex", gap: "var(--sp-3)",
          flexShrink: 0,
        }}>
          <Link
            to={`/employees/${employee.id}`}
            className="btn btn-primary"
            style={{ flex: 1, justifyContent: "center" }}
            onClick={onClose}
          >
            {t("employees.allEmployees.sidePanel.viewFullProfile", { defaultValue: "View Full Profile" })}
          </Link>
          <Button
            variant="danger"
            onClick={() => onDelete(employee.id)}
          >
            {t("common.actions.delete", { defaultValue: "Delete" })}
          </Button>
        </div>
      </div>
    </>
  );
}
