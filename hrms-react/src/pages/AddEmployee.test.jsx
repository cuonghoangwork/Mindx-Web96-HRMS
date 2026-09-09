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
 * Characterization tests — AddEmployee (927 lines before Phase 3 split it).
 *
 * Now pages/add-employee/ with one file per wizard step. Validation stayed as
 * module-level functions in formRules.js rather than becoming a useEmployeeForm
 * hook — see that file. The risk the split carries is specific: STEP_FIELDS
 * (formRules.js) maps a step number to the
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

describe("AddEmployee — the extracted step components mount and advance", () => {
  // Steps 2 and 3 had NO coverage before Phase 3 pulled them out of the
  // AddEmployee render into PersonalStep/JobStep/FinanceStep. Extracting inline
  // JSX into a component is the one Phase 3 change that is not a pure move: it
  // invents a props interface, and a prop that is dropped or misrouted shows up
  // as a blank field rather than an error. These walk the wizard forward so
  // each extracted component is actually mounted with real props.
  async function fillStep1(user) {
    await user.type(screen.getByPlaceholderText("John Smith"), "Alice Nguyen");
    await user.type(screen.getByPlaceholderText("25"), "30");
    await user.selectOptions(screen.getByRole("combobox"), "Female");
    await user.type(screen.getByPlaceholderText("john.smith@company.com"), "alice@hrms.com");
  }

  it("advances from Personal to Job once step 1 is valid", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AddEmployee />, { user: USERS.ADMIN, store: STORE });
    await screen.findByText("Personal Information");
    await fillStep1(user);
    await user.click(screen.getByRole("button", { name: /Next/ }));

    expect(await screen.findByText("Job Information")).toBeInTheDocument();
    // Props actually arrived: these fields come from JobStep's own render.
    expect(screen.getByText("Employee ID")).toBeInTheDocument();
    expect(screen.getByText("Department")).toBeInTheDocument();
    expect(screen.getByText("Designation")).toBeInTheDocument();
    // And the wizard now offers Back, which step 1 did not.
    expect(screen.getByRole("button", { name: /Back/ })).toBeInTheDocument();
  });

  it("renders the department list handed to JobStep by the shell", async () => {
    // departments is a prop now rather than a closure — if the shell stopped
    // passing it, the select would simply be empty and nothing would throw.
    const user = userEvent.setup();
    renderWithProviders(<AddEmployee />, { user: USERS.ADMIN, store: STORE });
    await screen.findByText("Personal Information");
    await fillStep1(user);
    await user.click(screen.getByRole("button", { name: /Next/ }));
    await screen.findByText("Job Information");
    expect(await screen.findByRole("option", { name: "Engineering" })).toBeInTheDocument();
  });

  it("goes back from Job to Personal without losing entered data", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AddEmployee />, { user: USERS.ADMIN, store: STORE });
    await screen.findByText("Personal Information");
    await fillStep1(user);
    await user.click(screen.getByRole("button", { name: /Next/ }));
    await screen.findByText("Job Information");
    await user.click(screen.getByRole("button", { name: /Back/ }));

    expect(await screen.findByText("Personal Information")).toBeInTheDocument();
    // form state lives in the shell, so the extraction must not have reset it
    expect(screen.getByPlaceholderText("John Smith")).toHaveValue("Alice Nguyen");
  });
});
