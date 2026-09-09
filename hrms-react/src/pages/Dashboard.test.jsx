import "../i18n";
import { screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Dashboard from "./Dashboard";
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
 * Characterization tests — Dashboard.jsx (787 lines, previously 0 tests).
 *
 * These pin CURRENT behaviour so Phase 3's decomposition of this file into
 * AdminDashboard / SelfServiceDashboard siblings plus components/charts/ can
 * be proven behaviour-preserving. They are deliberately not thorough: the job
 * is to fail loudly if a move drops something, not to specify the dashboard.
 *
 * The single most important thing here is the role fork on line 203
 * (`isHRTier ? <AdminDashboard /> : <SelfServiceDashboard />`). It is one
 * ternary, it decides which of two ~300-line trees renders, and splitting the
 * file into siblings is exactly the change that could invert or drop it.
 */

const DEPARTMENTS = [
  { id: "d1", _id: "d1", name: "Engineering", budget: 1000, manager: "Minh Manager" },
  { id: "d2", _id: "d2", name: "Sales", budget: 500, manager: "" },
];

const EMPLOYEES = [
  { id: "e1", _id: "e1", name: "Alice Nguyen", department: "Engineering", contractType: "Permanent", status: "Active" },
  { id: "e2", _id: "e2", name: "Bao Tran", department: "Engineering", contractType: "Contract", status: "Active" },
  { id: "e3", _id: "e3", name: "Chi Le", department: "Sales", contractType: "Permanent", status: "Active" },
];

const STORE = { departments: DEPARTMENTS, employees: EMPLOYEES };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Dashboard — role fork", () => {
  it("renders the org-wide dashboard for ADMIN", async () => {
    renderWithProviders(<Dashboard />, { user: USERS.ADMIN, store: STORE });
    expect(await screen.findByText("Headcount")).toBeInTheDocument();
  });

  it("renders the org-wide dashboard for HR", async () => {
    // HR and ADMIN share it via isHRTier — if a refactor narrows the check to
    // isAdmin, HR silently loses the whole page. Hence a separate case.
    renderWithProviders(<Dashboard />, { user: USERS.HR, store: STORE });
    expect(await screen.findByText("Headcount")).toBeInTheDocument();
  });

  it("renders the self-service dashboard for MANAGER", async () => {
    // MANAGER is deliberately NOT isHRTier: they are department-scoped, and
    // the org-wide headcount/contract-mix widgets are not theirs to see.
    renderWithProviders(<Dashboard />, { user: USERS.MANAGER, store: STORE });
    expect(await screen.findByText("My leave requests")).toBeInTheDocument();
    expect(screen.queryByText("Headcount")).not.toBeInTheDocument();
  });

  it("renders the self-service dashboard for EMPLOYEE", async () => {
    renderWithProviders(<Dashboard />, { user: USERS.EMPLOYEE, store: STORE });
    expect(await screen.findByText("My leave requests")).toBeInTheDocument();
    expect(screen.queryByText("Headcount")).not.toBeInTheDocument();
  });
});

describe("Dashboard — org-wide widgets", () => {
  it("lists every department from the store in the headcount widget", async () => {
    renderWithProviders(<Dashboard />, { user: USERS.ADMIN, store: STORE });
    await screen.findByText("Headcount");
    expect(screen.getAllByText("Engineering").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Sales").length).toBeGreaterThan(0);
  });

  it("renders the contract-type breakdown", async () => {
    renderWithProviders(<Dashboard />, { user: USERS.ADMIN, store: STORE });
    expect(await screen.findByText("Contract Types")).toBeInTheDocument();
  });

  it("does not put the holidays widget on the org-wide dashboard", async () => {
    // Verified against the source, not assumed: the holidays widget lives at
    // Dashboard.jsx:731, which is inside SelfServiceDashboard (518-786), not
    // AdminDashboard (210-517). Recorded here because "move the widgets into
    // components/charts/" is a Phase 3 step that could easily reattach it to
    // the wrong sibling, and nothing else would notice.
    renderWithProviders(<Dashboard />, { user: USERS.ADMIN, store: STORE });
    await screen.findByText("Headcount");
    expect(screen.queryByText("Upcoming company holidays")).not.toBeInTheDocument();
  });

  it("shows the holidays widget, with its empty state, on the self-service dashboard", async () => {
    renderWithProviders(<Dashboard />, { user: USERS.EMPLOYEE, store: STORE });
    expect(await screen.findByText("Upcoming company holidays")).toBeInTheDocument();
    expect(screen.getByText("No upcoming holidays scheduled.")).toBeInTheDocument();
  });

  it("loads the store through the real provider, not a stubbed context", async () => {
    // Guards the harness itself: if someone later swaps renderWithProviders
    // for a mocked useStore, EmployeesAPI.list stops being called and this
    // fails — which is the signal that the safety net has been cut.
    const { EmployeesAPI } = await import("../api");
    renderWithProviders(<Dashboard />, { user: USERS.ADMIN, store: STORE });
    await waitFor(() => expect(EmployeesAPI.list).toHaveBeenCalled());
  });
});
