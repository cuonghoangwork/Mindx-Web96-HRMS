/**
 * roles.js — display-friendly labels for backend role values.
 *
 * The backend (hrms-backend/model/User.js) stores roles as
 * ADMIN / HR / MANAGER / EMPLOYEE. This bridges to display copy only — it
 * never changes what's sent to/received from the API.
 */

export const ROLE_LABELS = {
  ADMIN: "Administrator",
  HR: "HR",
  MANAGER: "Manager",
  EMPLOYEE: "Employee",
};

export function getRoleLabel(role, t) {
  const fallback = ROLE_LABELS[role] ?? role ?? "Employee";
  return t ? t(`common.roles.${role}`, { defaultValue: fallback }) : fallback;
}
