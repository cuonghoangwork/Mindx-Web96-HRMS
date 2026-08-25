import "../i18n";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ChatWidget from "./ChatWidget";
import { AiAPI } from "../api";

vi.mock("../api", () => ({
  AiAPI: { chat: vi.fn() },
}));

describe("ChatWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the closed bubble by default with no panel visible", () => {
    render(<ChatWidget />);
    expect(screen.getByRole("button", { name: "Open assistant" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the panel and shows the greeting on click", () => {
    render(<ChatWidget />);
    fireEvent.click(screen.getByRole("button", { name: "Open assistant" }));
    expect(screen.getByRole("dialog", { name: "HRMS Assistant" })).toBeInTheDocument();
    expect(screen.getByText(/Ask me how to use HRMS/)).toBeInTheDocument();
  });

  it("sends a message with capped history and renders the reply", async () => {
    AiAPI.chat.mockResolvedValue({ success: true, reply: "Head to the Holidays page to request leave." });
    render(<ChatWidget />);
    fireEvent.click(screen.getByRole("button", { name: "Open assistant" }));

    fireEvent.change(screen.getByPlaceholderText("Ask a question…"), { target: { value: "How do I request leave?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Head to the Holidays page to request leave.")).toBeInTheDocument();
    expect(AiAPI.chat).toHaveBeenCalledWith("How do I request leave?", []);
    // The input clears after sending.
    expect(screen.getByPlaceholderText("Ask a question…").value).toBe("");
  });

  it("shows only the static unavailable message on failure, never the raw error", async () => {
    AiAPI.chat.mockRejectedValue(new Error("GEMINI_API_KEY is unset"));
    render(<ChatWidget />);
    fireEvent.click(screen.getByRole("button", { name: "Open assistant" }));

    fireEvent.change(screen.getByPlaceholderText("Ask a question…"), { target: { value: "hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(screen.getByText("Sorry, the assistant isn't available right now. Please try again later.")).toBeInTheDocument(),
    );
    expect(screen.queryByText(/GEMINI_API_KEY/)).not.toBeInTheDocument();
  });
});
