import "../i18n";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Performance from "./Performance";
import { PerformanceReviewsAPI } from "../api";

vi.mock("../api", () => ({
  PerformanceReviewsAPI: {
    meta: vi.fn(),
    cycles: vi.fn(),
    roster: vi.fn(),
    getReview: vi.fn(),
    submitSelf: vi.fn(),
    submitManager: vi.fn(),
  },
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: vi.fn(() => ({ user: { employeeId: "e1" }, isManagerTier: false, isHRTier: false })),
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
const ROSTER = [
  { employeeId: "e1", name: "Alice Nguyen", department: "Engineering", selfRating: 4, managerRating: 4, status: "completed" },
  { employeeId: "e2", name: "Bao Tran", department: "Sales", selfRating: 3, managerRating: null, status: "pending" },
];

describe("Performance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    PerformanceReviewsAPI.meta.mockResolvedValue({ success: true, data: META });
    PerformanceReviewsAPI.cycles.mockResolvedValue({ success: true, items: CYCLES });
    PerformanceReviewsAPI.roster.mockResolvedValue({ success: true, items: ROSTER });
  });

  it("defaults to the Open cycle and renders the roster", async () => {
    render(<Performance />);
    expect(await screen.findByText("Alice Nguyen")).toBeInTheDocument();
    expect(screen.getByText("Bao Tran")).toBeInTheDocument();
    expect(PerformanceReviewsAPI.roster).toHaveBeenCalledWith("2026-h1");
  });

  it("computes the stat strip from the roster response", async () => {
    render(<Performance />);
    await screen.findByText("Alice Nguyen");
    // 1 of 2 rows has both self + manager ratings
    expect(screen.getByText("1/2")).toBeInTheDocument();
  });

  it("filters the roster by search text", async () => {
    render(<Performance />);
    await screen.findByText("Alice Nguyen");
    fireEvent.change(screen.getByPlaceholderText(/search employees/i), { target: { value: "bao" } });
    expect(screen.queryByText("Alice Nguyen")).not.toBeInTheDocument();
    expect(screen.getByText("Bao Tran")).toBeInTheDocument();
  });

  it("opens the review dialog on row click", async () => {
    PerformanceReviewsAPI.getReview.mockResolvedValue({ success: true, data: null });
    render(<Performance />);
    const row = await screen.findByText("Alice Nguyen");
    fireEvent.click(row.closest("tr"));
    await waitFor(() => expect(PerformanceReviewsAPI.getReview).toHaveBeenCalledWith("2026-h1", "e1"));
  });
});
