import { useState, useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { idsMatch } from "../../utils/id";
import { translateApiError } from "../../utils/apiError";
import { useAuth } from "../AuthContext";
import {
  EmployeesAPI,
  DepartmentsAPI,
  JobsAPI,
  CandidatesAPI,
  HolidaysAPI,
  AttendanceAPI,
  OvertimeRequestsAPI,
} from "../../api";
import { setDemoClockOffset } from "../../api/client";
import { StoreContext } from "../StoreContext";

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
  const { t } = useTranslation();
  const { isAuthenticated, mustChangePassword } = useAuth();

  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [loadingStore, setLoadingStore] = useState(true);
  const [storeError, setStoreError] = useState(null);
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
  const [overtimeRequests, setOvertimeRequests] = useState([]);
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

  // Push the offset down to the API client so requests carry X-App-Now while
  // the clock is moved. Server-side rules (the 13:00 overtime cutoff) run
  // against server time, so without this the demo clock would move only what
  // the browser renders and none of what the backend decides.
  useEffect(() => {
    setDemoClockOffset(clockOffset);
  }, [clockOffset]);

  /* ── Initial load from the backend, once signed in ── */
  const refreshAll = useCallback(async () => {
    setLoadingStore(true);
    setStoreError(null);
    try {
      const [emp, dept, job, cand, hol, att, ot] = await Promise.all([
        EmployeesAPI.list(),
        DepartmentsAPI.list(),
        JobsAPI.list(),
        CandidatesAPI.list(),
        HolidaysAPI.list(),
        AttendanceAPI.list(),
        OvertimeRequestsAPI.list(),
      ]);
      setEmployees(emp.items || []);
      setDepartments(dept.items || []);
      setJobs(job.items || []);
      setCandidates(cand.items || []);
      setHolidays(hol.items || []);
      setAttendance(att.items || []);
      // Role-scoped server-side: an employee gets only their own rows.
      setOvertimeRequests(ot.items || []);
    } catch (err) {
      setStoreError(translateApiError(err, t) || "Failed to load data from the backend.");
    } finally {
      setLoadingStore(false);
    }
  }, [t]);

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
      setOvertimeRequests([]);
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

  // Solo Gaps Milestone 1 — arbitrary multi-document upload/removal.
  const uploadEmployeeDocuments = useCallback(async (id, files, options) => {
    const res = await EmployeesAPI.uploadDocuments(id, files, options);
    setEmployees((prev) =>
      prev.map((emp) => (idsMatch(emp.id, id) ? res.data : emp)),
    );
    return res.data;
  }, []);

  const removeEmployeeDocument = useCallback(async (id, docId) => {
    const res = await EmployeesAPI.removeDocument(id, docId);
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

  // Backend's manager field is resolved server-side from a plain name
  // string (case-insensitive match against Employee.name — see
  // utils/refResolvers.js), not an employeeId, so this takes/sends the
  // manager's display name even though the caller is picking from a
  // dropdown of employee objects.
  const updateDepartmentManager = useCallback(async (id, managerName) => {
    const res = await DepartmentsAPI.update(id, { manager: managerName ?? "" });
    setDepartments((prev) =>
      prev.map((dept) => (idsMatch(dept.id, id) ? res.data : dept)),
    );
  }, []);

  const addDepartment = useCallback(async (department) => {
    const res = await DepartmentsAPI.create(department);
    setDepartments((prev) => [...prev, res.data]);
    return res.data;
  }, []);

  const removeDepartment = useCallback(async (id) => {
    await DepartmentsAPI.remove(id);
    setDepartments((prev) => prev.filter((dept) => !idsMatch(dept.id, id)));
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
  // Task 5.3 — HR/Admin uploads a real PDF CV/resume for a candidate.
  const uploadCandidateCv = useCallback(async (id, file) => {
    const res = await CandidatesAPI.uploadCv(id, file);
    setCandidates((prev) => prev.map((c) => (idsMatch(c.id, id) ? res.data : c)));
    return res.data;
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

  /* ── Overtime actions (Attendance Overtime, M4) ── */

  const refreshOvertimeRequests = useCallback(async (params = {}) => {
    const res = await OvertimeRequestsAPI.list(params);
    setOvertimeRequests(res.items ?? []);
    return res.items ?? [];
  }, []);

  const applyOvertime = useCallback(async (data) => {
    const res = await OvertimeRequestsAPI.create(data);
    setOvertimeRequests((prev) => [res.data, ...prev]);
    return res.data;
  }, []);

  /**
   * Returns { created, skipped } rather than throwing on a partial failure:
   * the endpoint validates each employee independently, and the caller needs to
   * show exactly who was left out and why.
   */
  const assignOvertime = useCallback(async (data) => {
    const res = await OvertimeRequestsAPI.assign(data);
    if (res.created?.length) setOvertimeRequests((prev) => [...res.created, ...prev]);
    return { created: res.created ?? [], skipped: res.skipped ?? [] };
  }, []);

  const reviewOvertime = useCallback(async (id, decision, reviewNote) => {
    const res = await OvertimeRequestsAPI.review(id, decision, reviewNote);
    setOvertimeRequests((prev) => prev.map((r) => (idsMatch(r.id, id) ? res.data : r)));
    return res.data;
  }, []);

  /** Withdrawn requests are deleted server-side, so drop the row entirely. */
  const cancelOvertime = useCallback(async (id) => {
    await OvertimeRequestsAPI.cancel(id);
    setOvertimeRequests((prev) => prev.filter((r) => !idsMatch(r.id, id)));
  }, []);

  const fetchOvertimeBalance = useCallback(async (params = {}) => {
    const res = await OvertimeRequestsAPI.balance(params);
    return res.data;
  }, []);

  const value = useMemo(
    () => ({
    // State
    employees,
    jobs,
    candidates,
    holidays,
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
    uploadEmployeeDocuments,
    removeEmployeeDocument,
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
    updateDepartmentManager,
    addDepartment,
    removeDepartment,
    getEmployeesByDepartment,
    getEmployeeCountByDepartment,
    getTotalSalaryByDepartment,
    setAttendance,
    clockIn,
    clockOut,
    overtimeRequests,
    refreshOvertimeRequests,
    applyOvertime,
    assignOvertime,
    reviewOvertime,
    cancelOvertime,
    fetchOvertimeBalance,
    addJob,
    updateJob,
    removeJob,
    addCandidate,
    updateCandidate,
    uploadCandidateCv,
    removeCandidate,
    getCandidatesByJob,
    getApplicantCount,
    getJobById,
    addHoliday,
    updateHoliday,
    removeHoliday,
      }),
    // Dependency list computed by react-hooks/exhaustive-deps, not by hand.
    // The rule is enabled at "warn" and npm run lint runs --max-warnings 0, so
    // this array cannot silently drift out of date: add a field to the value
    // above without listing it here and the build fails.
    //
    // Scope note: this stops the value's identity changing when StoreProvider
    // re-renders for a reason unrelated to its own state (an auth flag
    // flipping, a parent re-render).
    //
    // The notification cascade it used to be unable to help with is now gone
    // for a different reason: notifications no longer live here at all. They
    // moved to NotificationProvider, so an arriving notification changes that
    // context and leaves this one's value identical.
    [
      activePage,
      addCandidate,
      addDepartment,
      addEmployee,
      addHoliday,
      addJob,
      applyOvertime,
      assignOvertime,
      attendance,
      cancelOvertime,
      candidates,
      clearFilters,
      clockIn,
      clockOffset,
      clockOut,
      closeAllModals,
      closeModal,
      departments,
      employees,
      fetchOvertimeBalance,
      filters,
      getAppNow,
      getApplicantCount,
      getCandidatesByJob,
      getEmployeeCountByDepartment,
      getEmployeesByDepartment,
      getJobById,
      getTotalSalaryByDepartment,
      holidays,
      isClockAdjusted,
      jobs,
      loadingStore,
      modals,
      openModal,
      overtimeRequests,
      refreshAll,
      refreshOvertimeRequests,
      removeCandidate,
      removeDepartment,
      removeEmployee,
      removeEmployeeDocument,
      removeHoliday,
      removeJob,
      resetAppDateTime,
      reviewOvertime,
      selectEmployee,
      selectedEmployee,
      setAppDateTime,
      setDepartmentFilter,
      setSearchFilter,
      setTypeFilter,
      storeError,
      updateCandidate,
      updateDepartmentBudget,
      updateDepartmentManager,
      updateEmployee,
      updateHoliday,
      updateJob,
      uploadCandidateCv,
      uploadEmployeeAvatar,
      uploadEmployeeContract,
      uploadEmployeeDocuments,
    ],
  );

  return (
    <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
  );
}

