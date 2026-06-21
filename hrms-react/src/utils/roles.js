/**
 * roles.js — display-friendly labels for backend role values.
 *
 * The backend (hrms-backend/model/User.js) stores roles as ADMIN / MANAGER / EMPLOYEE.
 * The rest of the app's vocabulary (Register.jsx's role selector, general copy) uses
 * Administrator / HR / Employee. This bridges the two for display purposes only —
 * it never changes what's sent to/received from the API.
 */

export const ROLE_LABELS = {
  ADMIN: "Administrator",
  MANAGER: "HR",
  EMPLOYEE: "Employee",
};

export function getRoleLabel(role) {
  return ROLE_LABELS[role] ?? role ?? "Employee";
}
