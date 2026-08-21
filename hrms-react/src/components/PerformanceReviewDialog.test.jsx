import "../i18n";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import PerformanceReviewDialog from "./PerformanceReviewDialog";
import { PerformanceReviewsAPI } from "../api";
import { useAuth } from "../context/AuthContext";

vi.mock("../api", () => ({
  PerformanceReviewsAPI: {
    getReview: vi.fn(),
    submitSelf: vi.fn(),
    submitManager: vi.fn(),
  },
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

const META = { ratingOptions: [1, 2, 3, 4, 5], ratingLabels: { 3: "Meets expectations" } };
const EMPTY_REVIEW = {
  selfRating: null, selfComments: "", selfSubmittedDate: null,
  managerRating: null, managerComments: "", managerSubmittedDate: null,
};

describe("PerformanceReviewDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    PerformanceReviewsAPI.getReview.mockResolvedValue({ success: true, data: EMPTY_REVIEW });
  });

  it("shows an editable self-review form for the owning employee while the cycle is open", async () => {
    useAuth.mockReturnValue({ user: { employeeId: "e1" }, isManagerTier: false, isHRTier: false });
    render(
      <PerformanceReviewDialog
        cycleKey="2026-h1" employeeId="e1" employeeName="Alice Nguyen"
        cycleOpen meta={META} onClose={() => {}} onSubmitted={() => {}}
      />
    );
    await screen.findByText("Self Review");
    expect(screen.getByText("Submit self review")).toBeInTheDocument();
    // Manager section is read-only (not their own review, and not a manager/HR)
    expect(screen.queryByText("Submit manager review")).not.toBeInTheDocument();
  });

  it("is read-only for someone who is neither the employee nor their manager/HR", async () => {
    useAuth.mockReturnValue({ user: { employeeId: "someone-else" }, isManagerTier: false, isHRTier: false });
    render(
      <PerformanceReviewDialog
        cycleKey="2026-h1" employeeId="e1" employeeName="Alice Nguyen"
        cycleOpen meta={META} onClose={() => {}} onSubmitted={() => {}}
      />
    );
    await screen.findByText("Self Review");
    expect(screen.queryByText("Submit self review")).not.toBeInTheDocument();
    expect(screen.queryByText("Submit manager review")).not.toBeInTheDocument();
    expect(screen.getAllByText("Not submitted yet.")).toHaveLength(2);
  });

  it("submits the self review with the selected rating and comments", async () => {
    useAuth.mockReturnValue({ user: { employeeId: "e1" }, isManagerTier: false, isHRTier: false });
    PerformanceReviewsAPI.submitSelf.mockResolvedValue({ success: true, data: { ...EMPTY_REVIEW, selfRating: 3, selfSubmittedDate: "2026-01-01" } });
    const onSubmitted = vi.fn();
    render(
      <PerformanceReviewDialog
        cycleKey="2026-h1" employeeId="e1" employeeName="Alice Nguyen"
        cycleOpen meta={META} onClose={() => {}} onSubmitted={onSubmitted}
      />
    );
    await screen.findByText("Self Review");
    fireEvent.change(screen.getByLabelText("Rating"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Comments"), { target: { value: "Solid quarter." } });
    fireEvent.click(screen.getByText("Submit self review"));
    await waitFor(() =>
      expect(PerformanceReviewsAPI.submitSelf).toHaveBeenCalledWith("2026-h1", "e1", {
        selfRating: 3, selfComments: "Solid quarter.",
      })
    );
    expect(onSubmitted).toHaveBeenCalled();
  });
});
