import "../i18n";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AddEmployee from "./AddEmployee";
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
 * Characterization tests — AddEmployee.jsx (927 lines, previously 0 tests).
 *
 * Phase 3 splits this into pages/add-employee/ with one file per wizard step
 * plus a useEmployeeForm hook holding validation. The risk that split carries
 * is specific: STEP_FIELDS (AddEmployee.jsx:66) maps a step number to the
 * fields it validates, and goNext refuses to advance while that step has
 * errors. Move the steps into separate files and it becomes very easy to end
 * up with a wizard that walks straight past an invalid step — which does not
 * throw, it just creates an employee with a missing name or salary.
 *
 * So the load-bearing assertion here is the negative one: Next does NOT
 * advance while step 1 is invalid.
 */

const DEPARTMENTS = [{ id: "d1", _id: "d1", name: "Engineering", budget: 1000 }];
const STORE = { employees: [], departments: DEPARTMENTS };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AddEmployee — wizard shell", () => {
  it("renders all four steps", async () => {
    renderWithProviders(<AddEmployee />, { user: USERS.ADMIN, store: STORE });
    expect(await screen.findByText("Personal")).toBeInTheDocument();
    expect(screen.getByText("Job")).toBeInTheDocument();
    expect(screen.getByText("Finance")).toBeInTheDocument();
    expect(screen.getByText("Review")).toBeInTheDocument();
  });

  it("opens on step 1, where the back control is Cancel rather than Back", async () => {
    renderWithProviders(<AddEmployee />, { user: USERS.ADMIN, store: STORE });
    expect(await screen.findByRole("button", { name: /Cancel/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Back$/ })).not.toBeInTheDocument();
  });

  it("offers Next rather than Create Employee before the final step", async () => {
    renderWithProviders(<AddEmployee />, { user: USERS.ADMIN, store: STORE });
    expect(await screen.findByRole("button", { name: /Next/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Create Employee/ })).not.toBeInTheDocument();
  });
});

describe("AddEmployee — step 1 validation gates advancement", () => {
  it("surfaces the required-field error instead of advancing", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AddEmployee />, { user: USERS.ADMIN, store: STORE });
    await user.click(await screen.findByRole("button", { name: /Next/ }));
    expect(await screen.findByText("Full name is required")).toBeInTheDocument();
  });

  it("stays on step 1 when the step is invalid", async () => {
    // The real assertion behind the previous test: showing an error is not the
    // same as refusing to advance, and only the refusal protects the data.
    // Step 2's fields (employeeId / department / designation, STEP_FIELDS:67)
    // must not be on screen after a rejected Next.
    const user = userEvent.setup();
    renderWithProviders(<AddEmployee />, { user: USERS.ADMIN, store: STORE });
    await user.click(await screen.findByRole("button", { name: /Next/ }));
    await screen.findByText("Full name is required");
    expect(screen.queryByRole("button", { name: /^Back$/ })).not.toBeInTheDocument();
  });

  it("never calls the create endpoint from an invalid step 1", async () => {
    const { EmployeesAPI } = await import("../api");
    const user = userEvent.setup();
    renderWithProviders(<AddEmployee />, { user: USERS.ADMIN, store: STORE });
    await user.click(await screen.findByRole("button", { name: /Next/ }));
    await screen.findByText("Full name is required");
    await waitFor(() => expect(EmployeesAPI.create).not.toHaveBeenCalled());
  });
});
