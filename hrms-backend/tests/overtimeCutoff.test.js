/**
 * overtimeCutoff.test.js — Attendance Overtime, milestone M1.
 *
 * Covers the two halves of trap 2 (HRMS_OVERTIME_PLAN.md §5.2): the
 * timezone-aware application cutoff, and the DEMO_MODE-gated clock override.
 *
 * The load-bearing case is "container runs UTC". Render deploys this app in a
 * UTC container, so a naive new Date().getHours() reads 6 when it is 13:00 in
 * Vietnam and the cutoff never fires. Every assertion below builds its Date
 * from an explicit UTC instant so the test means the same thing regardless of
 * the machine it runs on.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isPastCutoff, hhmmInTz } from "../utils/overtimeCutoff.js";
import { serverNow } from "../utils/appNow.js";

// 2026-07-23 is a Thursday. Vietnam is UTC+7 year-round (no DST).
const OT_DATE = "2026-07-23";
const at = (utcIso) => new Date(utcIso);

describe("hhmmInTz", () => {
  it("reads the wall clock in the given zone, not the container's", () => {
    const instant = at("2026-07-23T06:01:00.000Z");
    expect(hhmmInTz(instant, "Asia/Ho_Chi_Minh")).toBe("13:01");
    expect(hhmmInTz(instant, "UTC")).toBe("06:01");
  });

  it("zero-pads and uses a 24-hour clock", () => {
    expect(hhmmInTz(at("2026-07-23T02:05:00.000Z"), "Asia/Ho_Chi_Minh")).toBe("09:05");
    expect(hhmmInTz(at("2026-07-23T16:00:00.000Z"), "Asia/Ho_Chi_Minh")).toBe("23:00");
    // Midnight must be 00:00, not 24:00 — Intl's hour12:false has a known
    // h24/h23 quirk that this pins.
    expect(hhmmInTz(at("2026-07-22T17:00:00.000Z"), "Asia/Ho_Chi_Minh")).toBe("00:00");
  });
});

describe("isPastCutoff", () => {
  it("accepts an application made in advance, at any hour", () => {
    // 23:59 Vietnam the day before the overtime date.
    expect(isPastCutoff(at("2026-07-22T16:59:00.000Z"), OT_DATE)).toBe(false);
    // …and a week ahead.
    expect(isPastCutoff(at("2026-07-16T06:00:00.000Z"), OT_DATE)).toBe(false);
  });

  it("accepts one minute before the cutoff on the overtime date", () => {
    // 12:59 Vietnam = 05:59 UTC.
    expect(isPastCutoff(at("2026-07-23T05:59:00.000Z"), OT_DATE)).toBe(false);
  });

  it("rejects one minute after the cutoff on the overtime date", () => {
    // 13:01 Vietnam = 06:01 UTC.
    expect(isPastCutoff(at("2026-07-23T06:01:00.000Z"), OT_DATE)).toBe(true);
  });

  it("rejects exactly at the cutoff — 13:00 is closed, not open", () => {
    expect(isPastCutoff(at("2026-07-23T06:00:00.000Z"), OT_DATE)).toBe(true);
  });

  it("rejects once the overtime date has passed", () => {
    expect(isPastCutoff(at("2026-07-24T01:00:00.000Z"), OT_DATE)).toBe(true);
  });

  /**
   * The regression test for §5.2(a). This is the bug the plan predicts you
   * are about to write: on a UTC container `new Date().getHours()` reads 6 at
   * 13:01 Vietnam time, so a naive implementation returns false and the
   * cutoff silently never fires in production.
   */
  it("fires on a UTC container — the naive getHours() implementation would not", () => {
    const thirteenOhOneVietnam = at("2026-07-23T06:01:00.000Z");

    expect(isPastCutoff(thirteenOhOneVietnam, OT_DATE)).toBe(true);

    // What a getHours()-based check would have seen in a UTC container.
    expect(thirteenOhOneVietnam.getUTCHours()).toBe(6);
    expect(thirteenOhOneVietnam.getUTCHours() >= 13).toBe(false);
  });

  it("uses the Vietnam calendar day, not the UTC one, to compare dates", () => {
    // 18:00 UTC on the 22nd is already 01:00 on the 23rd in Vietnam — before
    // the cutoff on the overtime date, so still acceptable.
    expect(isPastCutoff(at("2026-07-22T18:00:00.000Z"), OT_DATE)).toBe(false);

    // 18:00 UTC on the 23rd is 01:00 on the 24th in Vietnam — the date has
    // passed, even though the UTC day still reads 2026-07-23.
    expect(isPastCutoff(at("2026-07-23T18:00:00.000Z"), OT_DATE)).toBe(true);
  });

  it("honours an explicit timeZone override", () => {
    const instant = at("2026-07-23T06:01:00.000Z");
    expect(isPastCutoff(instant, OT_DATE, { timeZone: "Asia/Ho_Chi_Minh" })).toBe(true);
    // 06:01 UTC is before a 13:00 UTC cutoff.
    expect(isPastCutoff(instant, OT_DATE, { timeZone: "UTC" })).toBe(false);
  });

  it("honours an explicit cutoff override", () => {
    const instant = at("2026-07-23T05:59:00.000Z"); // 12:59 Vietnam
    expect(isPastCutoff(instant, OT_DATE, { cutoff: "13:00" })).toBe(false);
    expect(isPastCutoff(instant, OT_DATE, { cutoff: "12:00" })).toBe(true);
  });

  // Note: "HR can still assign past the cutoff" is deliberately NOT tested
  // here. isPastCutoff answers a question about time only; the role bypass
  // lives in the controller's validation order (§7.4, milestone M2).
});

