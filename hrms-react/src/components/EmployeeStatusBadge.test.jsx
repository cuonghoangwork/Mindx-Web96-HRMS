import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import EmployeeStatusBadge from "./EmployeeStatusBadge";

describe("EmployeeStatusBadge", () => {
  it("renders the status label in badge mode (default)", () => {
    render(<EmployeeStatusBadge status="Active" />);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("renders only a colored dot in dot mode, with the status as an accessible label", () => {
    render(<EmployeeStatusBadge status="On Leave" variant="dot" />);
    expect(screen.getByRole("img", { name: "On Leave" })).toBeInTheDocument();
    expect(screen.queryByText("On Leave")).not.toBeInTheDocument();
  });

  it("renders dot + label with no border in pill mode", () => {
    render(<EmployeeStatusBadge status="Remote" variant="pill" />);
    expect(screen.getByText("Remote")).toBeInTheDocument();
  });

  it("falls back to the Active config for an unrecognized status", () => {
    // Unknown statuses shouldn't throw — CONFIG[status] ?? CONFIG["Active"]
    expect(() => render(<EmployeeStatusBadge status="Unknown" />)).not.toThrow();
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it.each(["Active", "On Leave", "Remote", "Terminated"])(
    "renders without crashing for status=%s",
    (status) => {
      expect(() => render(<EmployeeStatusBadge status={status} />)).not.toThrow();
    }
  );
});
