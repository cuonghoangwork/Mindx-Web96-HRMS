import { createContext, useContext, useState, useCallback } from "react";
import { generateId, idsMatch } from "../utils/id";

const StoreContext = createContext(null);

// Initial mock data for employees with createdAt for new hires tracking
const initialEmployees = [
  {
    id: 1,
    name: "John Doe",
    employeeId: "EMP001",
    department: "Engineering",
    designation: "Software Engineer",
    type: "Full-time",
    status: "Active",
    age: 28,
    sex: "Male",
    address: "123 Main St, New York, NY 10001",
    salary: 85000,
    createdAt: "2026-01-01",
  },
  {
    id: 2,
    name: "Jane Smith",
    employeeId: "EMP002",
    department: "Design",
    designation: "UI Designer",
    type: "Full-time",
    status: "Active",
    age: 32,
    sex: "Female",
    address: "456 Oak Ave, Los Angeles, CA 90001",
    salary: 75000,
    createdAt: "2026-01-02",
  },
  {
    id: 3,
    name: "Bob Johnson",
    employeeId: "EMP003",
    department: "Marketing",
    designation: "Marketing Manager",
    type: "Full-time",
    status: "On Leave",
    age: 45,
    sex: "Male",
    address: "789 Pine Rd, Chicago, IL 60601",
    salary: 95000,
    createdAt: "2026-01-03",
  },
  {
    id: 4,
    name: "Alice Brown",
    employeeId: "EMP004",
    department: "Finance",
    designation: "HR Specialist",
    type: "Part-time",
    status: "Active",
    age: 29,
    sex: "Female",
    address: "321 Elm St, Houston, TX 77001",
    salary: 45000,
    createdAt: "2026-01-05",
  },
  {
    id: 5,
    name: "Mike Wilson",
    employeeId: "EMP005",
    department: "Sales",
    designation: "Sales Manager",
    type: "Contract",
    status: "Active",
    age: 38,
    sex: "Male",
    address: "654 Maple Dr, Phoenix, AZ 85001",
    salary: 80000,
    createdAt: "2026-01-08",
  },
  {
    id: 6,
    name: "Sarah Lee",
    employeeId: "EMP006",
    department: "IT",
    designation: "DevOps Engineer",
    type: "Part-time",
    status: "Active",
    age: 26,
    sex: "Female",
    address: "987 Cedar Ln, Seattle, WA 98101",
    salary: 55000,
    createdAt: "2026-01-10",
  },
  {
    id: 7,
    name: "Tom Davis",
    employeeId: "EMP007",
    department: "Management",
    designation: "Product Manager",
    type: "Full-time",
    status: "Active",
    age: 42,
    sex: "Male",
    address: "147 Birch Blvd, Boston, MA 02101",
    salary: 110000,
    createdAt: "2026-01-12",
  },
  {
    id: 8,
    name: "Lisa Chen",
    employeeId: "EMP008",
    department: "Design",
    designation: "UX Designer",
    type: "Contract",
    status: "On Leave",
    age: 31,
    sex: "Female",
    address: "258 Spruce Way, San Francisco, CA 94102",
    salary: 90000,
    createdAt: "2026-01-15",
  },
];

// Attendance records for today (demo data)
const initialAttendance = [
  {
    employeeId: 1,
    date: "2026-01-15",
    checkIn: "09:00",
    checkOut: "18:00",
    status: "Present",
  },
  {
    employeeId: 2,
    date: "2026-01-15",
    checkIn: "09:15",
    checkOut: "18:30",
    status: "Present",
  },
  {
    employeeId: 3,
    date: "2026-01-15",
    checkIn: null,
    checkOut: null,
    status: "On Leave",
  },
  {
    employeeId: 4,
    date: "2026-01-15",
    checkIn: "08:45",
    checkOut: "17:30",
    status: "Present",
  },
  {
    employeeId: 5,
    date: "2026-01-15",
    checkIn: "09:30",
    checkOut: null,
    status: "Present",
  },
  {
    employeeId: 6,
    date: "2026-01-15",
    checkIn: "09:45",
    checkOut: "18:00",
    status: "Present",
  },
  {
    employeeId: 7,
    date: "2026-01-15",
    checkIn: "08:30",
    checkOut: "17:00",
    status: "Present",
  },
  {
    employeeId: 8,
    date: "2026-01-15",
    checkIn: null,
    checkOut: null,
    status: "On Leave",
  },
];

// Job openings (recruitment)
const initialJobs = [
  {
    id: 1,
    title: "Senior Software Engineer",
    department: "Engineering",
    location: "Remote",
    type: "Full-time",
    status: "Open",
    postedDate: "2026-04-02",
  },
  {
    id: 2,
    title: "UI/UX Designer",
    department: "Design",
    location: "New York",
    type: "Full-time",
    status: "Open",
    postedDate: "2026-04-10",
  },
  {
    id: 3,
    title: "Product Manager",
    department: "Management",
    location: "San Francisco",
    type: "Full-time",
    status: "Filled",
    postedDate: "2026-02-18",
  },
  {
    id: 4,
    title: "DevOps Engineer",
    department: "IT",
    location: "Remote",
    type: "Contract",
    status: "Open",
    postedDate: "2026-05-01",
  },
  {
    id: 5,
    title: "Marketing Intern",
    department: "Marketing",
    location: "Hanoi",
    type: "Intern",
    status: "Open",
    postedDate: "2026-05-20",
  },
  {
    id: 6,
    title: "Sales Associate",
    department: "Sales",
    location: "Ho Chi Minh City",
    type: "Full-time",
    status: "Closed",
    postedDate: "2026-01-05",
  },
];