describe("serverNow", () => {
  const HEADER_INSTANT = "2026-07-23T06:01:00.000Z";
  const reqWith = (value) => ({ get: (name) => (name === "X-App-Now" ? value : undefined) });

  let originalDemoMode;
  beforeEach(() => {
    originalDemoMode = process.env.DEMO_MODE;
  });
  afterEach(() => {
    if (originalDemoMode === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = originalDemoMode;
  });

  it("ignores the header entirely when DEMO_MODE is off", () => {
    delete process.env.DEMO_MODE;
    const before = Date.now();
    const now = serverNow(reqWith(HEADER_INSTANT));
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.toISOString()).not.toBe(HEADER_INSTANT);
  });

  it("ignores the header when DEMO_MODE is any value other than the literal 'true'", () => {
    for (const value of ["false", "1", "yes", "TRUE"]) {
      process.env.DEMO_MODE = value;
      expect(serverNow(reqWith(HEADER_INSTANT)).toISOString()).not.toBe(HEADER_INSTANT);
    }
  });

  it("honours the header when DEMO_MODE is on", () => {
    process.env.DEMO_MODE = "true";
    expect(serverNow(reqWith(HEADER_INSTANT)).toISOString()).toBe(HEADER_INSTANT);
  });

  it("falls back to real time when the header is absent or unparseable", () => {
    process.env.DEMO_MODE = "true";
    const before = Date.now();
    for (const value of [undefined, "", "not a date"]) {
      const now = serverNow(reqWith(value));
      expect(now.getTime()).toBeGreaterThanOrEqual(before);
    }
  });

  it("tolerates a request object with no get() at all", () => {
    process.env.DEMO_MODE = "true";
    const before = Date.now();
    expect(serverNow({}).getTime()).toBeGreaterThanOrEqual(before);
    expect(serverNow().getTime()).toBeGreaterThanOrEqual(before);
  });

  it("drives isPastCutoff end to end, so the demo can show both sides", () => {
    process.env.DEMO_MODE = "true";
    const before = serverNow(reqWith("2026-07-23T05:59:00.000Z")); // 12:59 VN
    const after = serverNow(reqWith("2026-07-23T06:01:00.000Z")); // 13:01 VN
    expect(isPastCutoff(before, OT_DATE)).toBe(false);
    expect(isPastCutoff(after, OT_DATE)).toBe(true);
  });
});
