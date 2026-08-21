// Resource-specific helpers built on top of apiFetch(). One namespace per
// hrms-backend router (see hrms-backend/router/).
import { apiFetch, qs } from "./client";

export const AuthAPI = {
  config: () => apiFetch("/auth/config", { auth: false }),
  login: (email, password) =>
    apiFetch("/auth/login", { method: "POST", body: { email, password }, auth: false }),
  // No role field — all self-registered accounts are EMPLOYEE
  register: ({ name, email, password }) =>
    apiFetch("/auth/register", { method: "POST", body: { name, email, password }, auth: false }),
  me: () => apiFetch("/auth/me"),
  logout: () => apiFetch("/auth/logout", { method: "POST" }),
  changePassword: (currentPassword, newPassword) =>
    apiFetch("/auth/change-password", {
      method: "POST",
      body: { currentPassword, newPassword },
    }),
  // Admin-only
  listUsers: () => apiFetch("/auth/users"),
  promoteUser: (id, role) =>
    apiFetch(`/auth/users/${id}/promote`, { method: "PATCH", body: { role } }),
};

// Large page size so the existing client-side filter/sort/paginate logic in
// AllEmployees.jsx / Jobs.jsx / Candidates.jsx keeps working unchanged.
const ALL = 1000;

export const EmployeesAPI = {
  list: (params = {}) => apiFetch(`/employees${qs({ pageSize: ALL, ...params })}`),
  myProfile: () => apiFetch("/employees/me"),
  create: (data) => apiFetch("/employees", { method: "POST", body: data }),
  update: (id, data) => apiFetch(`/employees/${id}`, { method: "PUT", body: data }),
  remove: (id) => apiFetch(`/employees/${id}`, { method: "DELETE" }),
  uploadAvatar: (id, file) => {
    const form = new FormData();
    form.append("avatar", file);
    return apiFetch(`/employees/${id}/avatar`, { method: "POST", body: form });
  },
  // Task 1.4 — HR/Admin uploads a contract PDF for an employee (unlike
  // avatars, this is not self-serve — see router/employeeRouter.js).
  uploadContract: (id, file) => {
    const form = new FormData();
    form.append("contract", file);
    return apiFetch(`/employees/${id}/contract`, { method: "POST", body: form });
  },
};

export const DepartmentsAPI = {
  list: () => apiFetch("/departments"),
  create: (data) => apiFetch("/departments", { method: "POST", body: data }),
  update: (id, data) => apiFetch(`/departments/${id}`, { method: "PUT", body: data }),
  remove: (id) => apiFetch(`/departments/${id}`, { method: "DELETE" }),
};

export const JobsAPI = {
  list: (params = {}) => apiFetch(`/jobs${qs({ pageSize: ALL, ...params })}`),
  create: (data) => apiFetch("/jobs", { method: "POST", body: data }),
  update: (id, data) => apiFetch(`/jobs/${id}`, { method: "PUT", body: data }),
  remove: (id) => apiFetch(`/jobs/${id}`, { method: "DELETE" }),
};

export const CandidatesAPI = {
  list: (params = {}) => apiFetch(`/candidates${qs({ pageSize: ALL, ...params })}`),
  create: (data) => apiFetch("/candidates", { method: "POST", body: data }),
  update: (id, data) => apiFetch(`/candidates/${id}`, { method: "PUT", body: data }),
  remove: (id) => apiFetch(`/candidates/${id}`, { method: "DELETE" }),
  // Task 5.3 — HR/Admin uploads a real PDF CV/resume for a candidate
  // (mirrors EmployeesAPI.uploadContract's shape).
  uploadCv: (id, file) => {
    const form = new FormData();
    form.append("cv", file);
    return apiFetch(`/candidates/${id}/cv`, { method: "POST", body: form });
  },
};

export const HolidaysAPI = {
  list: (params = {}) => apiFetch(`/holidays${qs(params)}`),
  create: (data) => apiFetch("/holidays", { method: "POST", body: data }),
  update: (id, data) => apiFetch(`/holidays/${id}`, { method: "PUT", body: data }),
  remove: (id) => apiFetch(`/holidays/${id}`, { method: "DELETE" }),
};

export const AttendanceAPI = {
  list: (params = {}) => apiFetch(`/attendance${qs({ pageSize: ALL, ...params })}`),
  checkIn: (data) => apiFetch("/attendance/check-in", { method: "POST", body: data }),
  checkOut: (data) => apiFetch("/attendance/check-out", { method: "POST", body: data }),
  closeDay: (date) => apiFetch("/attendance/close-day", { method: "POST", body: { date } }),
};

export const NotificationsAPI = {
  list: () => apiFetch("/notifications"),
  create: (data) => apiFetch("/notifications", { method: "POST", body: data }),
  recipients: () => apiFetch("/notifications/recipients"),
  markRead: (id) => apiFetch(`/notifications/${id}/read`, { method: "PATCH" }),
  markAllRead: () => apiFetch("/notifications/read-all", { method: "PATCH" }),
  clearRead: () => apiFetch("/notifications/clear-read", { method: "DELETE" }),
  remove: (id) => apiFetch(`/notifications/${id}`, { method: "DELETE" }),
};

export const AuditLogAPI = {
  /** Any authenticated user — recent activity feed w/ precomputed title+category, no `changes` field */
  recent: (params = {}) => apiFetch(`/audit-log/recent${qs(params)}`),
  /** HR/Admin only — full log, filterable by resource/action/actorId (not resourceId) */
  list: (params = {}) => apiFetch(`/audit-log${qs(params)}`),
};

