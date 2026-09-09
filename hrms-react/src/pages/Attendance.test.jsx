import "../i18n";
import { screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Attendance from "./Attendance";
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
 * Characterization tests — Attendance.jsx (835 lines, previously 0 tests).
 *
 * Phase 3 extracts NoShowQueueTab, WeeklyBars and MonthlyHeatmap out of here.
 * What those extractions can quietly break is the tab set and the scope
 * banner, both of which are role-derived:
 *
 *   tabs        Roster + Overtime for everyone, No-show queue only for
 *               isHRTier (Attendance.jsx:552-557). The source comment states
 *               the intent outright: "an employee sees two tabs and HR sees
 *               three" — these tests are that sentence, executable.
 *   scope note  isManager -> "Showing your team", !isManagerTier -> "Showing
 *               your own attendance" (Attendance.jsx:587-599).
 */

const DEPARTMENTS = [{ id: "d1", _id: "d1", name: "Engineering", budget: 1000 }];

const EMPLOYEES = [
  { id: "e1", _id: "e1", name: "Alice Nguyen", department: "Engineering", status: "Active" },
  { id: "u-manager", _id: "u-manager", name: "Minh Manager", department: "Engineering", status: "Active" },
  { id: "u-employee", _id: "u-employee", name: "Emma Employee", department: "Engineering", status: "Active" },
];

const STORE = { employees: EMPLOYEES, departments: DEPARTMENTS };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Attendance — tab set by role", () => {
  it("gives HR all three tabs, including the no-show queue", async () => {
    renderWithProviders(<Attendance />, { user: USERS.HR, store: STORE });
    expect(await screen.findByRole("button", { name: "Roster" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "No-show queue" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Overtime" })).toBeInTheDocument();
  });

  it("gives ADMIN the no-show queue too", async () => {
    renderWithProviders(<Attendance />, { user: USERS.ADMIN, store: STORE });
    expect(await screen.findByRole("button", { name: "No-show queue" })).toBeInTheDocument();
  });

  it("withholds the no-show queue from a MANAGER", async () => {
    // MANAGER is isManagerTier but NOT isHRTier — the distinction the tab
    // list turns on, and the one most easily flattened during an extraction.
    renderWithProviders(<Attendance />, { user: USERS.MANAGER, store: STORE });
    expect(await screen.findByRole("button", { name: "Roster" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Overtime" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "No-show queue" })).not.toBeInTheDocument();
  });

  it("withholds the no-show queue from an EMPLOYEE but keeps Overtime", async () => {
    // Overtime stays reachable for every role: it is how an employee files
    // their own request, and the 13:00 same-day cutoff makes losing it costly.
    renderWithProviders(<Attendance />, { user: USERS.EMPLOYEE, store: STORE });
    expect(await screen.findByRole("button", { name: "Roster" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Overtime" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "No-show queue" })).not.toBeInTheDocument();
  });
});

describe("Attendance — scope banner", () => {
  it("tells a plain EMPLOYEE they are seeing only their own attendance", async () => {
    renderWithProviders(<Attendance />, { user: USERS.EMPLOYEE, store: STORE });
    expect(await screen.findByText("Showing your own attendance")).toBeInTheDocument();
  });

  it("does not show the own-attendance banner to HR", async () => {
    renderWithProviders(<Attendance />, { user: USERS.HR, store: STORE });
    await screen.findByRole("button", { name: "Roster" });
    expect(screen.queryByText("Showing your own attendance")).not.toBeInTheDocument();
  });

  it("tells a MANAGER the roster is scoped to their team", async () => {
    renderWithProviders(<Attendance />, { user: USERS.MANAGER, store: STORE });
    expect(await screen.findByText(/Showing your team/)).toBeInTheDocument();
  });
});

describe("Attendance — data source", () => {
  it("loads attendance through the real store provider", async () => {
    const { AttendanceAPI } = await import("../api");
    renderWithProviders(<Attendance />, { user: USERS.HR, store: STORE });
    await waitFor(() => expect(AttendanceAPI.list).toHaveBeenCalled());
  });
});
