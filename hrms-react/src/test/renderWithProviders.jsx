import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppProviders } from "../context/AppProviders";
import {
  AuthAPI,
  EmployeesAPI,
  DepartmentsAPI,
  JobsAPI,
  CandidatesAPI,
  HolidaysAPI,
  AttendanceAPI,
  NotificationsAPI,
  OvertimeRequestsAPI,
} from "../api";

/**
 * Mounts a page inside the REAL provider tree, with only the API layer faked.
 *
 * WHY NOT vi.mock("../context/StoreContext"). Mocking useStore is the obvious
 * shortcut and it is a trap: it hardcodes the shape of the 74-field store value
 * into every test that uses it. Phase 2 of the refactor exists to break that
 * value into four narrower contexts, so those tests would have to be rewritten
 * by the very refactor they are supposed to be protecting — a safety net that
 * gets replaced mid-fall is not a safety net.
 *
 * Faking the API layer instead means these tests assert on what the page
 * RENDERS given a set of server responses. A context split that preserves
 * behaviour passes them untouched; one that drops a field fails them. That is
 * the property a characterization test needs to have.
 *
 * AuthProvider is real too, so role flags (isAdmin / isHRTier / isManagerTier)
 * are computed by the same code the app runs, from the user object handed to
 * `user`. Authentication works because api/client.js's getTokens() reads
 * localStorage, so seeding a token is enough to make the real provider believe
 * it is signed in.
 */

const ACCESS_KEY = "hrms-access-token";
const REFRESH_KEY = "hrms-refresh-token";

export const USERS = {
  ADMIN: { id: "u-admin", name: "Ada Admin", email: "admin@hrms.com", role: "ADMIN" },
  HR: { id: "u-hr", name: "Hana HR", email: "hr@hrms.com", role: "HR" },
  MANAGER: {
    id: "u-manager",
    name: "Minh Manager",
    email: "manager@hrms.com",
    role: "MANAGER",
    department: "Engineering",
  },
  EMPLOYEE: {
    id: "u-employee",
    name: "Emma Employee",
    email: "employee@hrms.com",
    role: "EMPLOYEE",
    department: "Engineering",
  },
};

function seedAuth(user) {
  // Cleared rather than merely overwritten: theme and language also live here,
  // and a value left behind by an earlier test would silently change what the
  // next one renders.
  localStorage.clear();
  localStorage.setItem(ACCESS_KEY, "test-access-token");
  localStorage.setItem(REFRESH_KEY, "test-refresh-token");

  AuthAPI.config.mockResolvedValue({
    data: { publicRegistration: false, accountEmailDomain: "hrms.com" },
  });
  AuthAPI.me.mockResolvedValue({ data: user });
}

/**
 * Fills the eight lists StoreProvider.refreshAll() fetches in parallel.
 * Anything not supplied resolves empty, so a test only names the data it
 * actually asserts on.
 */
export function seedStore({
  employees = [],
  departments = [],
  jobs = [],
  candidates = [],
  holidays = [],
  attendance = [],
  notifications = [],
  overtimeRequests = [],
} = {}) {
  EmployeesAPI.list.mockResolvedValue({ items: employees });
  DepartmentsAPI.list.mockResolvedValue({ items: departments });
  JobsAPI.list.mockResolvedValue({ items: jobs });
  CandidatesAPI.list.mockResolvedValue({ items: candidates });
  HolidaysAPI.list.mockResolvedValue({ items: holidays });
  AttendanceAPI.list.mockResolvedValue({ items: attendance });
  NotificationsAPI.list.mockResolvedValue({ items: notifications });
  OvertimeRequestsAPI.list.mockResolvedValue({ items: overtimeRequests });
}

export function renderWithProviders(ui, { user = USERS.ADMIN, store = {}, route = "/" } = {}) {
  seedAuth(user);
  seedStore(store);

  return render(
    <MemoryRouter initialEntries={[route]}>
      <AppProviders>{ui}</AppProviders>
    </MemoryRouter>,
  );
}
