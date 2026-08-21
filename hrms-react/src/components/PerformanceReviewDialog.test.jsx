import "../i18n";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import PerformanceReviewDialog from "./PerformanceReviewDialog";
import { PerformanceReviewsAPI } from "../api";

vi.mock("../api", () => ({
  PerformanceReviewsAPI: {
    getReview: vi.fn(),
    submitSelf: vi.fn(),
    submitManager: vi.fn(),
  },
}));

const META = { ratingOptions: [1, 2, 3, 4, 5], ratingLabels: { 3: "Meets expectations" } };
const EMPTY_REVIEW = {
  selfRating: null, selfComments: "", selfSubmittedDate: null,
  managerRating: null, managerComments: "", managerSubmittedDate: null,
};

// permissions always comes from the server (§2.3 of the contract) — the
// dialog never guesses canEditSelf/canEditManager from role flags.
const permissionsFor = (overrides) => ({
  canEditSelf: false, canEditManager: false,
  canEditCompetencySelf: false, canEditCompetencyManager: false,
  canAddGoals: false, canAddPeerFeedback: false,
  canFileAppeal: false, canResolveAppeal: false,
  ...overrides,
});

describe("PerformanceReviewDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows an editable self-review form when the server grants canEditSelf", async () => {
    PerformanceReviewsAPI.getReview.mockResolvedValue({
      success: true, data: EMPTY_REVIEW, permissions: permissionsFor({ canEditSelf: true }),
    });
    render(
      <PerformanceReviewDialog
        cycleKey="2026-h1" employeeId="e1" employeeName="Alice Nguyen"
        meta={META} onClose={() => {}} onSubmitted={() => {}}
      />
    );
    await screen.findByText("Self Review");
    expect(screen.getByText("Submit self review")).toBeInTheDocument();
    // Manager section stays read-only — the server didn't grant canEditManager.
    expect(screen.queryByText("Submit manager review")).not.toBeInTheDocument();
  });

  it("is fully read-only when the server grants neither permission", async () => {
    // Also the regression case for the bug this dialog used to have: an
    // HR/ADMIN viewer with no client-side role prop to key off of (useAuth
    // was removed from this component entirely) has no way to make
    // canEditManager true here other than the server granting it — the
    // component simply never receives role information to guess from.
    PerformanceReviewsAPI.getReview.mockResolvedValue({
      success: true, data: EMPTY_REVIEW, permissions: permissionsFor({}),
    });
    render(
      <PerformanceReviewDialog
        cycleKey="2026-h1" employeeId="e1" employeeName="Alice Nguyen"
        meta={META} onClose={() => {}} onSubmitted={() => {}}
      />
    );
    await screen.findByText("Self Review");
    expect(screen.queryByText("Submit self review")).not.toBeInTheDocument();
    expect(screen.queryByText("Submit manager review")).not.toBeInTheDocument();
    expect(screen.getAllByText("Not submitted yet.")).toHaveLength(2);
  });

  it("submits the self review with the selected rating and comments", async () => {
    PerformanceReviewsAPI.getReview.mockResolvedValue({
      success: true, data: EMPTY_REVIEW, permissions: permissionsFor({ canEditSelf: true }),
    });
    PerformanceReviewsAPI.submitSelf.mockResolvedValue({ success: true, data: { ...EMPTY_REVIEW, selfRating: 3, selfSubmittedDate: "2026-01-01" } });
    const onSubmitted = vi.fn();
    render(
      <PerformanceReviewDialog
        cycleKey="2026-h1" employeeId="e1" employeeName="Alice Nguyen"
        meta={META} onClose={() => {}} onSubmitted={onSubmitted}
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

  it("submits the manager review when the server grants canEditManager", async () => {
    PerformanceReviewsAPI.getReview.mockResolvedValue({
      success: true, data: EMPTY_REVIEW, permissions: permissionsFor({ canEditManager: true }),
    });
    PerformanceReviewsAPI.submitManager.mockResolvedValue({ success: true, data: { ...EMPTY_REVIEW, managerRating: 4, managerSubmittedDate: "2026-01-02" } });
    const onSubmitted = vi.fn();
    render(
      <PerformanceReviewDialog
        cycleKey="2026-h1" employeeId="e2" employeeName="Bao Tran"
        meta={META} onClose={() => {}} onSubmitted={onSubmitted}
      />
    );
    await screen.findByText("Self Review");
    expect(screen.queryByText("Submit self review")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Rating"), { target: { value: "4" } });
    fireEvent.click(screen.getByText("Submit manager review"));
    await waitFor(() =>
      expect(PerformanceReviewsAPI.submitManager).toHaveBeenCalledWith("2026-h1", "e2", {
        managerRating: 4, managerComments: "",
      })
    );
    expect(onSubmitted).toHaveBeenCalled();
  });
});