// Hiring pipeline candidates, linked to jobs via jobId
const initialCandidates = [
  {
    id: 1,
    name: "Mike Wilson",
    jobId: 1,
    stage: "Interview",
    rating: 4.5,
    email: "mike.wilson@example.com",
    phone: "+84 90 123 4567",
    appliedDate: "2026-04-12",
    resumeUrl: "#",
    notes: "Strong backend experience, available to start immediately.",
  },
  {
    id: 2,
    name: "Sarah Lee",
    jobId: 2,
    stage: "Screening",
    rating: 4.0,
    email: "sarah.lee@example.com",
    phone: "+84 91 234 5678",
    appliedDate: "2026-04-18",
    resumeUrl: "#",
    notes: "Great portfolio, needs a follow-up call on availability.",
  },
  {
    id: 3,
    name: "Tom Brown",
    jobId: 4,
    stage: "Offer",
    rating: 4.8,
    email: "tom.brown@example.com",
    phone: "+84 92 345 6789",
    appliedDate: "2026-05-03",
    resumeUrl: "#",
    notes: "Offer extended, awaiting response by end of week.",
  },
  {
    id: 4,
    name: "Emily Davis",
    jobId: 1,
    stage: "Applied",
    rating: 3.8,
    email: "emily.davis@example.com",
    phone: "+84 93 456 7890",
    appliedDate: "2026-05-10",
    resumeUrl: "#",
    notes: "",
  },
  {
    id: 5,
    name: "James Nguyen",
    jobId: 5,
    stage: "Hired",
    rating: 4.2,
    email: "james.nguyen@example.com",
    phone: "+84 94 567 8901",
    appliedDate: "2026-03-20",
    resumeUrl: "#",
    notes: "Accepted offer, starts June 2026.",
  },
  {
    id: 6,
    name: "Olivia Tran",
    jobId: 6,
    stage: "Rejected",
    rating: 3.2,
    email: "olivia.tran@example.com",
    phone: "+84 95 678 9012",
    appliedDate: "2026-02-28",
    resumeUrl: "#",
    notes: "Not enough relevant experience for the role.",
  },
  {
    id: 7,
    name: "Daniel Pham",
    jobId: 2,
    stage: "Interview",
    rating: 4.1,
    email: "daniel.pham@example.com",
    phone: "+84 96 789 0123",
    appliedDate: "2026-05-15",
    resumeUrl: "#",
    notes: "Second-round interview scheduled for next week.",
  },
];

// Notifications feed
const initialNotifications = [
  {
    id: 1,
    category: "leave",
    title: "New leave request",
    message: "John Doe requested 3 days off",
    timestamp: "2026-06-12T10:30:00",
    read: false,
  },
  {
    id: 2,
    category: "interview",
    title: "Interview scheduled",
    message: "Candidate interview for Design role",
    timestamp: "2026-06-12T07:00:00",
    read: false,
  },
  {
    id: 3,
    category: "payroll",
    title: "Payroll processed",
    message: "May payroll has been processed",
    timestamp: "2026-06-11T09:00:00",
    read: false,
  },
  {
    id: 4,
    category: "employee",
    title: "New employee added",
    message: "Sarah Smith has joined the team",
    timestamp: "2026-06-10T14:15:00",
    read: true,
  },
  {
    id: 5,
    category: "holiday",
    title: "Upcoming holiday",
    message: "Company Anniversary is coming up on Jun 15",
    timestamp: "2026-06-09T08:00:00",
    read: true,
  },
  {
    id: 6,
    category: "system",
    title: "System maintenance",
    message: "Scheduled maintenance this weekend from 11 PM to 2 AM",
    timestamp: "2026-06-08T16:45:00",
    read: true,
  },
  {
    id: 7,
    category: "interview",
    title: "Offer accepted",
    message: "James Nguyen accepted the Marketing Intern offer",
    timestamp: "2026-06-07T11:20:00",
    read: true,
  },
];

