import i18n from "../i18n";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import vi from "../i18n/locales/vi.json";
import { LeaveStatusBadge } from "./LeaveStatusBadge";

/**
 * F7 dedupe: this component replaced two diverged copies.
 *
 * The dashboard's copy built its label with a bare
 * `status.charAt(0).toUpperCase() + status.slice(1)`, so leave statuses stayed
 * in English no matter the UI language, while the employee page translated the
 * same values. Unifying on the translated version fixed that — and an
 * English-only test cannot tell the two implementations apart, because
 * capitalize("approved") and t("...approved") both render "Approved".
 *
 * So the load-bearing case here runs in Vietnamese. The vi bundle is lazy-
 * loaded in the app (see i18n/index.js), hence the explicit addResourceBundle.
 */

afterEach(async () => {
  await i18n.changeLanguage("en");
});

describe("LeaveStatusBadge", () => {
  it("renders the English label for each status", () => {
    render(<LeaveStatusBadge status="approved" />);
    expect(screen.getByText("Approved")).toBeInTheDocument();
  });

  it("falls back to the raw status when no translation key exists", () => {
    render(<LeaveStatusBadge status="withdrawn" />);
    expect(screen.getByText("Withdrawn")).toBeInTheDocument();
  });

  it("renders an em dash when the status is missing", () => {
    render(<LeaveStatusBadge status={undefined} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("translates the label — the defect the dedupe fixed", async () => {
    i18n.addResourceBundle("vi", "translation", vi, true, true);
    await i18n.changeLanguage("vi");

    render(<LeaveStatusBadge status="approved" />);
    // "đã duyệt" with the first letter capitalised. The old dashboard copy
    // rendered "Approved" here.
    expect(screen.getByText("Đã duyệt")).toBeInTheDocument();
    expect(screen.queryByText("Approved")).not.toBeInTheDocument();
  });
});
