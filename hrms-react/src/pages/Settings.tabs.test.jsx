import "../i18n";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Settings from "./Settings";
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
 * Characterization tests — the Settings SHELL.
 *
 * Settings.test.jsx already covers the permissions matrix inside the Roles
 * tab. Nothing covered the shell, which is what Phase 3 is about to take
 * apart: 1,494 lines holding nine near-independent features, split into
 * pages/settings/ with one file per tab.
 *
 * The shell's whole job is deciding WHICH tab exists and WHICH renders, and it
 * does that twice over:
 *
 *   the tab list   ...(isHRTier ? [audit] : []), ...(isAdmin ? [roles] : [])
 *   the render     {activeTab === 'audit' && isHRTier && <AuditLogTab />}
 *
 * The second check is redundant while the first is correct, which is exactly
 * why a decomposition can drop it without any visible effect — until a later
 * change to the tab list makes it load-bearing again. These tests pin the
 * observable half; the redundancy itself is called out here so the next reader
 * knows it is deliberate belt-and-braces, not dead code to tidy away.
 */

const STORE = { employees: [], departments: [] };

beforeEach(() => {
  vi.clearAllMocks();
});

async function renderSettings(user) {
  renderWithProviders(<Settings />, { user, store: STORE });
  await screen.findByRole("button", { name: "My Profile" });
}

describe("Settings — tab availability by role", () => {
  it("gives every role the four self-service tabs", async () => {
    await renderSettings(USERS.EMPLOYEE);
    for (const label of ["My Profile", "Notifications", "Appearance", "Security"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("withholds Audit Log and Roles from a plain EMPLOYEE", async () => {
    await renderSettings(USERS.EMPLOYEE);
    expect(screen.queryByRole("button", { name: "Audit Log" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Roles & Permissions" })).not.toBeInTheDocument();
  });

  it("withholds Audit Log and Roles from a MANAGER", async () => {
    // MANAGER is isManagerTier but neither isHRTier nor isAdmin, so it gets
    // the same Settings as an employee. Easy to get wrong by reaching for
    // isManagerTier when splitting the tab list out.
    await renderSettings(USERS.MANAGER);
    expect(screen.queryByRole("button", { name: "Audit Log" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Roles & Permissions" })).not.toBeInTheDocument();
  });

  it("gives HR the Audit Log tab but not Roles", async () => {
    // The one role that distinguishes the two gates: isHRTier without isAdmin.
    await renderSettings(USERS.HR);
    expect(screen.getByRole("button", { name: "Audit Log" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Roles & Permissions" })).not.toBeInTheDocument();
  });

  it("gives ADMIN both gated tabs", async () => {
    await renderSettings(USERS.ADMIN);
    expect(screen.getByRole("button", { name: "Audit Log" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Roles & Permissions" })).toBeInTheDocument();
  });
});

describe("Settings — tab switching", () => {
  it("opens on My Profile", async () => {
    await renderSettings(USERS.ADMIN);
    // The profile tab is the only one that renders inside a Panel wrapper and
    // mounts MyProfileEditSection, which fetches the current profile.
    const { EmployeesAPI } = await import("../api");
    await waitFor(() => expect(EmployeesAPI.myProfile).toHaveBeenCalled());
  });

  it("switches to Appearance when its tab is clicked", async () => {
    const user = userEvent.setup();
    await renderSettings(USERS.ADMIN);
    await user.click(screen.getByRole("button", { name: "Appearance" }));
    // The panel subtitle is the stable anchor — the theme control itself is a
    // pair of buttons whose labels carry decorative glyphs ("☀ Light").
    expect(
      await screen.findByText("Choose how HRMS looks on your device."),
    ).toBeInTheDocument();
  });

  it("switches to Security when its tab is clicked", async () => {
    const user = userEvent.setup();
    await renderSettings(USERS.EMPLOYEE);
    await user.click(screen.getByRole("button", { name: "Security" }));
    expect(await screen.findByText("Change password")).toBeInTheDocument();
  });

  it("switches to the Roles tab for an ADMIN", async () => {
    const user = userEvent.setup();
    await renderSettings(USERS.ADMIN);
    await user.click(screen.getByRole("button", { name: "Roles & Permissions" }));
    const { PermissionsAPI } = await import("../api");
    await waitFor(() => expect(PermissionsAPI.list).toHaveBeenCalled());
  });
});
