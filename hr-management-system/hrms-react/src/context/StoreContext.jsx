import { createContext, useContext, useState, useCallback } from "react";

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
    createdAt: "2024-01-01",
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
    createdAt: "2024-01-02",
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
    createdAt: "2024-01-03",
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
    createdAt: "2024-01-05",
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
    createdAt: "2024-01-08",
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
    createdAt: "2024-01-10",
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
    createdAt: "2024-01-12",
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
    createdAt: "2024-01-15",
  },
];

// Attendance records for today (demo data)
const initialAttendance = [
  {
    employeeId: 1,
    date: "2024-01-15",
    checkIn: "09:00",
    checkOut: "18:00",
    status: "Present",
  },
  {
    employeeId: 2,
    date: "2024-01-15",
    checkIn: "09:15",
    checkOut: "18:30",
    status: "Present",
  },
  {
    employeeId: 3,
    date: "2024-01-15",
    checkIn: null,
    checkOut: null,
    status: "On Leave",
  },
  {
    employeeId: 4,
    date: "2024-01-15",
    checkIn: "08:45",
    checkOut: "17:30",
    status: "Present",
  },
  {
    employeeId: 5,
    date: "2024-01-15",
    checkIn: "09:30",
    checkOut: null,
    status: "Present",
  },
  {
    employeeId: 6,
    date: "2024-01-15",
    checkIn: "09:45",
    checkOut: "18:00",
    status: "Present",
  },
  {
    employeeId: 7,
    date: "2024-01-15",
    checkIn: "08:30",
    checkOut: "17:00",
    status: "Present",
  },
  {
    employeeId: 8,
    date: "2024-01-15",
    checkIn: null,
    checkOut: null,
    status: "On Leave",
  },
];

export function StoreProvider({ children }) {
  const [employees, setEmployees] = useState(initialEmployees);
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
    setEmployees((prev) => [...prev, { ...employee, id: Date.now() }]);
  }, []);

  const removeEmployee = useCallback((id) => {
    setEmployees((prev) => prev.filter((emp) => emp.id !== id));
  }, []);

  const updateEmployee = useCallback((id, updates) => {
    setEmployees((prev) =>
      prev.map((emp) => (emp.id === id ? { ...emp, ...updates } : emp)),
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
        dept.id === id ? { ...dept, budget: newBudget } : dept,
      ),
    );
  }, []);

  const addDepartment = useCallback((department) => {
    setDepartments((prev) => [...prev, { ...department, id: Date.now() }]);
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

  const value = {
    // State
    employees,
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
