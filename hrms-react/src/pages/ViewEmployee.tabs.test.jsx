import "../i18n";
import { screen, waitFor } from "@testing-library/react";
import { Routes, Route } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ViewEmployee from "./ViewEmployee";
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
 * Characterization tests — the ViewEmployee SHELL.
 *
 * ViewEmployee.test.jsx covers the Documents tab only. Nothing covered the
 * shell, which is what Phase 3 is about to split into pages/employee/ with one
 * file per tab.
 *
 * Unlike Settings, this page does not gate the tab LIST by role at all — every
 * viewer sees all six tabs. Role control is entirely in the props the shell
 * hands each tab (isManagerTier, isManager, isOwnRecord), which is a much
 * easier thing to lose in a split: drop a prop and the tab still renders, just
 * with undefined where a permission used to be. `undefined` is falsy, so a
 * dropped prop silently becomes "least privilege" in some places and, where
 * the check is negated, "most privilege" in others.
 *
 * The sharpest example is SalaryTab, which uses isManagerTier to choose
 * between two DIFFERENT endpoints rather than to show or hide a control:
 *
 *   manager tier  -> PayrollAPI.listPeriods + listPayslips (server-scoped)
 *   plain employee -> PayrollAPI.myPayslips (self-service, approved/paid only)
 *
 * Lose that prop and a plain employee's profile starts calling the roster
 * endpoint. So these tests assert which endpoint is called, not what renders.
 */

const OWN_EMAIL = USERS.EMPLOYEE.email;

const EMPLOYEE_RECORD = {
  id: "emp1",
  _id: "emp1",
  employeeId: "EMP001",
  name: "Alice Nguyen",
  email: "alice@hrms.com",
  department: "Engineering",
  jobTitle: "Engineer",
  type: "Permanent",
  status: "Active",
  salary: 90000,
  documents: [],
};

const OWN_RECORD = { ...EMPLOYEE_RECORD, id: "emp9", _id: "emp9", name: "Emma Employee", email: OWN_EMAIL };

function renderEmployee({ user, employee = EMPLOYEE_RECORD, tab } = {}) {
  const route = `/employees/${employee.id}${tab ? `?tab=${tab}` : ""}`;
  return renderWithProviders(
    <Routes>
      <Route path="/employees/:id" element={<ViewEmployee />} />
    </Routes>,
    { user, store: { employees: [employee], departments: [] }, route },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ViewEmployee — tab shell", () => {
  it("renders all six detail tabs", async () => {
    renderEmployee({ user: USERS.ADMIN });
    for (const label of ["Profile", "Attendance", "Leave", "Salary", "Documents", "Activity"]) {
      expect(await screen.findByRole("tab", { name: label })).toBeInTheDocument();
    }
  });

  it("opens on the Profile tab", async () => {
    renderEmployee({ user: USERS.ADMIN });
    expect(await screen.findByRole("tab", { name: "Profile" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("honours ?tab= in the URL", async () => {
    // The existing Documents tests rely on this to avoid mounting the other
    // tabs, so it is load-bearing for the suite as well as for deep links.
    renderEmployee({ user: USERS.ADMIN, tab: "salary" });
    expect(await screen.findByRole("tab", { name: "Salary" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});

describe("ViewEmployee — delete is ADMIN-only", () => {
  it("offers Delete to an ADMIN", async () => {
    renderEmployee({ user: USERS.ADMIN });
    expect(await screen.findByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("withholds Delete from HR", async () => {
    // employeeController.remove is ADMIN-only in employeeRouter.js, so this is
    // gated on isAdmin and NOT isHRTier. Reaching for the tier check here is
    // the natural mistake, and it would show HR a button that 403s.
    renderEmployee({ user: USERS.HR });
    await screen.findByRole("tab", { name: "Profile" });
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("withholds Delete from a MANAGER", async () => {
    renderEmployee({ user: USERS.MANAGER });
    await screen.findByRole("tab", { name: "Profile" });
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });
});

describe("ViewEmployee — SalaryTab picks its endpoint from isManagerTier", () => {
  it("uses the roster payroll endpoints for a manager-tier viewer", async () => {
    const { PayrollAPI } = await import("../api");
    PayrollAPI.listPeriods.mockResolvedValue({ items: [] });
    renderEmployee({ user: USERS.ADMIN, tab: "salary" });
    await waitFor(() => expect(PayrollAPI.listPeriods).toHaveBeenCalled());
    expect(PayrollAPI.myPayslips).not.toHaveBeenCalled();
  });

  it("uses the self-service endpoint for a plain employee on their own record", async () => {
    // The assertion that matters: myPayslips only ever returns approved/paid
    // periods for the caller's own record. Falling through to the roster
    // endpoint here would either 403 or expose draft numbers.
    const { PayrollAPI } = await import("../api");
    PayrollAPI.myPayslips.mockResolvedValue({ items: [] });
    renderEmployee({ user: USERS.EMPLOYEE, employee: OWN_RECORD, tab: "salary" });
    await waitFor(() => expect(PayrollAPI.myPayslips).toHaveBeenCalled());
    expect(PayrollAPI.listPeriods).not.toHaveBeenCalled();
    expect(PayrollAPI.listPayslips).not.toHaveBeenCalled();
  });
});

describe("ViewEmployee — self-service edit requests", () => {
  it("looks for a pending edit request only on the viewer's own record", async () => {
    // loadPendingEditRequest returns early unless isOwnRecord, because
    // POST /profile-edit-requests always resolves the target from the caller.
    const { ProfileEditRequestsAPI } = await import("../api");
    renderEmployee({ user: USERS.ADMIN, employee: EMPLOYEE_RECORD });
    await screen.findByRole("tab", { name: "Profile" });
    expect(ProfileEditRequestsAPI.list).not.toHaveBeenCalled();
  });

  it("loads the pending edit request on the viewer's own record", async () => {
    const { ProfileEditRequestsAPI } = await import("../api");
    renderEmployee({ user: USERS.EMPLOYEE, employee: OWN_RECORD });
    await waitFor(() => expect(ProfileEditRequestsAPI.list).toHaveBeenCalled());
  });
});
