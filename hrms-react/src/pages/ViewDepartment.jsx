import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate } from "react-router-dom";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { formatDate } from "../utils/format";
import { idsMatch } from "../utils/id";
import Avatar from "../components/Avatar";
import { StatusBadge, TypeBadge } from "../components/Badge";
import Button from "../components/Button";
import ProposePromotionModal from "../components/ProposePromotionModal";

function formatBudget(amount) {
  if (!amount) return "$0";
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
  return `$${amount}`;
}

/**
 * ViewDepartment — "My Department" for MANAGER and EMPLOYEE (via
 * /departments/me, see MyDepartmentRedirect.jsx) and the department-detail
 * page for HR/Admin.
 *
 * Rebuilt to match AllDepartments.jsx's roster-panel styling (this page
 * had never been touched by the Navy Signal Blue redesign — it still had
 * the pre-redesign markup/classnames and no Promote action, unlike every
 * other page in the app). Manager-assignment and budget editing stay
 * HR/Admin-only, matching AllDepartments.jsx and departmentRouter.js's
 * write gate; Promote is MANAGER+HR+ADMIN, matching
 * promotionRequestController.js (MANAGER's proposal is scoped to their own
 * department server-side, so it's safe to show here even though this page
 * itself doesn't otherwise restrict what MANAGER can see below).
 */