export const PromotionRequestsAPI = {
  create: (data) => apiFetch("/promotion-requests", { method: "POST", body: data }),
  list: (params = {}) => apiFetch(`/promotion-requests${qs(params)}`),
  review: (id, decision, reviewNote = "") =>
    apiFetch(`/promotion-requests/${id}/review`, {
      method: "PATCH",
      body: { decision, reviewNote },
    }),
};

export const PayrollAPI = {
  // Self-service — any authenticated user, resolved server-side to their own
  // Employee link. Only returns payslips from approved/paid periods.
  myPayslips: () => apiFetch("/payroll/my-payslips"),
  listPeriods: (params = {}) => apiFetch(`/payroll/periods${qs(params)}`),
  createPeriod: (body) => apiFetch("/payroll/periods", { method: "POST", body }),
  regenerate: (id) => apiFetch(`/payroll/periods/${id}/regenerate`, { method: "POST" }),
  listPayslips: (id) => apiFetch(`/payroll/periods/${id}/payslips`),
  setPeriodStatus: (id, status) =>
    apiFetch(`/payroll/periods/${id}/status`, { method: "PATCH", body: { status } }),
  removePeriod: (id) => apiFetch(`/payroll/periods/${id}`, { method: "DELETE" }),
  updatePayslip: (id, body) => apiFetch(`/payroll/payslips/${id}`, { method: "PATCH", body }),
  recomputeDeduction: (id) =>
    apiFetch(`/payroll/payslips/${id}/recompute-deduction`, { method: "POST" }),
  // Tasks 3.8/3.9: manual trigger for the start-of-month FX snapshot + draft
  // generation job, and a read-only preview of the live FX rate for a given
  // year/month used by the "New period" form's "Fetch live rate" button.
  generateMonthlyDraft: () => apiFetch("/payroll/generate-monthly-draft", { method: "POST" }),
  runMonthly: () => apiFetch("/payroll/run-monthly", { method: "POST" }),
  fxRatePreview: (year, month) => apiFetch(`/payroll/fx-rate/${year}/${month}`),
};

export const NoShowReviewsAPI = {
  /** HR/Admin only — list system-flagged repeated no-show reviews */
  list: (params = {}) => apiFetch(`/no-show-reviews${qs(params)}`),
  /** HR/Admin: decision = "approved" | "rejected", reviewNote optional */
  review: (id, decision, reviewNote = "") =>
    apiFetch(`/no-show-reviews/${id}/review`, {
      method: "PATCH",
      body: { decision, reviewNote },
    }),
};

export const LeaveRequestsAPI = {
  /** Own remaining/used paid-leave balance for the given year (defaults to current year) */
  balance: (params = {}) => apiFetch(`/leave-requests/balance${qs(params)}`),
  /** MANAGER (own department)/HR/ADMIN: every visible employee's per-type balance for the given year */
  balances: (params = {}) => apiFetch(`/leave-requests/balances${qs(params)}`),
  /** Employee applies for leave: { startDate, endDate, reason } */
  create: (data) => apiFetch("/leave-requests", { method: "POST", body: data }),
  /** List requests; EMPLOYEE gets only own, HR/Admin get all (optional ?status=) */
  list: (params = {}) => apiFetch(`/leave-requests${qs(params)}`),
  /** HR/Admin: decision = "approved" | "rejected", reviewNote optional */
  review: (id, decision, reviewNote = "") =>
    apiFetch(`/leave-requests/${id}/review`, {
      method: "PATCH",
      body: { decision, reviewNote },
    }),
};

export const ProfileEditRequestsAPI = {
  /** Employee submits a request: changes = { name, phone, address, age, sex } (only changed fields) */
  create: (changes) => apiFetch("/profile-edit-requests", { method: "POST", body: { changes } }),
  /** List requests; EMPLOYEE gets only own, HR/Admin get all */
  list: (params = {}) => apiFetch(`/profile-edit-requests${qs(params)}`),
  /** HR/Admin: decision = "approved" | "rejected", reviewNote optional */
  review: (id, decision, reviewNote = "") =>
    apiFetch(`/profile-edit-requests/${id}/review`, {
      method: "PATCH",
      body: { decision, reviewNote },
    }),
};

// Milestone 1 only (see PERFORMANCE_REVIEWS_API_CONTRACT.md) — core review
// loop. Competencies/goals/peer-feedback/appeals/analytics/AI-insight/cycle
// management methods get added here as their milestones land.
export const PerformanceReviewsAPI = {
  /** Rating scale + competency keys — single source of truth, see the contract's §1 note on the frontend not hardcoding a second copy */
  meta: () => apiFetch("/performance/meta"),
  /** Every cycle (2 closed + 1 open standard, plus any custom ones), effective status applied */
  cycles: () => apiFetch("/performance/cycles"),
  /** Role-scoped server-side: ADMIN/HR see everyone, MANAGER sees self + department, EMPLOYEE sees only self */
  roster: (cycleKey) => apiFetch(`/performance/cycles/${cycleKey}/roster`),
  /** One employee's review record for a cycle (shaped default if none exists yet) */
  getReview: (cycleKey, employeeId) => apiFetch(`/performance/reviews/${cycleKey}/${employeeId}`),
  /** The employee themselves, only while the cycle is Open */
  submitSelf: (cycleKey, employeeId, data) =>
    apiFetch(`/performance/reviews/${cycleKey}/${employeeId}/self`, { method: "PATCH", body: data }),
  /** That employee's MANAGER (not self), or HR for an "orphan manager", only while the cycle is Open */
  submitManager: (cycleKey, employeeId, data) =>
    apiFetch(`/performance/reviews/${cycleKey}/${employeeId}/manager`, { method: "PATCH", body: data }),
};
