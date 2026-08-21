import "../i18n";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import CreateCycleDialog from "./CreateCycleDialog";
import { PerformanceReviewsAPI } from "../api";

vi.mock("../api", () => ({
  PerformanceReviewsAPI: {
    createCycle: vi.fn(),
  },
}));

describe("CreateCycleDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the submit button disabled until a label is entered", async () => {
    render(<CreateCycleDialog onClose={() => {}} onCreated={() => {}} />);
    expect(screen.getByRole("button", { name: "Create cycle" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Label"), { target: { value: "Special Review" } });
    expect(screen.getByRole("button", { name: "Create cycle" })).not.toBeDisabled();
  });

  it("submits the label and dates and reports the created cycle", async () => {
    const created = { key: "custom-1", label: "Special Review", kind: "custom", status: "Open" };
    PerformanceReviewsAPI.createCycle.mockResolvedValue({ success: true, data: created });
    const onCreated = vi.fn();
    const onClose = vi.fn();
    render(<CreateCycleDialog onClose={onClose} onCreated={onCreated} />);

    fireEvent.change(screen.getByLabelText("Label"), { target: { value: "Special Review" } });
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-03-01" } });
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2026-06-30" } });
    fireEvent.click(screen.getByText("Create cycle"));

    await waitFor(() =>
      expect(PerformanceReviewsAPI.createCycle).toHaveBeenCalledWith({
        label: "Special Review", start: "2026-03-01", end: "2026-06-30",
      })
    );
    expect(onCreated).toHaveBeenCalledWith(created);
    expect(onClose).toHaveBeenCalled();
  });

  it("shows an error and stays open when creation fails", async () => {
    PerformanceReviewsAPI.createCycle.mockRejectedValue(new Error("Label already in use."));
    const onCreated = vi.fn();
    render(<CreateCycleDialog onClose={() => {}} onCreated={onCreated} />);

    fireEvent.change(screen.getByLabelText("Label"), { target: { value: "Special Review" } });
    fireEvent.click(screen.getByText("Create cycle"));

    expect(await screen.findByText("Label already in use.")).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
  });
});
