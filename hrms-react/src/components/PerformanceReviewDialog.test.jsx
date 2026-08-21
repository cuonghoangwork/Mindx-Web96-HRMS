import "../i18n";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import PerformanceReviewDialog from "./PerformanceReviewDialog";
import { PerformanceReviewsAPI } from "../api";
import { LanguageProvider } from "../context/LanguageContext";

vi.mock("../api", () => ({
  PerformanceReviewsAPI: {
    getReview: vi.fn(),
    submitSelf: vi.fn(),
    submitManager: vi.fn(),
    setCompetency: vi.fn(),
    addGoal: vi.fn(),
    updateGoal: vi.fn(),
    addPeerFeedback: vi.fn(),
    fileAppeal: vi.fn(),
    resolveAppeal: vi.fn(),
    askAI: vi.fn(),
  },
}));

const META = {
  ratingOptions: [1, 2, 3, 4, 5],
  ratingLabels: { 3: "Meets expectations" },
  competencies: ["communication", "execution"],
  competencyLabels: { communication: "Communication", execution: "Execution" },
  appealReasonCategories: ["rating_low", "inaccurate", "process", "other"],
  goalProgressStep: 10,
};
const EMPTY_REVIEW = {
  selfRating: null, selfComments: "", selfSubmittedDate: null,
  managerRating: null, managerComments: "", managerSubmittedDate: null,
  competencies: { communication: { self: null, manager: null }, execution: { self: null, manager: null } },
  goals: [], peerFeedback: [], appeal: null, appealDeadline: null,
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

// LanguageProvider is required by the appeal section (formatDate + useLanguage).
function renderDialog(props) {
  return render(
    <LanguageProvider>
      <PerformanceReviewDialog
        cycleKey="2026-h1" employeeId="e1" employeeName="Alice Nguyen"
        meta={META} onClose={() => {}} onSubmitted={() => {}}
        {...props}
      />
    </LanguageProvider>
  );
}

describe("PerformanceReviewDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows an editable self-review form when the server grants canEditSelf", async () => {
    PerformanceReviewsAPI.getReview.mockResolvedValue({
      success: true, data: EMPTY_REVIEW, permissions: permissionsFor({ canEditSelf: true }),
    });
    renderDialog();
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
    renderDialog();
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
    renderDialog({ onSubmitted });
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
    renderDialog({ employeeId: "e2", employeeName: "Bao Tran", onSubmitted });
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

  it("sets a self competency rating by clicking a dot when canEditCompetencySelf", async () => {
    PerformanceReviewsAPI.getReview.mockResolvedValue({
      success: true, data: EMPTY_REVIEW, permissions: permissionsFor({ canEditCompetencySelf: true }),
    });
    PerformanceReviewsAPI.setCompetency.mockResolvedValue({
      success: true,
      data: { ...EMPTY_REVIEW, competencies: { ...EMPTY_REVIEW.competencies, communication: { self: 4, manager: null } } },
    });
    renderDialog();
    await screen.findByText("Competencies");
    fireEvent.click(screen.getByRole("button", { name: "Communication — Self 4" }));
    await waitFor(() =>
      expect(PerformanceReviewsAPI.setCompetency).toHaveBeenCalledWith("2026-h1", "e1", {
        key: "communication", value: 4,
      })
    );
  });

  it("renders goals and adds a new one when canAddGoals", async () => {
    PerformanceReviewsAPI.getReview.mockResolvedValue({
      success: true,
      data: { ...EMPTY_REVIEW, goals: [{ id: "g1", text: "Ship the report", progress: 50 }] },
      permissions: permissionsFor({ canAddGoals: true }),
    });
    PerformanceReviewsAPI.addGoal.mockResolvedValue({
      success: true,
      data: { ...EMPTY_REVIEW, goals: [{ id: "g1", text: "Ship the report", progress: 50 }, { id: "g2", text: "Mentor a junior", progress: 0 }] },
    });
    renderDialog();
    await screen.findByText("Ship the report");
    expect(screen.getByText("In progress")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Describe a goal…"), { target: { value: "Mentor a junior" } });
    fireEvent.click(screen.getByText("Add goal"));
    await waitFor(() =>
      expect(PerformanceReviewsAPI.addGoal).toHaveBeenCalledWith("2026-h1", "e1", {
        text: "Mentor a junior", progress: 0,
      })
    );
    expect(await screen.findByText("Mentor a junior")).toBeInTheDocument();
  });

  it("adds peer feedback when canAddPeerFeedback", async () => {
    PerformanceReviewsAPI.getReview.mockResolvedValue({
      success: true, data: EMPTY_REVIEW, permissions: permissionsFor({ canAddPeerFeedback: true }),
    });
    PerformanceReviewsAPI.addPeerFeedback.mockResolvedValue({
      success: true,
      data: { ...EMPTY_REVIEW, peerFeedback: [{ id: "p1", name: "Jordan", relation: "Teammate", comments: "Great collaborator." }] },
    });
    renderDialog();
    await screen.findByText("Peer Feedback");
    fireEvent.change(screen.getByPlaceholderText("Reviewer name"), { target: { value: "Jordan" } });
    fireEvent.change(screen.getByPlaceholderText("Relation (e.g. Teammate)"), { target: { value: "Teammate" } });
    fireEvent.change(screen.getByPlaceholderText("Feedback comments…"), { target: { value: "Great collaborator." } });
    fireEvent.click(screen.getByText("Add feedback"));
    await waitFor(() =>
      expect(PerformanceReviewsAPI.addPeerFeedback).toHaveBeenCalledWith("2026-h1", "e1", {
        name: "Jordan", relation: "Teammate", comments: "Great collaborator.",
      })
    );
    expect(await screen.findByText("Great collaborator.")).toBeInTheDocument();
  });

  it("files an appeal when canFileAppeal", async () => {
    PerformanceReviewsAPI.getReview.mockResolvedValue({
      success: true,
      data: { ...EMPTY_REVIEW, managerRating: 2, managerSubmittedDate: "2026-01-01", appealDeadline: "2026-01-15" },
      permissions: permissionsFor({ canFileAppeal: true }),
    });
    PerformanceReviewsAPI.fileAppeal.mockResolvedValue({
      success: true,
      data: { ...EMPTY_REVIEW, appeal: { reasonCategory: "rating_low", detail: "Too low.", status: "Pending", resolution: null, resolverNote: "" } },
    });
    const onSubmitted = vi.fn();
    renderDialog({ onSubmitted });
    await screen.findByText("Appeal");
    fireEvent.click(screen.getByText("File appeal"));
    fireEvent.change(screen.getByLabelText("Explain why you're appealing…"), { target: { value: "Too low." } });
    fireEvent.click(screen.getByText("Submit appeal"));
    await waitFor(() =>
      expect(PerformanceReviewsAPI.fileAppeal).toHaveBeenCalledWith("2026-h1", "e1", {
        reasonCategory: "rating_low", detail: "Too low.",
      })
    );
    expect(onSubmitted).toHaveBeenCalled();
  });

  it("resolves a pending appeal when canResolveAppeal", async () => {
    PerformanceReviewsAPI.getReview.mockResolvedValue({
      success: true,
      data: { ...EMPTY_REVIEW, appeal: { reasonCategory: "rating_low", detail: "Too low.", status: "Pending", resolution: null, resolverNote: "" } },
      permissions: permissionsFor({ canResolveAppeal: true }),
    });
    PerformanceReviewsAPI.resolveAppeal.mockResolvedValue({
      success: true,
      data: { ...EMPTY_REVIEW, appeal: { reasonCategory: "rating_low", detail: "Too low.", status: "Resolved", resolution: "Upheld", resolverNote: "Reviewed with the manager." } },
    });
    const onSubmitted = vi.fn();
    renderDialog({ onSubmitted });
    await screen.findByText("Appeal");
    fireEvent.change(screen.getByLabelText("Note for the employee…"), { target: { value: "Reviewed with the manager." } });
    fireEvent.click(screen.getByText("Uphold"));
    await waitFor(() =>
      expect(PerformanceReviewsAPI.resolveAppeal).toHaveBeenCalledWith("2026-h1", "e1", {
        resolution: "Upheld", resolvedRating: undefined, resolverNote: "Reviewed with the manager.",
      })
    );
    expect(onSubmitted).toHaveBeenCalled();
  });

  it("shows a loading state then the AI insight text on success", async () => {
    PerformanceReviewsAPI.getReview.mockResolvedValue({
      success: true, data: EMPTY_REVIEW, permissions: permissionsFor({}),
    });
    let resolveAsk;
    PerformanceReviewsAPI.askAI.mockReturnValue(new Promise((resolve) => { resolveAsk = resolve; }));
    renderDialog();
    await screen.findByText("Self Review");

    fireEvent.click(screen.getByText("Ask AI"));
    expect(await screen.findByText("Thinking…")).toBeInTheDocument();

    resolveAsk({ success: true, text: "A neutral summary and one growth suggestion." });
    expect(await screen.findByText("A neutral summary and one growth suggestion.")).toBeInTheDocument();
    expect(PerformanceReviewsAPI.askAI).toHaveBeenCalledWith("2026-h1", "e1");
  });

  it("shows a static unavailable message, never the raw server error, when the AI call fails", async () => {
    PerformanceReviewsAPI.getReview.mockResolvedValue({
      success: true, data: EMPTY_REVIEW, permissions: permissionsFor({}),
    });
    PerformanceReviewsAPI.askAI.mockRejectedValue(new Error("GEMINI_API_KEY is unset"));
    renderDialog();
    await screen.findByText("Self Review");

    fireEvent.click(screen.getByText("Ask AI"));

    expect(await screen.findByText("AI insight is unavailable right now. Try again later.")).toBeInTheDocument();
    expect(screen.queryByText(/GEMINI_API_KEY/)).not.toBeInTheDocument();
  });
});