function ViewDepartment() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const { isHRTier, isManagerTier, isAdmin } = useAuth();
  const {
    departments, employees, removeEmployee,
    updateDepartmentBudget, updateDepartmentManager,
    getEmployeesByDepartment,
  } = useStore();

  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetValue, setBudgetValue] = useState("");
  const [promotingEmployee, setPromotingEmployee] = useState(null);

  const department = departments.find((d) => idsMatch(d.id, id));

  if (!department) {
    return (
      <div className="content-card">
        <h2>{t("employees.viewDepartment.notFoundTitle", { defaultValue: "Department Not Found" })}</h2>
        <Button variant="primary" style={{ marginTop: "var(--sp-5)" }} onClick={() => navigate(-1)}>
          ← {t("common.actions.back", { defaultValue: "Back" })}
        </Button>
      </div>
    );
  }

  const roster = getEmployeesByDepartment(department.name);
  const managerOptions = roster;

  const handleManagerChange = (e) => {
    const emp = managerOptions.find((x) => String(x.id) === e.target.value);
    updateDepartmentManager(department.id, emp ? emp.name : "");
  };

  const startEditBudget = () => {
    setBudgetValue(String(department.budget ?? 0));
    setEditingBudget(true);
  };
  const saveBudget = () => {
    updateDepartmentBudget(department.id, parseInt(budgetValue, 10) || 0);
    setEditingBudget(false);
  };

  const handleDeleteEmployee = (emp) => {
    if (!confirm(t("common.confirmDeleteEmployee", { defaultValue: "Delete {{name}}? This cannot be undone.", name: emp.name }))) return;
    removeEmployee(emp.id);
  };

  return (
    <div>
      <Button
        variant="secondary"
        style={{ marginBottom: "var(--sp-5)" }}
        onClick={() => navigate(-1)}
        leftIcon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        }
      >
        {t("common.actions.back", { defaultValue: "Back" })}
      </Button>

      <div className="content-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "var(--sp-5)", flexWrap: "wrap", gap: "var(--sp-3)" }}>
          <div>
            <div style={{ fontSize: "var(--fs-xs)", fontWeight: "var(--fw-bold)", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--txt-disabled)" }}>
              {t("employees.department.roster", { defaultValue: "Roster" })}
            </div>
            <h3 className="section-title" style={{ margin: 0 }}>{department.name}</h3>
          </div>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)" }}>
            {t("employees.department.peopleCount", { count: roster.length, defaultValue_one: "{{count}} person", defaultValue_other: "{{count}} people" })}
          </div>
        </div>

        <div style={{
          display: "flex", alignItems: "center", gap: "var(--sp-4)", flexWrap: "wrap",
          padding: "16px 0", borderBottom: "2px solid var(--bdr-default)", marginBottom: "var(--sp-4)",
        }}>
          <span style={{ fontSize: "12px", fontWeight: "var(--fw-bold)", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--txt-disabled)" }}>
            {t("employees.department.departmentManager", { defaultValue: "Department Manager" })}
          </span>
          {isHRTier ? (
            <select
              value={managerOptions.find((e) => e.name === department.manager)?.id ?? ""}
              onChange={handleManagerChange}
              style={{
                width: "240px", padding: "8px 10px", border: "1px solid var(--bdr-default)",
                background: "var(--bg-surface)", color: "var(--txt-primary)",
                fontFamily: "var(--font-family)", fontSize: "13.5px", fontWeight: "var(--fw-semibold)",
              }}
            >
              <option value="">{t("employees.department.notAssigned", { defaultValue: "Not assigned" })}</option>
              {managerOptions.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          ) : (
            <span style={{ fontSize: "13.5px", fontWeight: "var(--fw-semibold)", color: "var(--txt-primary)" }}>
              {department.manager || t("employees.department.notAssigned", { defaultValue: "Not assigned" })}
            </span>
          )}

          {/* Budget — HR/Admin only, not shown to a plain MANAGER viewing
              their own department. */}
          {isHRTier && (
            <>
              <span style={{ fontSize: "12px", fontWeight: "var(--fw-bold)", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--txt-disabled)", marginLeft: "var(--sp-4)" }}>
                {t("employees.department.budget", { defaultValue: "Budget" })}
              </span>
              {editingBudget ? (
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input
                    type="number"
                    value={budgetValue}
                    onChange={(e) => setBudgetValue(e.target.value)}
                    autoFocus
                    style={{ width: "110px", padding: "6px 8px", border: "1px solid var(--bdr-default)", fontSize: "13.5px" }}
                  />
                  <Button variant="primary" size="sm" onClick={saveBudget}>{t("common.actions.save", { defaultValue: "Save" })}</Button>
                  <Button variant="secondary" size="sm" onClick={() => setEditingBudget(false)}>{t("common.actions.cancel", { defaultValue: "Cancel" })}</Button>
                </div>
              ) : (
                <Button variant="link" onClick={startEditBudget}>
                  {formatBudget(department.budget)}
                </Button>
              )}
            </>
          )}
        </div>

        {roster.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-title">{t("employees.department.noEmployeesTitle", { defaultValue: "No employees in this department yet" })}</div>
            <div className="empty-state-description">{t("employees.department.noEmployeesDesc", { defaultValue: "Add an employee and set their department to {{name}}.", name: department.name })}</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("common.columns.employee", { defaultValue: "Employee" })}</th>
                  <th>{t("common.columns.designation", { defaultValue: "Designation" })}</th>
                  <th>{t("common.columns.email", { defaultValue: "Email" })}</th>
                  <th>{t("common.columns.joined", { defaultValue: "Joined" })}</th>
                  <th>{t("common.columns.type", { defaultValue: "Type" })}</th>
                  <th>{t("common.columns.status", { defaultValue: "Status" })}</th>
                  <th>{t("common.columns.action", { defaultValue: "Action" })}</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((emp) => (
                  <tr
                    key={emp.id}
                    className="employee-row-clickable"
                    onClick={() => navigate(`/employees/${emp.id}`)}
                  >
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <Avatar name={emp.name} src={emp.avatar} size="sm" />
                        <div>
                          <div className="employee-row-name">
                            {emp.name}{department.manager === emp.name ? t("employees.department.managerSuffix", { defaultValue: " · Manager" }) : ""}
                          </div>
                          <div style={{ fontSize: "var(--fs-2xs)", color: "var(--txt-secondary)" }}>{emp.employeeId}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ color: "var(--txt-secondary)", fontSize: "var(--fs-sm)" }}>{emp.designation}</td>
                    <td style={{ color: "var(--txt-secondary)", fontSize: "var(--fs-sm)" }}>{emp.email}</td>
                    <td style={{ color: "var(--txt-secondary)", fontSize: "var(--fs-sm)" }}>{formatDate(emp.createdAt, language)}</td>
                    <td><TypeBadge type={emp.type} /></td>
                    <td><StatusBadge status={emp.status} /></td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <Button variant="link" onClick={() => navigate(`/employees/${emp.id}`)}>{t("common.actions.view", { defaultValue: "View" })}</Button>
                      {isManagerTier && (
                        <Button variant="link" onClick={() => setPromotingEmployee(emp)}>{t("employees.allEmployees.table.promote", { defaultValue: "Promote" })}</Button>
                      )}
                      {isAdmin && (
                        <Button variant="link" className="btn-link-muted" onClick={() => handleDeleteEmployee(emp)}>{t("common.actions.delete", { defaultValue: "Delete" })}</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {promotingEmployee && (
        <ProposePromotionModal
          employee={promotingEmployee}
          employees={employees}
          departments={departments}
          onClose={() => setPromotingEmployee(null)}
          onSubmitted={() => {}}
        />
      )}
    </div>
  );
}

export default ViewDepartment;
