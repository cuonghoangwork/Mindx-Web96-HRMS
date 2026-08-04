import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { idsMatch } from "../utils/id";
import { useAuth } from "./AuthContext";
import {
  EmployeesAPI,
  DepartmentsAPI,
  JobsAPI,
  CandidatesAPI,
  HolidaysAPI,
  AttendanceAPI,
  NotificationsAPI,
} from "../api";

const StoreContext = createContext(null);

/* ─── Helper: upsert an attendance record returned by the API into local state ─── */
function upsertAttendanceRecord(prev, record) {
  // Match by _id first (API records always have one)
  if (record.id) {
    const idx = prev.findIndex((r) => r.id && idsMatch(r.id, record.id));
    if (idx >= 0) {
      const next = [...prev];
      next[idx] = record;
      return next;
    }
  }
  // Fall back to employeeId + date (catches mock-generated rows without ids)
  const idx = prev.findIndex(
    (r) => idsMatch(r.employeeId, record.employeeId) && r.date === record.date,
  );
  if (idx >= 0) {
    const next = [...prev];
    next[idx] = record;
    return next;
  }
  return [...prev, record];
}

export function StoreProvider({ children }) {
  const { isAuthenticated, mustChangePassword } = useAuth();

  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loadingStore, setLoadingStore] = useState(true);
  const [storeError, setStoreError] = useState(null);
  const [toast, setToast] = useState(null); // { type: "error"|"success", message } | null

  const showToast = useCallback((type, message) => {
    setToast({ type, message });
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);

  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [modals, setModals] = useState({
    employee: false,
    filter: false,
    job: false,
    holiday: false,
  });
  const [filters, setFilters] = useState({
    department: "",
    search: "",
    type: "all",
  });

  const [activePage, setActivePage] = useState("Dashboard");
  const [clockOffset, setClockOffset] = useState(0);

  const getAppNow = useCallback(
    () => new Date(Date.now() + clockOffset),
    [clockOffset],
  );
  const setAppDateTime = useCallback((date) => {
    setClockOffset(date.getTime() - Date.now());
  }, []);
  const resetAppDateTime = useCallback(() => setClockOffset(0), []);
  const isClockAdjusted = clockOffset !== 0;

  /* ── Initial load from the backend, once signed in ── */
  const refreshAll = useCallback(async () => {
    setLoadingStore(true);
    setStoreError(null);
    try {
      const [emp, dept, job, cand, hol, att, notif] = await Promise.all([
        EmployeesAPI.list(),
        DepartmentsAPI.list(),
        JobsAPI.list(),
        CandidatesAPI.list(),
        HolidaysAPI.list(),
        AttendanceAPI.list(),
        NotificationsAPI.list(),
      ]);
      setEmployees(emp.items || []);
      setDepartments(dept.items || []);
      setJobs(job.items || []);
      setCandidates(cand.items || []);
      setHolidays(hol.items || []);
      setAttendance(att.items || []);
      setNotifications(notif.items || []);
    } catch (err) {
      setStoreError(err.message || "Failed to load data from the backend.");
    } finally {
      setLoadingStore(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && !mustChangePassword) {
      refreshAll();
    } else {
      setEmployees([]);
      setDepartments([]);
      setJobs([]);
      setCandidates([]);
      setHolidays([]);
      setAttendance([]);
      setNotifications([]);
      setStoreError(null);
      setLoadingStore(false);
    }
  }, [isAuthenticated, mustChangePassword, refreshAll]);

  /* ── Employee actions ── */
  const addEmployee = useCallback(async (employee) => {
    const res = await EmployeesAPI.create(employee);
    setEmployees((prev) => [...prev, res.data]);
    return res;
  }, []);

  const removeEmployee = useCallback(async (id) => {
    await EmployeesAPI.remove(id);
    setEmployees((prev) => prev.filter((emp) => !idsMatch(emp.id, id)));
  }, []);

  const updateEmployee = useCallback(async (id, updates) => {
    const res = await EmployeesAPI.update(id, updates);
    setEmployees((prev) =>
      prev.map((emp) => (idsMatch(emp.id, id) ? res.data : emp)),
    );
  }, []);

  const uploadEmployeeAvatar = useCallback(async (id, file) => {
    const res = await EmployeesAPI.uploadAvatar(id, file);
    setEmployees((prev) =>
      prev.map((emp) => (idsMatch(emp.id, id) ? res.data : emp)),
    );
    return res.data;
  }, []);

  // Task 1.4 — HR/Admin uploads a contract PDF for an employee.
  const uploadEmployeeContract = useCallback(async (id, file) => {
    const res = await EmployeesAPI.uploadContract(id, file);
    setEmployees((prev) =>
      prev.map((emp) => (idsMatch(emp.id, id) ? res.data : emp)),
    );
    return res.data;
  }, []);

  const selectEmployee = useCallback((employee) => {
    setSelectedEmployee(employee);
  }, []);

  /* ── Modal actions ── */
  const openModal = useCallback((modalName) => {
    setModals((prev) => ({ ...prev, [modalName]: true }));
  }, []);
  const closeModal = useCallback((modalName) => {
    setModals((prev) => ({ ...prev, [modalName]: false }));
  }, []);
  const closeAllModals = useCallback(() => {
    setModals({ employee: false, filter: false, job: false, holiday: false });
  }, []);

  /* ── Filter actions ── */
  const setSearchFilter = useCallback((search) => {
    setFilters((prev) => ({ ...prev, search }));
  }, []);
  const setDepartmentFilter = useCallback((department) => {
    setFilters((prev) => ({ ...prev, department }));
  }, []);
  const setTypeFilter = useCallback((type) => {
    setFilters((prev) => ({ ...prev, type }));
  }, []);
  const clearFilters = useCallback(() => {
    setFilters({ department: "", search: "", type: "all" });
  }, []);

  /* ── Department actions ── */
  const updateDepartmentBudget = useCallback(async (id, newBudget) => {
    const res = await DepartmentsAPI.update(id, { budget: newBudget });
    setDepartments((prev) =>
      prev.map((dept) => (idsMatch(dept.id, id) ? res.data : dept)),
    );
  }, []);

  const addDepartment = useCallback(async (department) => {
    const res = await DepartmentsAPI.create(department);
    setDepartments((prev) => [...prev, res.data]);
    return res.data;
  }, []);

  const getEmployeesByDepartment = useCallback(
    (departmentName) =>
      employees.filter((emp) => emp.department === departmentName),
    [employees],
  );
  const getEmployeeCountByDepartment = useCallback(
    (departmentName) => getEmployeesByDepartment(departmentName).length,
    [getEmployeesByDepartment],
  );
  const getTotalSalaryByDepartment = useCallback(
    (departmentName) =>
      getEmployeesByDepartment(departmentName).reduce(
        (sum, emp) => sum + (emp.salary || 0),
        0,
      ),
    [getEmployeesByDepartment],
  );

  /* ── Job actions ── */
  const addJob = useCallback(async (job) => {
    const res = await JobsAPI.create(job);
    setJobs((prev) => [...prev, res.data]);
    return res.data;
  }, []);
  const updateJob = useCallback(async (id, updates) => {
    const res = await JobsAPI.update(id, updates);
    setJobs((prev) => prev.map((j) => (idsMatch(j.id, id) ? res.data : j)));
  }, []);
  const removeJob = useCallback(async (id) => {
    await JobsAPI.remove(id);
    setJobs((prev) => prev.filter((j) => !idsMatch(j.id, id)));
  }, []);

  /* ── Candidate actions ── */
  const addCandidate = useCallback(async (candidate) => {
    const res = await CandidatesAPI.create(candidate);
    setCandidates((prev) => [...prev, res.data]);
    return res.data;
  }, []);
  const updateCandidate = useCallback(async (id, updates) => {
    const res = await CandidatesAPI.update(id, updates);
    setCandidates((prev) => prev.map((c) => (idsMatch(c.id, id) ? res.data : c)));
  }, []);
  const removeCandidate = useCallback(async (id) => {
    await CandidatesAPI.remove(id);
    setCandidates((prev) => prev.filter((c) => !idsMatch(c.id, id)));
  }, []);

  const getCandidatesByJob = useCallback(
    (jobId) => candidates.filter((c) => idsMatch(c.jobId, jobId)),
    [candidates],
  );
  const getApplicantCount = useCallback(
    (jobId) => getCandidatesByJob(jobId).length,
    [getCandidatesByJob],
  );
  const getJobById = useCallback(
    (jobId) => jobs.find((j) => idsMatch(j.id, jobId)),
    [jobs],
  );

  /* ── Holiday actions ── */
  const addHoliday = useCallback(async (holiday) => {
    const res = await HolidaysAPI.create(holiday);
    setHolidays((prev) => [...prev, res.data]);
    return res.data;
  }, []);
  const updateHoliday = useCallback(async (id, updates) => {
    const res = await HolidaysAPI.update(id, updates);
    setHolidays((prev) => prev.map((h) => (idsMatch(h.id, id) ? res.data : h)));
  }, []);
  const removeHoliday = useCallback(async (id) => {
    await HolidaysAPI.remove(id);
    setHolidays((prev) => prev.filter((h) => !idsMatch(h.id, id)));
  }, []);

  /* ── Attendance actions ── */

  /**
   * clockIn — records a check-in for the given employee on the given date.
   * Sends the current app-clock time so it respects the demo clock (HeaderDateTime).
   *
   * @param {string} employeeId  MongoDB ObjectId of the employee
   * @param {string} date        "YYYY-MM-DD"
   * @param {string} checkInTime "HH:MM" — derived from getAppNow() by the caller
   */
  const clockIn = useCallback(async (employeeId, date, checkInTime) => {
    const res = await AttendanceAPI.checkIn({ employeeId, date, checkIn: checkInTime });
    setAttendance((prev) => upsertAttendanceRecord(prev, res.data));
    return res.data;
  }, []);

  /**
   * clockOut — records a check-out for an employee who has already clocked in.
   *
   * @param {string} employeeId   MongoDB ObjectId of the employee
   * @param {string} date         "YYYY-MM-DD"
   * @param {string} checkOutTime "HH:MM"
   */
  const clockOut = useCallback(async (employeeId, date, checkOutTime) => {
    const res = await AttendanceAPI.checkOut({ employeeId, date, checkOut: checkOutTime });
    setAttendance((prev) => upsertAttendanceRecord(prev, res.data));
    return res.data;
  }, []);

  /* ── Notification actions (optimistic, backed by the API) ── */
  const markNotificationRead = useCallback(async (id) => {
    setNotifications((prev) =>
      prev.map((n) => (idsMatch(n.id, id) ? { ...n, read: true } : n)),
    );
    try {
      await NotificationsAPI.markRead(id);
    } catch (err) {
      showToast("error", err.message || "Failed to mark notification as read.");
    }
  }, [showToast]);

  const markAllNotificationsRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await NotificationsAPI.markAllRead();
    } catch (err) {
      showToast("error", err.message || "Failed to mark all notifications as read.");
    }
  }, [showToast]);

  const removeNotification = useCallback(async (id) => {
    setNotifications((prev) => prev.filter((n) => !idsMatch(n.id, id)));
    try {
      await NotificationsAPI.remove(id);
    } catch (err) {
      showToast("error", err.message || "Failed to dismiss notification.");
    }
  }, [showToast]);

  const clearReadNotifications = useCallback(async () => {
    setNotifications((prev) => prev.filter((n) => !n.read));
    try {
      await NotificationsAPI.clearRead();
    } catch (err) {
      showToast("error", err.message || "Failed to clear read notifications.");
    }
  }, [showToast]);

  // HR/Admin: compose and send a custom notice. Doesn't optimistically add to local
  // state for targeted sends (the recipient isn't necessarily "me"), but does for
  // broadcasts the sender themself would also see.
  const sendNotification = useCallback(async (payload) => {
    const res = await NotificationsAPI.create(payload);
    const isBroadcastToSelf =
      !payload.recipientId && (!payload.recipientIds || payload.recipientIds.length === 0);
    if (isBroadcastToSelf && res.data) {
      setNotifications((prev) => [res.data, ...prev]);
    }
    return res.data;
  }, []);

  const unreadNotificationCount = notifications.filter((n) => !n.read).length;

  const value = {
    // State
    employees,
    jobs,
    candidates,
    holidays,
    notifications,
    unreadNotificationCount,
    selectedEmployee,
    modals,
    filters,
    activePage,
    departments,
    attendance,
    clockOffset,
    isClockAdjusted,
    loadingStore,
    storeError,
    toast,
    dismissToast,
    getAppNow,
    setAppDateTime,
    resetAppDateTime,
    refreshAll,

    // Actions
    addEmployee,
    removeEmployee,
    updateEmployee,
    uploadEmployeeAvatar,
    uploadEmployeeContract,
    selectEmployee,
    openModal,
    closeModal,
    closeAllModals,
    setSearchFilter,
    setDepartmentFilter,
    setTypeFilter,
    clearFilters,
    setActivePage,
    setDepartments,
    updateDepartmentBudget,
    addDepartment,
    getEmployeesByDepartment,
    getEmployeeCountByDepartment,
    getTotalSalaryByDepartment,
    setAttendance,
    clockIn,
    clockOut,
    addJob,
    updateJob,
    removeJob,
    addCandidate,
    updateCandidate,
    removeCandidate,
    getCandidatesByJob,
    getApplicantCount,
    getJobById,
    addHoliday,
    updateHoliday,
    removeHoliday,
    markNotificationRead,
    markAllNotificationsRead,
    removeNotification,
    clearReadNotifications,
    sendNotification,
  };

  return (
    <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
  );
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error("useStore must be used within a StoreProvider");
  }
  return context;
}
