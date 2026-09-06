/**
 * attendance.test.js — the two time helpers the overtime UI depends on.
 *
 * Both exist because of the same class of bug the backend had to design
 * around: reading a wall clock from the wrong timezone, and comparing "HH:MM"
 * strings that are not zero-padded. Neither failure is visible — the chip just
 * shows the wrong thing, or nothing.
 */

import { describe, it, expect } from "vitest";
import { hhmmOf, hhmmToMinutes, isoOf, APP_TIMEZONE } from "./attendance";

describe("hhmmOf", () => {
  it("reads the company timezone, not the browser's", () => {
    // 06:01 UTC is 13:01 in Asia/Ho_Chi_Minh. A browser in another zone must
    // not send its own wall clock: the server evaluates the overtime cutoff
    // against company time.
    expect(hhmmOf(new Date("2026-07-23T06:01:00.000Z"))).toBe("13:01");
    expect(hhmmOf(new Date("2026-07-23T02:00:00.000Z"))).toBe("09:00");
  });

  it("is pinned to Asia/Ho_Chi_Minh unless overridden at build time", () => {
    expect(APP_TIMEZONE).toBe("Asia/Ho_Chi_Minh");
  });

  it("zero-pads and uses a 24-hour clock", () => {
    expect(hhmmOf(new Date("2026-07-23T02:05:00.000Z"))).toBe("09:05");
    expect(hhmmOf(new Date("2026-07-23T16:00:00.000Z"))).toBe("23:00");
  });

  it("renders midnight as 00:00, never 24:00", () => {
    // hour12:false renders midnight as "24:00" in some runtimes, and the
    // backend's parseHHMM rejects that — hourCycle "h23" is why this holds.
    expect(hhmmOf(new Date("2026-07-22T17:00:00.000Z"))).toBe("00:00");
  });
});

describe("hhmmToMinutes", () => {
  it("converts a padded time", () => {
    expect(hhmmToMinutes("00:00")).toBe(0);
    expect(hhmmToMinutes("09:15")).toBe(555);
    expect(hhmmToMinutes("18:00")).toBe(1080);
    expect(hhmmToMinutes("23:59")).toBe(1439);
  });

  it("handles an unpadded hour, which string comparison would get wrong", () => {
    // "9:05" > "18:00" lexically, but 545 < 1080. The overtime chip compares
    // the current time against a stored plannedStart, and the API accepts an
    // unpadded hour — so comparing as strings would light the chip at 9am.
    expect(hhmmToMinutes("9:05")).toBe(545);
    expect(hhmmToMinutes("9:05")).toBeLessThan(hhmmToMinutes("18:00"));
    expect("9:05" > "18:00").toBe(true); // the trap this avoids
  });

  it('accepts "24:00" only when the end-of-day sentinel is allowed', () => {
    expect(hhmmToMinutes("24:00")).toBeNull();
    expect(hhmmToMinutes("24:00", { allowEndOfDay: true })).toBe(1440);
  });

  it("returns null rather than throwing on anything malformed", () => {
    // Callers are rendering; a bad stored value should mean "no chip", not a
    // blank page.
    for (const bad of [undefined, null, "", "abc", "25:00", "12:60", "1200"]) {
      expect(hhmmToMinutes(bad), String(bad)).toBeNull();
    }
  });

  it("orders an overtime window correctly end to end", () => {
    const start = hhmmToMinutes("18:00");
    const end = hhmmToMinutes("24:00", { allowEndOfDay: true });
    const now = hhmmToMinutes(hhmmOf(new Date("2026-07-23T13:00:00.000Z"))); // 20:00 VN
    expect(now).toBeGreaterThanOrEqual(start);
    expect(now).toBeLessThan(end);
  });
});

describe("isoOf", () => {
  it("formats a local date key without the UTC round-trip", () => {
    // Deliberately not toISOString().split("T")[0], which rolls back a day for
    // any local-midnight Date in a zone ahead of UTC.
    const d = new Date(2026, 6, 23, 0, 0, 0);
    expect(isoOf(d)).toBe("2026-07-23");
  });

  it("zero-pads month and day", () => {
    expect(isoOf(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
