import "../i18n";
import { screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Payroll from "./Payroll";
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
 * Characterization tests — Payroll.jsx (1,236 lines, 25 useState, previously
 * 0 tests). The plan schedules this page LAST in Phase 3 precisely because it
 * is one ~1,000-line function whose state is all in one scope; pulling those
 * 25 variables into a usePayrollTable hook is the single easiest place in the
 * whole refactor to drop one silently.
 *
 * These pin the two things that are both role-dependent and destructive to get
 * wrong: which buttons an ADMIN alone may press (payroll generation and the
 * monthly run — Payroll.jsx:668,679), and that a MANAGER's view is scoped to
 * their own department rather than the company.
 */

const DEPARTMENTS = [{ id: "d1", _id: "d1", name: "Engineering", budget: 1000 }];
const EMPLOYEES = [
  { id: "u-manager", _id: "u-manager", name: "Minh Manager", department: "Engineering", status: "Active" },
  { id: "e1", _id: "e1", name: "Alice Nguyen", department: "Engineering", status: "Active" },
];
const STORE = { employees: EMPLOYEES, departments: DEPARTMENTS };

const PERIOD = {
  id: "p1",
  _id: "p1",
  year: 2026,
  month: 9,
  status: "draft",
  label: "September 2026",
};

async function seedPeriods(periods) {
  const { PayrollAPI } = await import("../api");
  PayrollAPI.listPeriods.mockResolvedValue({ items: periods });
  PayrollAPI.listPayslips.mockResolvedValue({ items: [] });
  return PayrollAPI;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Payroll — no periods yet", () => {
  it("shows the empty state when the backend returns no pay periods", async () => {
    await seedPeriods([]);
    renderWithProviders(<Payroll />, { user: USERS.ADMIN, store: STORE });
    expect(await screen.findByText("No pay periods yet")).toBeInTheDocument();
  });

  it("fetches periods on mount", async () => {
    const PayrollAPI = await seedPeriods([]);
    renderWithProviders(<Payroll />, { user: USERS.ADMIN, store: STORE });
    await waitFor(() => expect(PayrollAPI.listPeriods).toHaveBeenCalled());
  });
});

describe("Payroll — generation controls are ADMIN-only", () => {
  it("offers ADMIN the monthly draft generator", async () => {
    await seedPeriods([PERIOD]);
    renderWithProviders(<Payroll />, { user: USERS.ADMIN, store: STORE });
    expect(
      await screen.findByRole("button", { name: /Generate this month's draft/ }),
    ).toBeInTheDocument();
  });

  it("withholds the monthly draft generator from HR", async () => {
    // HR is isHRTier and sees payroll, but generation runs the same job the
    // scheduler runs — it stays ADMIN-only (Payroll.jsx:668).
    await seedPeriods([PERIOD]);
    renderWithProviders(<Payroll />, { user: USERS.HR, store: STORE });
    await waitFor(() =>
      expect(screen.queryByText("No pay periods yet")).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: /Generate this month's draft/ }),
    ).not.toBeInTheDocument();
  });

  it("withholds the monthly draft generator from a MANAGER", async () => {
    await seedPeriods([PERIOD]);
    renderWithProviders(<Payroll />, { user: USERS.MANAGER, store: STORE });
    await waitFor(() =>
      expect(screen.queryByText("No pay periods yet")).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: /Generate this month's draft/ }),
    ).not.toBeInTheDocument();
  });
});

describe("Payroll — period selection", () => {
  it("loads the payslips for the period it selects on mount", async () => {
    // The period list and the payslip fetch are separate calls wired through
    // a useState default (`items[0]?.id`). Extracting usePayrollTable has to
    // keep that auto-selection, or the page loads with an empty table and no
    // error to explain it.
    const PayrollAPI = await seedPeriods([PERIOD]);
    renderWithProviders(<Payroll />, { user: USERS.ADMIN, store: STORE });
    await waitFor(() => expect(PayrollAPI.listPayslips).toHaveBeenCalledWith("p1"));
  });

  it("tells a MANAGER their payroll view is scoped to their team", async () => {
    await seedPeriods([PERIOD]);
    renderWithProviders(<Payroll />, { user: USERS.MANAGER, store: STORE });
    expect(await screen.findByText(/Showing your team/)).toBeInTheDocument();
  });
});
