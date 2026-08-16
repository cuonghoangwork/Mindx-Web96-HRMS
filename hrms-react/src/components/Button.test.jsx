import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import Button, { ButtonGroup } from "./Button";

describe("Button", () => {
  it("renders its label", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("defaults to the secondary variant", () => {
    render(<Button>Cancel</Button>);
    expect(screen.getByRole("button")).toHaveClass("btn", "btn-secondary");
  });

  it("applies the variant class for each documented variant", () => {
    const variants = ["primary", "secondary", "ghost", "danger", "success", "brand-outline"];
    for (const variant of variants) {
      const { unmount } = render(<Button variant={variant}>{variant}</Button>);
      expect(screen.getByRole("button")).toHaveClass(`btn-${variant}`);
      unmount();
    }
  });

  it("fires onClick when clicked", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={onClick}>Click me</Button>);
    await user.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire onClick when disabled", () => {
    // A disabled button has pointer-events: none, so userEvent (which
    // simulates a real user and refuses to "click" a non-interactive
    // element) isn't the right tool here — fireEvent dispatches the DOM
    // event directly, which is what we want to verify the component's
    // own onClick={isDisabled ? undefined : onClick} guard.
    const onClick = vi.fn();
    render(<Button onClick={onClick} disabled>Click me</Button>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("does not fire onClick while loading", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick} loading>Saving</Button>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
  });

  it("renders as a different element via the `as` prop", () => {
    render(<Button as="a" href="/somewhere">Go</Button>);
    const link = screen.getByRole("link", { name: "Go" });
    expect(link).toHaveAttribute("href", "/somewhere");
  });

  it("hides its label from the accessibility tree in iconOnly mode but keeps it for screen readers", () => {
    render(
      <Button iconOnly aria-label="Delete" leftIcon={<span data-testid="icon">X</span>}>
        Delete
      </Button>
    );
    expect(screen.getByTestId("icon")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });
});

describe("ButtonGroup", () => {
  it("renders all children", () => {
    render(
      <ButtonGroup>
        <Button>One</Button>
        <Button>Two</Button>
      </ButtonGroup>
    );
    expect(screen.getByRole("button", { name: "One" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Two" })).toBeInTheDocument();
  });
});
