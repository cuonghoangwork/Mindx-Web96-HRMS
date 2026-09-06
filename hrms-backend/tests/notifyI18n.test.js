/**
 * notifyI18n.test.js — server-side rendering of notification copy.
 *
 * Two jobs. First, that a message actually renders in the recipient's
 * language with its parameters filled in. Second — and this is the one that
 * earns its keep long-term — that the backend's narrow copy of the strings
 * has not drifted from the frontend's, which is the real source of truth.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { renderNotification, languageFor, openInAppLabel } from "../utils/notifyI18n.js";
import { channelsFor } from "../utils/notifyPolicy.js";

const frontend = (lang) =>
  JSON.parse(readFileSync(new URL(`../../hrms-react/src/i18n/locales/${lang}.json`, import.meta.url), "utf8"));
const backend = (lang) =>
  JSON.parse(readFileSync(new URL(`../i18n/notifications.${lang}.json`, import.meta.url), "utf8"));

describe("renderNotification", () => {
  const leaveApproved = {
    titleKey: "leaveApproved",
    messageKey: "leaveApproved",
    title: "Leave request approved",
    message: "Your annual leave from 2027-03-01 to 2027-03-02 has been approved.",
    params: { leaveType: "annual", startDate: "2027-03-01", endDate: "2027-03-02" },
  };

  it("renders Vietnamese, including the leave-type label", () => {
    const { title, message } = renderNotification(leaveApproved, "vi");
    expect(title).toBe("Yêu cầu nghỉ phép đã được duyệt");
    // "annual" is an enum token, not display text. Leaving it raw is how a
    // message ends up half-translated.
    expect(message).toContain("Phép năm");
    expect(message).not.toContain("annual");
  });

  it("renders English with its own label set", () => {
    const { message } = renderNotification(leaveApproved, "en");
    expect(message).toContain("Annual/PTO");
  });

  it("formats a date-only param without shifting the day", () => {
    // "2027-03-01" is a calendar date, not an instant. Parsing it to a Date
    // and formatting in a zone is the exact UTC-shift bug this codebase has
    // already fixed twice elsewhere.
    expect(renderNotification(leaveApproved, "vi").message).toContain("01/03/2027");
    expect(renderNotification(leaveApproved, "en").message).toContain("Mar 1, 2027");
  });

  it("falls back to the stored English literal for an unknown key", () => {
    // Keys outside the policy's categories were never mirrored. Degrading to
    // the English literal keeps the message readable instead of empty.
    const { title, message } = renderNotification(
      { titleKey: "employeeAdded", messageKey: "employeeAdded", title: "New employee added", message: "Dev One was added." },
      "vi",
    );
    expect(title).toBe("New employee added");
    expect(message).toBe("Dev One was added.");
  });

  it("uses the stored literals for hand-composed notices, which carry no keys", () => {
    const { title, message } = renderNotification({ title: "Office closed", message: "Friday" }, "vi");
    expect(title).toBe("Office closed");
    expect(message).toBe("Friday");
  });

  it("leaves an unresolvable placeholder visible rather than blanking it", () => {
    const { message } = renderNotification(
      { messageKey: "leaveRejectedWithNote", message: "fallback", params: {} },
      "en",
    );
    // A visible "{{note}}" gets reported; a silent gap does not.
    expect(message).toContain("{{note}}");
  });

  it("handles a null document", () => {
    expect(renderNotification(null, "en")).toEqual({ title: "", message: "" });
  });
});

describe("languageFor", () => {
  it("uses the stored preference when it is one we ship", () => {
    expect(languageFor({ language: "vi" })).toBe("vi");
    expect(languageFor({ language: "en" })).toBe("en");
  });

  it("falls back to English for a missing or unknown language", () => {
    expect(languageFor({})).toBe("en");
    expect(languageFor({ language: "fr" })).toBe("en");
    expect(languageFor(null)).toBe("en");
  });
});

describe("openInAppLabel", () => {
  it("is translated, since it appears on the message itself", () => {
    expect(openInAppLabel("en")).toBe("Open in HRMS");
    expect(openInAppLabel("vi")).toBe("Mở trong HRMS");
  });
});

describe("drift from the frontend copy", () => {
  it.each(["en", "vi"])("%s: every mirrored string matches the frontend exactly", (lang) => {
    const source = frontend(lang).notifications.generated;
    const mirror = backend(lang).generated;

    // The backend bundle is a hand-picked SUBSET, generated from these files.
    // If someone edits the wording in the frontend, the Telegram message
    // silently keeps the old text — this is the only thing that would notice.
    for (const [key, value] of Object.entries(mirror)) {
      expect(source[key], `${key} missing from frontend ${lang}`).toBeDefined();
      expect(value, `${key} drifted in ${lang}`).toEqual(source[key]);
    }
  });

  it.each(["en", "vi"])("%s: label sets match the frontend", (lang) => {
    const src = frontend(lang);
    expect(backend(lang).labels.leaveType).toEqual(src.common.leaveType);
    expect(backend(lang).labels.resolution).toEqual(src.notifications.generated.resolutionLabels);
  });

  it("en and vi mirror exactly the same keys", () => {
    expect(Object.keys(backend("en").generated).sort()).toEqual(
      Object.keys(backend("vi").generated).sort(),
    );
  });

  it("covers every key the out-of-app categories can actually emit", () => {
    // The mirror only needs the categories notifyPolicy lets out. This ties
    // the two together: widen the policy and this points at the gap.
    const outOfApp = ["leave", "performance"].filter((c) => channelsFor(c).includes("telegram"));
    expect(outOfApp).toEqual(["leave", "performance"]);

    const mirrored = Object.keys(backend("en").generated);
    for (const key of ["leaveApproved", "leaveRejected", "leaveRequestSubmitted", "appealResolved"]) {
      expect(mirrored).toContain(key);
    }
  });
});
