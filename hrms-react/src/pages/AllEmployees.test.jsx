import "../i18n";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AllEmployees from "./AllEmployees";
import { renderWithProviders, USERS } from "../test/renderWithProviders";

vi.mock("../api", async (importOriginal) => {
  const { mockAllApis } = await import("../test/apiMock");
  return mockAllApis(importOriginal);
});

vi.mock("../api/notificationStream", async () => {
  const { mockNotificationStream } = await import("../test/apiMock");
  return mockNotificationStream();
});

/**
 * Characterization tests — AllEmployees.jsx (1,039 lines, previously 0 tests).
 *
 * Phase 3 extracts SidePanel, BulkActionBar, PendingPromotionsPanel and
 * EditRequestsPanel out of this file. Every one of those carries a role guard,
 * and a guard dropped during an extraction fails silently and in the worst
 * possible direction: it shows a colleague's salary, or hands a plain MANAGER
 * bulk-delete on a company-wide roster.
 *
 * So these tests pin the guards, not the layout. The two derived flags they
 * cover are AllEmployees.jsx:564 and :571:
 *
 *   isPlainManager  = isManager && !isHRTier
 *   isPlainEmployee = !isManager && !isHRTier
 */

const DEPARTMENTS = [{ id: "d1", _id: "d1", name: "Engineering", budget: 1000 }];

const EMPLOYEES = [
  {
    id: "e1",
    _id: "e1",
    name: "Alice Nguyen",
    department: "Engineering",
    jobTitle: "Engineer",
    type: "Permanent",
    status: "Active",
    email: "alice@hrms.com",
    salary: 90000,
  },
  {
    id: "e2",
    _id: "e2",
    name: "Bao Tran",
    department: "Engineering",
    jobTitle: "Analyst",
    type: "Contract",
    status: "Active",
    email: "bao@hrms.com",
    salary: 70000,
  },
];

const STORE = { employees: EMPLOYEES, departments: DEPARTMENTS };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AllEmployees — roster", () => {
  it("renders a row per employee from the store", async () => {
    renderWithProviders(<AllEmployees />, { user: USERS.ADMIN, store: STORE });
    expect(await screen.findByText("Alice Nguyen")).toBeInTheDocument();
    expect(screen.getByText("Bao Tran")).toBeInTheDocument();
  });

  it("loads the roster through the real store provider", async () => {
    const { EmployeesAPI } = await import("../api");
    renderWithProviders(<AllEmployees />, { user: USERS.ADMIN, store: STORE });
    await waitFor(() => expect(EmployeesAPI.list).toHaveBeenCalled());
  });
});

describe("AllEmployees — write actions are role-gated", () => {
  it("gives ADMIN the row-selection checkboxes", async () => {
    renderWithProviders(<AllEmployees />, { user: USERS.ADMIN, store: STORE });
    await screen.findByText("Alice Nguyen");
    expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0);
  });

  it("hides row selection from a plain MANAGER", async () => {
    // Directory is company-wide and read-only for this role; bulk actions
    // live on "My Department" instead. isPlainManager, AllEmployees.jsx:564.
    renderWithProviders(<AllEmployees />, { user: USERS.MANAGER, store: STORE });
    await screen.findByText("Alice Nguyen");
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("hides row selection from a plain EMPLOYEE", async () => {
    renderWithProviders(<AllEmployees />, { user: USERS.EMPLOYEE, store: STORE });
    await screen.findByText("Alice Nguyen");
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("offers Promote to ADMIN but not to a plain MANAGER", async () => {
    // isManagerTier && !isPlainManager (AllEmployees.jsx:915). Promote would
    // 403 for a MANAGER on most rows of an unscoped roster, so it is hidden
    // rather than shown-and-failing.
    const admin = renderWithProviders(<AllEmployees />, { user: USERS.ADMIN, store: STORE });
    await screen.findByText("Alice Nguyen");
    expect(screen.getAllByText("Promote").length).toBeGreaterThan(0);
    admin.unmount();

    renderWithProviders(<AllEmployees />, { user: USERS.MANAGER, store: STORE });
    await screen.findByText("Alice Nguyen");
    expect(screen.queryByText("Promote")).not.toBeInTheDocument();
  });
});

describe("AllEmployees — salary visibility in the side panel", () => {
  it("shows salary to ADMIN on a colleague's card", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AllEmployees />, { user: USERS.ADMIN, store: STORE });
    await user.click(await screen.findByText("Alice Nguyen"));
    expect(await screen.findByText("Salary")).toBeInTheDocument();
  });

  it("hides salary from a plain EMPLOYEE on a colleague's card", async () => {
    // The single highest-consequence guard on this page: the store holds every
    // employee's salary in memory, so a dropped condition during the SidePanel
    // extraction leaks it to the whole company rather than erroring.
    const user = userEvent.setup();
    renderWithProviders(<AllEmployees />, { user: USERS.EMPLOYEE, store: STORE });
    await user.click(await screen.findByText("Alice Nguyen"));
    // The panel is open — some other field from it is present …
    expect(await screen.findByText("Email")).toBeInTheDocument();
    // … but salary is not.
    expect(screen.queryByText("Salary")).not.toBeInTheDocument();
  });
});
