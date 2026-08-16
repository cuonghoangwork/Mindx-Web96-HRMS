import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import FormField from "./FormField";

describe("FormField", () => {
  it("renders the label and associates it with the input", () => {
    render(
      <FormField label="Full Name" htmlFor="name">
        <input id="name" />
      </FormField>
    );
    expect(screen.getByLabelText("Full Name")).toBeInTheDocument();
  });

  it("shows a required marker when required", () => {
    render(
      <FormField label="Email" htmlFor="email" required>
        <input id="email" />
      </FormField>
    );
    expect(screen.getByText("*")).toBeInTheDocument();
  });

  it("shows the hint text", () => {
    render(
      <FormField label="Email" htmlFor="email" hint="Used for login">
        <input id="email" />
      </FormField>
    );
    expect(screen.getByText("Used for login")).toBeInTheDocument();
  });

  it("only shows the error after the field has been touched", () => {
    // No explicit `id` on the child here — FormField only auto-injects
    // id/aria-invalid/aria-describedby onto children that don't already
    // have an id of their own (see FormField.jsx's cloneElement guard),
    // so this also exercises that auto-wiring path.
    const { rerender } = render(
      <FormField label="Email" error="Required">
        <input />
      </FormField>
    );
    expect(screen.queryByText("Required")).not.toBeInTheDocument();

    rerender(
      <FormField label="Email" error="Required" touched>
        <input />
      </FormField>
    );
    expect(screen.getByText("Required")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
  });

  it("shows a success indicator when success + touched and no error", () => {
    render(
      <FormField label="Email" htmlFor="email" success touched>
        <input id="email" />
      </FormField>
    );
    expect(screen.getByText("Valid")).toBeInTheDocument();
  });

  it("does not show success when there is also an error", () => {
    render(
      <FormField label="Email" htmlFor="email" success error="Nope" touched>
        <input id="email" />
      </FormField>
    );
    expect(screen.queryByText("Valid")).not.toBeInTheDocument();
    expect(screen.getByText("Nope")).toBeInTheDocument();
  });

  it("renders the inline layout with label and control side by side", () => {
    render(
      <FormField label="Dark Mode" type="inline">
        <input type="checkbox" />
      </FormField>
    );
    expect(screen.getByText("Dark Mode")).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });
});
