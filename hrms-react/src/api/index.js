// One namespace per hrms-backend router, built on apiFetch().
import { apiFetch, qs } from "./client";

export const AuthAPI = {
  config: () => apiFetch("/auth/config", { auth: false }),
  login: (email, password) =>
    apiFetch("/auth/login", { method: "POST", body: { email, password }, auth: false }),
  register: ({ name, email, password }) =>
    apiFetch("/auth/register", { method: "POST", body: { name, email, password }, auth: false }),
  me: () => apiFetch("/auth/me"),
  logout: () => apiFetch("/auth/logout", { method: "POST" }),
  changePassword: (currentPassword, newPassword) =>
    apiFetch("/auth/change-password", {
      method: "POST",
      body: { currentPassword, newPassword },
    }),
  listUsers: () => apiFetch("/auth/users"),
  promoteUser: (id, role) =>
    apiFetch(`/auth/users/${id}/promote`, { method: "PATCH", body: { role } }),
};

// Large page size: filtering/sorting/paging is client-side.
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
  uploadContract: (id, file) => {
    const form = new FormData();
    form.append("contract", file);
    return apiFetch(`/employees/${id}/contract`, { method: "POST", body: form });
  },
  // label/type apply to the whole batch.
  uploadDocuments: (id, files, { label, type } = {}) => {
    const form = new FormData();
    Array.from(files).forEach((f) => form.append("documents", f));
    if (label) form.append("label", label);
    if (type) form.append("type", type);
    return apiFetch(`/employees/${id}/documents`, { method: "POST", body: form });
  },
  removeDocument: (id, docId) =>
    apiFetch(`/employees/${id}/documents/${docId}`, { method: "DELETE" }),
};

/** `assign` resolves even when some employees were skipped — callers must read `skipped`. */
export const OvertimeRequestsAPI = {
  list: (params = {}) => apiFetch(`/overtime-requests${qs(params)}`),
  create: (data) => apiFetch("/overtime-requests", { method: "POST", body: data }),
  assign: (data) => apiFetch("/overtime-requests/assign", { method: "POST", body: data }),
  review: (id, decision, reviewNote) =>
    apiFetch(`/overtime-requests/${id}/review`, {
      method: "PATCH",
      body: { decision, reviewNote },
    }),
  cancel: (id) => apiFetch(`/overtime-requests/${id}`, { method: "DELETE" }),
  balance: (params = {}) => apiFetch(`/overtime-requests/balance${qs(params)}`),
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
  /** Single-use, 60-second credential for the SSE feed — see api/notificationStream.js. */
  streamTicket: () => apiFetch("/notifications/stream-ticket"),
  // Out-of-app preferences; desktop is per-device (utils/desktopNotify.js).
  preferences: () => apiFetch("/notifications/preferences"),
  updatePreferences: (body) =>
    apiFetch("/notifications/preferences", { method: "PATCH", body }),
  // Per-device: status is asked about a specific endpoint. The response carries the VAPID public key.
  pushStatus: (endpoint) => apiFetch(`/notifications/push${qs({ endpoint })}`),
  pushSubscribe: (subscription) =>
    apiFetch("/notifications/push/subscribe", { method: "POST", body: subscription }),
  pushUnsubscribe: (endpoint) =>
    apiFetch("/notifications/push/subscribe", { method: "DELETE", body: { endpoint } }),
  // `available` says whether the server has a bot configured at all.
  telegramStatus: () => apiFetch("/notifications/telegram"),
  telegramLinkCode: () => apiFetch("/notifications/telegram/link-code", { method: "POST" }),
  telegramDisconnect: () => apiFetch("/notifications/telegram", { method: "DELETE" }),
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
  // Own payslips, approved/paid periods only.
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

export const PerformanceReviewsAPI = {
  /** Rating scale + competency keys — the frontend never hardcodes a second copy */
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
  /** Rater (self vs. manager) is inferred server-side from the caller, never accepted from the client */
  setCompetency: (cycleKey, employeeId, data) =>
    apiFetch(`/performance/reviews/${cycleKey}/${employeeId}/competencies`, { method: "PATCH", body: data }),
  /** Goal owner only, only while the cycle is Open */
  addGoal: (cycleKey, employeeId, data) =>
    apiFetch(`/performance/reviews/${cycleKey}/${employeeId}/goals`, { method: "POST", body: data }),
  updateGoal: (cycleKey, employeeId, goalId, data) =>
    apiFetch(`/performance/reviews/${cycleKey}/${employeeId}/goals/${goalId}`, { method: "PATCH", body: data }),
  /** Anyone who can view the review (self, manager, HR, admin) */
  addPeerFeedback: (cycleKey, employeeId, data) =>
    apiFetch(`/performance/reviews/${cycleKey}/${employeeId}/peer-feedback`, { method: "POST", body: data }),
  /** The employee themselves, within the appeal window */
  fileAppeal: (cycleKey, employeeId, data) =>
    apiFetch(`/performance/reviews/${cycleKey}/${employeeId}/appeal`, { method: "POST", body: data }),
  /** ADMIN/HR only, while the appeal is Pending */
  resolveAppeal: (cycleKey, employeeId, data) =>
    apiFetch(`/performance/reviews/${cycleKey}/${employeeId}/appeal`, { method: "PATCH", body: data }),
  /** ADMIN only */
  createCycle: (data) => apiFetch("/performance/cycles", { method: "POST", body: data }),
  /** ADMIN only — open/close/reopen */
  setCycleStatus: (key, status) => apiFetch(`/performance/cycles/${key}`, { method: "PATCH", body: { status } }),
  /** deptCompare is null unless the caller is ADMIN/HR — server-scoped, not client-hidden */
  analytics: (cycleKey) => apiFetch(`/performance/cycles/${cycleKey}/analytics`),
  /** ADMIN/HR only (403 for everyone else — the page treats that the same as no data).
   * compareTo is optional: omitted, standard cycles auto-resolve to their predecessor. */
  comparison: (cycleKey, compareTo) =>
    apiFetch(`/performance/cycles/${cycleKey}/comparison${qs({ compareTo })}`),
  /** Backend builds the prompt server-side from the stored review — no prompt logic on the client */
  askAI: (cycleKey, employeeId, language) =>
    apiFetch(`/performance/reviews/${cycleKey}/${employeeId}/ai-insight`, { method: "POST", body: { language } }),
};

// Product-help chat; no live data access.
export const AiAPI = {
  chat: (message, history, language) => apiFetch("/ai/chat", { method: "POST", body: { message, history, language } }),
};

// Permissions matrix — ADMIN only; can only make MANAGER stricter.
export const PermissionsAPI = {
  list: () => apiFetch("/permissions"),
  toggle: (role, capability, enabled) =>
    apiFetch(`/permissions/${role}/${capability}`, { method: "PATCH", body: { enabled } }),
};
