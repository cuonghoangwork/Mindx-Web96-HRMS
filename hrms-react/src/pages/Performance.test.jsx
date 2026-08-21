import "../i18n";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Performance from "./Performance";
import { PerformanceReviewsAPI } from "../api";
import { LanguageProvider } from "../context/LanguageContext";
import { useAuth } from "../context/AuthContext";

// LanguageProvider is required by PerformanceReviewDialog (opened on row
// click), which reads useLanguage() for the appeal-deadline date format.
function renderPage() {
  return render(
    <LanguageProvider>
      <Performance />
    </LanguageProvider>
  );
}

vi.mock("../api", () => ({
  PerformanceReviewsAPI: {
    meta: vi.fn(),
    cycles: vi.fn(),
    roster: vi.fn(),
    analytics: vi.fn(),
    createCycle: vi.fn(),
    setCycleStatus: vi.fn(),
    getReview: vi.fn(),
    submitSelf: vi.fn(),
    submitManager: vi.fn(),
  },
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

const META = {
  ratingOptions: [1, 2, 3, 4, 5],
  ratingLabels: { 1: "Needs improvement", 5: "Outstanding" },
  competencies: ["communication"],
};
const CYCLES = [
  { key: "2025-h2", label: "H2 2025", kind: "standard", status: "Closed" },
  { key: "2026-h1", label: "H1 2026", kind: "standard", status: "Open" },
];
// status is the server's own 4-state field (meta.reviewStatuses) — Bao
// Tran here has only a manager rating (self not yet submitted), which
// exercises the "Manager submitted" case distinct from "Self submitted".
const ROSTER = [
  { employeeId: "e1", name: "Alice Nguyen", department: "Engineering", selfRating: 4, managerRating: 4, status: "Completed", hasAppeal: false, appealStatus: null },
  { employeeId: "e2", name: "Bao Tran", department: "Sales", selfRating: null, managerRating: 3, status: "Manager submitted", hasAppeal: false, appealStatus: null },
];
// employees === notStarted here so hasAnalyticsData is false by default —
// keeps the analytics panels out of tests that aren't exercising them.
const ANALYTICS_EMPTY = {
  totals: { employees: 2, notStarted: 2, selfSubmitted: 0, managerSubmitted: 0, completed: 0 },
  ratingDistribution: { self: {}, manager: {} },
  averages: { self: null, manager: null },
  competencyAverages: [],
  deptCompare: null,
};

describe("Performance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ isAdmin: false });
    PerformanceReviewsAPI.meta.mockResolvedValue({ success: true, data: META });
    PerformanceReviewsAPI.cycles.mockResolvedValue({ success: true, items: CYCLES });
    PerformanceReviewsAPI.roster.mockResolvedValue({ success: true, items: ROSTER });
    PerformanceReviewsAPI.analytics.mockResolvedValue({ success: true, data: ANALYTICS_EMPTY });
  });

  it("defaults to the Open cycle and renders the roster", async () => {
    renderPage();
    expect(await screen.findByText("Alice Nguyen")).toBeInTheDocument();
    expect(screen.getByText("Bao Tran")).toBeInTheDocument();
    expect(PerformanceReviewsAPI.roster).toHaveBeenCalledWith("2026-h1");
  });

  it("shows the server's status label directly (manager-first submission is not mislabeled as self-only)", async () => {
    renderPage();
    await screen.findByText("Alice Nguyen");
    expect(screen.getByText("Manager Submitted")).toBeInTheDocument();
    expect(screen.queryByText("Self Only")).not.toBeInTheDocument();
  });

  it("falls back to the raw status string for a status this frontend doesn't recognize yet", async () => {
    PerformanceReviewsAPI.roster.mockResolvedValue({
      success: true,
      items: [{ employeeId: "e3", name: "Cam Vu", department: "Finance", selfRating: null, managerRating: null, status: "Appealed" }],
    });
    renderPage();
    await screen.findByText("Cam Vu");
    expect(screen.getByText("Appealed")).toBeInTheDocument();
  });

  it("computes the stat strip from the roster response", async () => {
    renderPage();
    await screen.findByText("Alice Nguyen");
    // 1 of 2 rows has both self + manager ratings
    expect(screen.getByText("1/2")).toBeInTheDocument();
  });

  it("filters the roster by search text", async () => {
    renderPage();
    await screen.findByText("Alice Nguyen");
    fireEvent.change(screen.getByPlaceholderText(/search employees/i), { target: { value: "bao" } });
    expect(screen.queryByText("Alice Nguyen")).not.toBeInTheDocument();
    expect(screen.getByText("Bao Tran")).toBeInTheDocument();
  });

  it("opens the review dialog on row click", async () => {
    PerformanceReviewsAPI.getReview.mockResolvedValue({ success: true, data: null });
    renderPage();
    const row = await screen.findByText("Alice Nguyen");
    fireEvent.click(row.closest("tr"));
    await waitFor(() => expect(PerformanceReviewsAPI.getReview).toHaveBeenCalledWith("2026-h1", "e1"));
  });

  it("shows an appeal badge on a roster row with a pending appeal", async () => {
    PerformanceReviewsAPI.roster.mockResolvedValue({
      success: true,
      items: [{ employeeId: "e1", name: "Alice Nguyen", department: "Engineering", selfRating: 4, managerRating: 4, status: "Completed", hasAppeal: true, appealStatus: "Pending" }],
    });
    renderPage();
    await screen.findByText("Alice Nguyen");
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("hides the cycle-status and new-cycle buttons for a non-admin", async () => {
    renderPage();
    await screen.findByText("Alice Nguyen");
    expect(screen.queryByText("Close cycle")).not.toBeInTheDocument();
    expect(screen.queryByText("+ New custom cycle")).not.toBeInTheDocument();
  });

  it("shows the cycle-status and new-cycle buttons for an admin, and toggles cycle status", async () => {
    useAuth.mockReturnValue({ isAdmin: true });
    PerformanceReviewsAPI.setCycleStatus.mockResolvedValue({
      success: true,
      data: { ...CYCLES[1], status: "Closed" },
    });
    renderPage();
    await screen.findByText("Alice Nguyen");
    expect(screen.getByText("+ New custom cycle")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Close cycle"));
    await waitFor(() =>
      expect(PerformanceReviewsAPI.setCycleStatus).toHaveBeenCalledWith("2026-h1", "Closed")
    );
    expect(await screen.findByText("Reopen cycle")).toBeInTheDocument();
    expect(screen.getByText("This cycle is closed. Reopen it to make changes.")).toBeInTheDocument();
  });

  it("creates a custom cycle and selects it", async () => {
    useAuth.mockReturnValue({ isAdmin: true });
    const newCycle = { key: "custom-1", label: "Special Review", kind: "custom", status: "Open" };
    PerformanceReviewsAPI.createCycle.mockResolvedValue({ success: true, data: newCycle });
    renderPage();
    await screen.findByText("Alice Nguyen");

    fireEvent.click(screen.getByText("+ New custom cycle"));
    fireEvent.change(screen.getByLabelText("Label"), { target: { value: "Special Review" } });
    fireEvent.click(screen.getByText("Create cycle"));

    await waitFor(() =>
      expect(PerformanceReviewsAPI.createCycle).toHaveBeenCalledWith({ label: "Special Review", start: "", end: "" })
    );
    await waitFor(() => expect(PerformanceReviewsAPI.roster).toHaveBeenCalledWith("custom-1"));
  });

  it("renders the analytics panels from the analytics response, without a department-compare section when the server didn't grant one", async () => {
    PerformanceReviewsAPI.analytics.mockResolvedValue({
      success: true,
      data: {
        totals: { employees: 2, notStarted: 0, selfSubmitted: 0, managerSubmitted: 1, completed: 1 },
        ratingDistribution: { self: { 4: 1 }, manager: { 3: 1, 4: 1 } },
        averages: { self: 4, manager: 3.5 },
        competencyAverages: [{ key: "communication", self: 4, manager: null, selfCount: 1, managerCount: 0 }],
        deptCompare: null,
      },
    });
    renderPage();
    await screen.findByText("Analytics");
    expect(screen.getByText("Rating Distribution")).toBeInTheDocument();
    expect(screen.getByText("Competency Averages")).toBeInTheDocument();
    expect(screen.queryByText("Department Comparison")).not.toBeInTheDocument();
  });
});