export function StoreProvider({ children }) {
  const [employees, setEmployees] = useState(initialEmployees);
  const [jobs, setJobs] = useState(initialJobs);
  const [candidates, setCandidates] = useState(initialCandidates);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [modals, setModals] = useState({
    employee: false,
    filter: false,
    job: false,
    holiday: false,
  });
  const [attendance, setAttendance] = useState(initialAttendance);
  const [filters, setFilters] = useState({
    department: "",
    search: "",
    type: "all",
  });

  // Departments with budgets
  const [departments, setDepartments] = useState([
    { id: 1, name: "Engineering", manager: "John Smith", budget: 500000 },
    { id: 2, name: "Design", manager: "Sarah Lee", budget: 200000 },
    { id: 3, name: "Marketing", manager: "Mike Johnson", budget: 150000 },
    { id: 4, name: "Finance", manager: "Lisa Brown", budget: 100000 },
    { id: 5, name: "Sales", manager: "Tom Wilson", budget: 300000 },
    { id: 6, name: "IT", manager: "David Chen", budget: 400000 },
    { id: 7, name: "Management", manager: "Robert Kim", budget: 600000 },
  ]);

  const [activePage, setActivePage] = useState("Dashboard");
  const [clockOffset, setClockOffset] = useState(0);

  const getAppNow = useCallback(
    () => new Date(Date.now() + clockOffset),
    [clockOffset],
  );

  const setAppDateTime = useCallback((date) => {
    setClockOffset(date.getTime() - Date.now());
  }, []);

  const resetAppDateTime = useCallback(() => {
    setClockOffset(0);
  }, []);

  const isClockAdjusted = clockOffset !== 0;

  // Employee actions
  const addEmployee = useCallback((employee) => {
    setEmployees((prev) => [...prev, { ...employee, id: generateId() }]);
  }, []);

  const removeEmployee = useCallback((id) => {
    setEmployees((prev) => prev.filter((emp) => !idsMatch(emp.id, id)));
  }, []);

  const updateEmployee = useCallback((id, updates) => {
    setEmployees((prev) =>
      prev.map((emp) => (idsMatch(emp.id, id) ? { ...emp, ...updates } : emp)),
    );
  }, []);

  const selectEmployee = useCallback((employee) => {
    setSelectedEmployee(employee);
  }, []);

  // Modal actions
  const openModal = useCallback((modalName) => {
    setModals((prev) => ({ ...prev, [modalName]: true }));
  }, []);

  const closeModal = useCallback((modalName) => {
    setModals((prev) => ({ ...prev, [modalName]: false }));
  }, []);

  const closeAllModals = useCallback(() => {
    setModals({
      employee: false,
      filter: false,
      job: false,
      holiday: false,
    });
  }, []);

  // Filter actions
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

  // Department budget actions
  const updateDepartmentBudget = useCallback((id, newBudget) => {
    setDepartments((prev) =>
      prev.map((dept) =>
        idsMatch(dept.id, id) ? { ...dept, budget: newBudget } : dept,
      ),
    );
  }, []);

  const addDepartment = useCallback((department) => {
    setDepartments((prev) => [...prev, { ...department, id: generateId() }]);
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

  // Job actions
  const addJob = useCallback((job) => {
    setJobs((prev) => [
      ...prev,
      { ...job, id: generateId() },
    ]);
  }, []);

  const updateJob = useCallback((id, updates) => {
    setJobs((prev) =>
      prev.map((job) => (idsMatch(job.id, id) ? { ...job, ...updates } : job)),
    );
  }, []);

  const removeJob = useCallback((id) => {
    setJobs((prev) => prev.filter((job) => !idsMatch(job.id, id)));
  }, []);

  // Candidate actions
  const addCandidate = useCallback((candidate) => {
    setCandidates((prev) => [
      ...prev,
      { ...candidate, id: generateId() },
    ]);
  }, []);

  const updateCandidate = useCallback((id, updates) => {
    setCandidates((prev) =>
      prev.map((c) => (idsMatch(c.id, id) ? { ...c, ...updates } : c)),
    );
  }, []);

  const removeCandidate = useCallback((id) => {
    setCandidates((prev) => prev.filter((c) => !idsMatch(c.id, id)));
  }, []);

  // Get all candidates applied to a given job
  const getCandidatesByJob = useCallback(
    (jobId) => candidates.filter((c) => idsMatch(c.jobId, jobId)),
    [candidates],
  );

  // Get applicant count for a given job
  const getApplicantCount = useCallback(
    (jobId) => getCandidatesByJob(jobId).length,
    [getCandidatesByJob],
  );

  // Look up a job by id
  const getJobById = useCallback(
    (jobId) => jobs.find((j) => idsMatch(j.id, jobId)),
    [jobs],
  );

  // Notification actions
  const markNotificationRead = useCallback((id) => {
    setNotifications((prev) =>
      prev.map((n) => (idsMatch(n.id, id) ? { ...n, read: true } : n)),
    );
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const removeNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => !idsMatch(n.id, id)));
  }, []);

  const clearReadNotifications = useCallback(() => {
    setNotifications((prev) => prev.filter((n) => !n.read));
  }, []);

  const unreadNotificationCount = notifications.filter((n) => !n.read).length;

  const value = {
    // State
    employees,
    jobs,
    candidates,
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
    getAppNow,
    setAppDateTime,
    resetAppDateTime,

    // Actions
    addEmployee,
    removeEmployee,
    updateEmployee,
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
    addJob,
    updateJob,
    removeJob,
    addCandidate,
    updateCandidate,
    removeCandidate,
    getCandidatesByJob,
    getApplicantCount,
    getJobById,
    markNotificationRead,
    markAllNotificationsRead,
    removeNotification,
    clearReadNotifications,
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
