// Real translations, not the raw keys: AvatarGroup's overflow badge labels
// itself through t("avatar.moreAriaLabel"), so without this the aria-label
// renders as the key and getByLabelText finds nothing. Same first line as
// every other test file that renders a translated component.
import "../i18n";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Avatar, { AvatarGroup, getInitials } from "./Avatar";

describe("getInitials", () => {
  it("takes the first letter of the first two words", () => {
    expect(getInitials("Jane Doe")).toBe("JD");
  });

  it("uppercases and handles a single name", () => {
    expect(getInitials("bob")).toBe("B");
  });

  it("falls back to ? for an empty name", () => {
    expect(getInitials("")).toBe("?");
  });

  it("collapses extra whitespace between words", () => {
    expect(getInitials("  Mary   Jane   Watson  ")).toBe("MJ");
  });
});

describe("Avatar", () => {
  it("renders initials when no image src is given", () => {
    render(<Avatar name="Jane Doe" />);
    expect(screen.getByText("JD")).toBeInTheDocument();
  });

  it("is deterministic — the same name always gets the same background color", () => {
    const { container: c1 } = render(<Avatar name="Jane Doe" />);
    const { container: c2 } = render(<Avatar name="Jane Doe" />);
    const bg1 = c1.querySelector("span > span")?.style.background;
    const bg2 = c2.querySelector("span > span")?.style.background;
    expect(bg1).toBeTruthy();
    expect(bg1).toBe(bg2);
  });

  it("uses aria-label for accessibility, defaulting to the name", () => {
    render(<Avatar name="Jane Doe" />);
    expect(screen.getByLabelText("Jane Doe")).toBeInTheDocument();
  });

  it("becomes a keyboard-focusable button when onClick is passed", () => {
    render(<Avatar name="Jane Doe" onClick={() => {}} />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("is not a button when onClick is omitted", () => {
    render(<Avatar name="Jane Doe" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("AvatarGroup", () => {
  const avatars = [
    { id: 1, name: "Alice A" },
    { id: 2, name: "Bob B" },
    { id: 3, name: "Cara C" },
    { id: 4, name: "Dan D" },
  ];

  it("renders up to `max` avatars and an overflow badge for the rest", () => {
    render(<AvatarGroup avatars={avatars} max={3} />);
    expect(screen.getByText("AA")).toBeInTheDocument();
    expect(screen.getByText("BB")).toBeInTheDocument();
    expect(screen.getByText("CC")).toBeInTheDocument();
    expect(screen.queryByText("DD")).not.toBeInTheDocument();
    expect(screen.getByLabelText("+1 more")).toBeInTheDocument();
  });

  it("renders no overflow badge when everyone fits", () => {
    render(<AvatarGroup avatars={avatars} max={10} />);
    expect(screen.queryByText(/\+\d+ more/)).not.toBeInTheDocument();
  });
});
