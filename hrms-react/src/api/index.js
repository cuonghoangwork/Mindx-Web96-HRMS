// Resource-specific helpers built on top of apiFetch(). One namespace per
// hrms-backend router (see hr-management-system/hrms-backend/router/).
import { apiFetch, qs } from "./client";

export const AuthAPI = {
  login: (email, password) =>
    apiFetch("/auth/login", { method: "POST", body: { email, password }, auth: false }),
  register: (payload) =>
    apiFetch("/auth/register", { method: "POST", body: payload, auth: false }),
  me: () => apiFetch("/auth/me"),
  logout: () => apiFetch("/auth/logout", { method: "POST" }),
};

// Large page size so the existing client-side filter/sort/paginate logic in
// AllEmployees.jsx / Jobs.jsx / Candidates.jsx keeps working unchanged.
const ALL = 1000;

export const EmployeesAPI = {
  list: (params = {}) => apiFetch(`/employees${qs({ pageSize: ALL, ...params })}`),
  create: (data) => apiFetch("/employees", { method: "POST", body: data }),
  update: (id, data) => apiFetch(`/employees/${id}`, { method: "PUT", body: data }),
  remove: (id) => apiFetch(`/employees/${id}`, { method: "DELETE" }),
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
};

export const HolidaysAPI = {
  list: (params = {}) => apiFetch(`/holidays${qs(params)}`),
  create: (data) => apiFetch("/holidays", { method: "POST", body: data }),
  update: (id, data) => apiFetch(`/holidays/${id}`, { method: "PUT", body: data }),
  remove: (id) => apiFetch(`/holidays/${id}`, { method: "DELETE" }),
};

export const AttendanceAPI = {
  list: (params = {}) => apiFetch(`/attendance${qs({ pageSize: ALL, ...params })}`),
};

export const NotificationsAPI = {
  list: () => apiFetch("/notifications"),
  markRead: (id) => apiFetch(`/notifications/${id}/read`, { method: "PATCH" }),
  markAllRead: () => apiFetch("/notifications/read-all", { method: "PATCH" }),
  clearRead: () => apiFetch("/notifications/clear-read", { method: "DELETE" }),
  remove: (id) => apiFetch(`/notifications/${id}`, { method: "DELETE" }),
};
