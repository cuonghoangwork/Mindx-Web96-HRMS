import "../i18n";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ViewEmployee from "./ViewEmployee";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import { LanguageProvider } from "../context/LanguageContext";

// Solo Gaps Milestone 1 — the Documents tab (DocumentsList, alongside the
// existing ContractCard). ViewEmployee.jsx has no prior test coverage, so
// this focuses narrowly on what Milestone 1 added rather than the whole
// page: navigate straight to ?tab=documents so the other tabs (which make
// their own API calls) never mount.

vi.mock("../context/StoreContext", () => ({
  useStore: vi.fn(),
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../api", () => ({
  LeaveRequestsAPI: { create: vi.fn() },
  PayrollAPI: {},
  AuditLogAPI: {},
  ProfileEditRequestsAPI: { list: vi.fn().mockResolvedValue({ items: [] }) },
}));

function renderPage(employee) {
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={[`/employees/${employee.id}?tab=documents`]}>
        <Routes>
          <Route path="/employees/:id" element={<ViewEmployee />} />
        </Routes>
      </MemoryRouter>
    </LanguageProvider>,
  );
}

const BASE_EMPLOYEE = {
  id: "emp1",
  employeeId: "EMP001",
  name: "Jane Doe",
  email: "jane@hrms.com",
  status: "Active",
  contractUrl: null,
  contractUploadedAt: null,
  documents: [],
};

let uploadEmployeeDocuments;
let removeEmployeeDocument;

function mockStore(employee) {
  useStore.mockReturnValue({
    employees: [employee],
    attendance: [],
    updateEmployee: vi.fn(),
    removeEmployee: vi.fn(),
    uploadEmployeeAvatar: vi.fn(),
    uploadEmployeeContract: vi.fn(),
    uploadEmployeeDocuments,
    removeEmployeeDocument,
    getAppNow: () => new Date("2026-08-25T00:00:00Z"),
  });
}

describe("ViewEmployee — Documents tab (Solo Gaps Milestone 1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uploadEmployeeDocuments = vi.fn().mockResolvedValue({ ...BASE_EMPLOYEE, documents: [] });
    removeEmployeeDocument = vi.fn().mockResolvedValue({ ...BASE_EMPLOYEE, documents: [] });
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  it("shows the empty state and no manage controls for a non-manager viewer", async () => {
    useAuth.mockReturnValue({ isAdmin: false, isManagerTier: false, isManager: false, user: { email: "someone@hrms.com" } });
    mockStore(BASE_EMPLOYEE);
    renderPage(BASE_EMPLOYEE);

    expect(await screen.findByText("No documents uploaded yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Document" })).not.toBeInTheDocument();
  });

  it("lets a manager-tier viewer add a document with a label and type", async () => {
    useAuth.mockReturnValue({ isAdmin: true, isManagerTier: true, isManager: false, user: { email: "admin@hrms.com" } });
    mockStore(BASE_EMPLOYEE);
    renderPage(BASE_EMPLOYEE);

    fireEvent.click(await screen.findByRole("button", { name: "Add Document" }));
    fireEvent.change(screen.getByPlaceholderText("Label (optional)"), { target: { value: "Offer letter" } });
    fireEvent.change(screen.getByDisplayValue("Other"), { target: { value: "offer_letter" } });

    const file = new File(["%PDF-1.4 fake"], "offer.pdf", { type: "application/pdf" });
    const input = document.querySelector('input[type="file"][multiple]');
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(uploadEmployeeDocuments).toHaveBeenCalledWith("emp1", [file], { label: "Offer letter", type: "offer_letter" }),
    );
  });

  it("rejects a non-PDF file client-side without calling the API", async () => {
    useAuth.mockReturnValue({ isAdmin: true, isManagerTier: true, isManager: false, user: { email: "admin@hrms.com" } });
    mockStore(BASE_EMPLOYEE);
    renderPage(BASE_EMPLOYEE);

    fireEvent.click(await screen.findByRole("button", { name: "Add Document" }));
    const file = new File(["not a pdf"], "notes.txt", { type: "text/plain" });
    const input = document.querySelector('input[type="file"][multiple]');
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText("Please choose PDF files only.")).toBeInTheDocument();
    expect(uploadEmployeeDocuments).not.toHaveBeenCalled();
  });

  it("rejects a batch of more than 5 files client-side without calling the API", async () => {
    useAuth.mockReturnValue({ isAdmin: true, isManagerTier: true, isManager: false, user: { email: "admin@hrms.com" } });
    mockStore(BASE_EMPLOYEE);
    renderPage(BASE_EMPLOYEE);

    fireEvent.click(await screen.findByRole("button", { name: "Add Document" }));
    const files = Array.from({ length: 6 }, (_, i) => new File(["%PDF-1.4 fake"], `doc${i}.pdf`, { type: "application/pdf" }));
    const input = document.querySelector('input[type="file"][multiple]');
    fireEvent.change(input, { target: { files } });

    expect(await screen.findByText("You can upload up to 5 files at once.")).toBeInTheDocument();
    expect(uploadEmployeeDocuments).not.toHaveBeenCalled();
  });

  it("shows View-only (no Delete) for a non-manager viewer, and both for a manager-tier viewer", async () => {
    const employee = {
      ...BASE_EMPLOYEE,
      documents: [{ id: "doc1", url: "https://example.com/doc1.pdf", label: "ID Scan", type: "id_scan", uploadedAt: "2026-08-01T00:00:00Z" }],
    };

    useAuth.mockReturnValue({ isAdmin: false, isManagerTier: false, isManager: false, user: { email: "someone@hrms.com" } });
    mockStore(employee);
    const { unmount } = renderPage(employee);
    expect(await screen.findByText("ID Scan")).toBeInTheDocument();
    const row = screen.getByText("ID Scan").parentElement.parentElement;
    expect(within(row).getByRole("link", { name: "View" })).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    unmount();

    // isAdmin: true also reveals the unrelated "Delete Employee" button in
    // the page header (same "Delete" text, no size class) — scope to the
    // document row so this assertion isn't testing the wrong button.
    useAuth.mockReturnValue({ isAdmin: true, isManagerTier: true, isManager: false, user: { email: "admin@hrms.com" } });
    mockStore(employee);
    renderPage(employee);
    await screen.findByText("ID Scan");
    const rowAfter = screen.getByText("ID Scan").parentElement.parentElement;
    expect(within(rowAfter).getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("deletes a document after confirmation", async () => {
    const employee = {
      ...BASE_EMPLOYEE,
      documents: [{ id: "doc1", url: "https://example.com/doc1.pdf", label: "ID Scan", type: "id_scan", uploadedAt: "2026-08-01T00:00:00Z" }],
    };
    useAuth.mockReturnValue({ isAdmin: true, isManagerTier: true, isManager: false, user: { email: "admin@hrms.com" } });
    mockStore(employee);
    renderPage(employee);

    await screen.findByText("ID Scan");
    const row = screen.getByText("ID Scan").parentElement.parentElement;
    fireEvent.click(within(row).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(removeEmployeeDocument).toHaveBeenCalledWith("emp1", "doc1"));
  });
});
