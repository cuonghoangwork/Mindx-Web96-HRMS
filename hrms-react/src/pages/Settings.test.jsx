import "../i18n";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Settings from "./Settings";
import { EmployeesAPI, ProfileEditRequestsAPI, PermissionsAPI } from "../api";
import { apiFetch } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { LanguageProvider } from "../context/LanguageContext";

// Solo Gaps Milestone 3 — the permissions matrix (PermissionsMatrix,
// rendered inside RolesTab). Settings.jsx has no prior test coverage, so
// this focuses narrowly on what Milestone 3 added: the Roles & Permissions
// tab being ADMIN-only, and the matrix's toggle behavior. The default
// "profile" tab (MyProfileEditSection) still mounts on render — its API
// calls are mocked to resolve harmlessly since it's not the focus here.

vi.mock("../api", () => ({
  EmployeesAPI: { myProfile: vi.fn() },
  ProfileEditRequestsAPI: { list: vi.fn() },
  AuditLogAPI: {},
  PermissionsAPI: { list: vi.fn(), toggle: vi.fn() },
}));

vi.mock("../api/client", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

function renderPage() {
  return render(
    <LanguageProvider>
      <Settings />
    </LanguageProvider>,
  );
}

const PERMISSION_ITEMS = [
  { role: "MANAGER", capability: "approveLeaveRequests", enabled: true },
  { role: "MANAGER", capability: "reviewProfileEdits", enabled: true },
  { role: "MANAGER", capability: "manageAttendanceRecords", enabled: false },
  { role: "MANAGER", capability: "proposePromotions", enabled: true },
];

describe("Settings — permissions matrix (Solo Gaps Milestone 3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    EmployeesAPI.myProfile.mockResolvedValue({ data: null });
    ProfileEditRequestsAPI.list.mockResolvedValue({ items: [] });
    apiFetch.mockResolvedValue({ items: [] });
    PermissionsAPI.list.mockResolvedValue({ items: PERMISSION_ITEMS });
    useAuth.mockReturnValue({
      isAdmin: true,
      isHRTier: true,
      user: { name: "Admin User", email: "admin@hrms.com", role: "ADMIN" },
    });
  });

  it("hides the Roles & Permissions tab entirely for a non-admin viewer", async () => {
    useAuth.mockReturnValue({
      isAdmin: false,
      isHRTier: false,
      user: { name: "Jane Doe", email: "jane@hrms.com", role: "EMPLOYEE" },
    });
    renderPage();

    expect(screen.queryByRole("button", { name: "Roles & Permissions" })).not.toBeInTheDocument();
    expect(PermissionsAPI.list).not.toHaveBeenCalled();
  });

  it("shows the 4 capabilities with their current state for an admin viewer", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Roles & Permissions" }));

    expect(await screen.findByText("Approve/reject leave requests")).toBeInTheDocument();
    const row = screen.getByText("Update/delete attendance records").closest("tr");
    expect(within(row).getByRole("button", { name: "Disabled" })).toBeInTheDocument();

    const enabledRow = screen.getByText("Approve/reject leave requests").closest("tr");
    expect(within(enabledRow).getByRole("button", { name: "Enabled" })).toBeInTheDocument();
  });

  it("toggles a capability and reflects the server's response", async () => {
    PermissionsAPI.toggle.mockResolvedValue({
      success: true,
      data: { role: "MANAGER", capability: "manageAttendanceRecords", enabled: true },
    });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Roles & Permissions" }));

    await screen.findByText("Update/delete attendance records");
    const row = screen.getByText("Update/delete attendance records").closest("tr");
    fireEvent.click(within(row).getByRole("button", { name: "Disabled" }));

    await waitFor(() => expect(within(row).getByRole("button", { name: "Enabled" })).toBeInTheDocument());
    expect(PermissionsAPI.toggle).toHaveBeenCalledWith("MANAGER", "manageAttendanceRecords", true);
  });

  it("shows an error and leaves the button usable again when the toggle fails", async () => {
    PermissionsAPI.toggle.mockRejectedValue(new Error("Network error"));
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Roles & Permissions" }));

    await screen.findByText("Update/delete attendance records");
    const row = screen.getByText("Update/delete attendance records").closest("tr");
    const button = within(row).getByRole("button", { name: "Disabled" });
    fireEvent.click(button);

    await waitFor(() => expect(screen.getByText("Network error")).toBeInTheDocument());
    expect(within(row).getByRole("button", { name: "Disabled" })).not.toBeDisabled();
  });
});
