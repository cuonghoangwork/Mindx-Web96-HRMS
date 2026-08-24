import "../i18n";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Badge, { StatusBadge, TypeBadge, CandidateStageBadge } from "./Badge";

describe("Badge", () => {
  it("renders its label", () => {
    render(<Badge variant="active">Active</Badge>);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("falls back to the pending/neutral style for an unknown variant", () => {
    render(<Badge variant="not-a-real-variant">Mystery</Badge>);
    expect(screen.getByText("Mystery")).toHaveClass("badge-pending");
  });

  it("is square (flat tag) by default and fully rounded when pill=true", () => {
    const { rerender } = render(<Badge>Default</Badge>);
    expect(screen.getByText("Default")).toHaveStyle({ borderRadius: "0" });
    rerender(<Badge pill>Round</Badge>);
    expect(screen.getByText("Round")).toHaveStyle({ borderRadius: "var(--radius-full)" });
  });
});

describe("StatusBadge", () => {
  it.each([
    ["Active", "badge-active"],
    ["On Leave", "badge-leave"],
    ["Remote", "badge-remote"],
    ["Terminated", "badge-terminated"],
  ])("maps status %s to %s", (status, expectedClass) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(status)).toHaveClass(expectedClass);
  });

  it("falls back to neutral for an unrecognized status", () => {
    render(<StatusBadge status="Something Else" />);
    expect(screen.getByText("Something Else")).toHaveClass("badge-pending");
  });
});

describe("TypeBadge", () => {
  // Matches the mockup's typeTagStyleFor exactly: Full-time = accent tint,
  // Part-time = purple, Contract = teal (same value as Info in the
  // mockup's own token object), Intern falls into the neutral "else" tint.
  it.each([
    ["Full-time", "badge-primary"],
    ["Part-time", "badge-purple"],
    ["Contract", "badge-info"],
    ["Intern", "badge-pending"],
  ])("maps contract type %s to %s", (type, expectedClass) => {
    render(<TypeBadge type={type} />);
    expect(screen.getByText(type)).toHaveClass(expectedClass);
  });
});

describe("CandidateStageBadge", () => {
  it.each([
    ["Applied", "badge-pending"],
    ["Screening", "badge-remote"],
    ["Interview", "badge-leave"],
    ["Offer", "badge-primary"],
    ["Hired", "badge-active"],
    ["Rejected", "badge-terminated"],
  ])("maps pipeline stage %s to %s", (stage, expectedClass) => {
    render(<CandidateStageBadge stage={stage} />);
    expect(screen.getByText(stage)).toHaveClass(expectedClass);
  });
});
