
/* ─────────────────────────────────
   Validation rules
───────────────────────────────── */
export const RULES = {
  name:        (v, t) => !v.trim() ? t("employees.addEmployee.errors.nameRequired", { defaultValue: "Full name is required" }) : v.trim().length < 2 ? t("employees.addEmployee.errors.nameTooShort", { defaultValue: "Name is too short" }) : "",
  age:         (v, t) => !v ? t("employees.addEmployee.errors.ageRequired", { defaultValue: "Age is required" }) : (Number(v) < 18 || Number(v) > 80) ? t("employees.addEmployee.errors.ageRange", { defaultValue: "Age must be 18–80" }) : "",
  sex:         (v, t) => !v ? t("employees.addEmployee.errors.genderRequired", { defaultValue: "Please select a gender" }) : "",
  email:       (v, t) => v && !/\S+@\S+\.\S+/.test(v) ? t("employees.addEmployee.errors.emailInvalid", { defaultValue: "Invalid email address" }) : "",
  employeeId:  (v, t) => !v.trim() ? t("employees.addEmployee.errors.employeeIdRequired", { defaultValue: "Employee ID is required" }) : !/^[A-Z]{2,4}\d{2,6}$/i.test(v.trim()) ? t("employees.addEmployee.errors.employeeIdFormat", { defaultValue: "Format: EMP001" }) : "",
  department:  (v, t) => !v ? t("employees.addEmployee.errors.departmentRequired", { defaultValue: "Please select a department" }) : "",
  designation: (v, t) => !v.trim() ? t("employees.addEmployee.errors.designationRequired", { defaultValue: "Designation is required" }) : "",
  salary:      (v, t) => !v ? t("employees.addEmployee.errors.salaryRequired", { defaultValue: "Salary is required" }) : Number(v) <= 0 ? t("employees.addEmployee.errors.salaryPositive", { defaultValue: "Salary must be greater than 0" }) : "",
};

export const STEP_FIELDS = {
  1: ["name", "age", "sex", "email"],
  2: ["employeeId", "department", "designation"],
  3: ["salary"],
};

export const ROLE_LABELS = {
  EMPLOYEE: "Employee",
  MANAGER: "HR / Manager",
  ADMIN: "Administrator",
};

export function roleLabel(t, role) {
  return t(`employees.addEmployee.roleLabels.${role}`, { defaultValue: ROLE_LABELS[role] });
}

export function deriveLoginEmail(email, employeeId, domain) {
  const supplied = (email || "").trim();
  if (supplied) return supplied.toLowerCase();
  const code = (employeeId || "").trim();
  if (!code) return "";
  return `${code.toLowerCase()}@${(domain || "hrms.com").toLowerCase()}`;
}

export function validateField(name, value, t) {
  return RULES[name] ? RULES[name](value, t) : "";
}

export function validateStep(stepId, data, t) {
  const errs = {};
  (STEP_FIELDS[stepId] || []).forEach((f) => {
    const e = validateField(f, data[f], t);
    if (e) errs[f] = e;
  });
  return errs;
}
