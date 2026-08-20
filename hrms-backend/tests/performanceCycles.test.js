import { describe, it, expect } from "vitest";
import {
  APPEAL_WINDOW_DAYS,
  appealDeadlineKey,
  appealWindowDaysElapsed,
  halfOf,
  isWithinAppealWindow,
  previousHalf,
  rollingStandardCycles,
  standardCycleKey,
  standardCycleLabel,
  standardCycleWindow,
  STANDARD_KEY_RE,
} from "../utils/performanceCycles.js";

describe("standard cycle keys, labels and windows", () => {
  it("formats keys and labels", () => {
    expect(standardCycleKey(2026, 1)).toBe("2026-h1");
    expect(standardCycleKey(2026, 2)).toBe("2026-h2");
    expect(standardCycleLabel(2026, 1)).toBe("H1 2026");
    expect(standardCycleLabel(2025, 2)).toBe("H2 2025");
  });

  it("accepts every generated key against STANDARD_KEY_RE", () => {
    for (const year of [2024, 2026, 2030]) {
      for (const half of [1, 2]) {
        expect(STANDARD_KEY_RE.test(standardCycleKey(year, half))).toBe(true);
      }
    }
    expect(STANDARD_KEY_RE.test("custom-1771234567890")).toBe(false);
    expect(STANDARD_KEY_RE.test("2026-h3")).toBe(false);
    expect(STANDARD_KEY_RE.test("26-h1")).toBe(false);
  });

  it("builds H1 and H2 windows on exact UTC boundaries", () => {
    const h1 = standardCycleWindow(2026, 1);
    expect(h1.start.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(h1.end.toISOString()).toBe("2026-06-30T23:59:59.999Z");

    const h2 = standardCycleWindow(2026, 2);
    expect(h2.start.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(h2.end.toISOString()).toBe("2026-12-31T23:59:59.999Z");
  });

  it("leaves no gap or overlap between consecutive windows", () => {
    const h1End = standardCycleWindow(2026, 1).end.getTime();
    const h2Start = standardCycleWindow(2026, 2).start.getTime();
    expect(h2Start - h1End).toBe(1);

    const h2End = standardCycleWindow(2026, 2).end.getTime();
    const nextStart = standardCycleWindow(2027, 1).start.getTime();
    expect(nextStart - h2End).toBe(1);
  });
});

describe("halfOf", () => {
  it("splits the year at the end of June", () => {
    expect(halfOf(new Date("2026-01-01T00:00:00.000Z"))).toEqual({ year: 2026, half: 1 });
    expect(halfOf(new Date("2026-06-30T12:00:00.000Z"))).toEqual({ year: 2026, half: 1 });
    expect(halfOf(new Date("2026-07-01T12:00:00.000Z"))).toEqual({ year: 2026, half: 2 });
    expect(halfOf(new Date("2026-12-31T12:00:00.000Z"))).toEqual({ year: 2026, half: 2 });
  });

  it("reads the boundary in UTC, not local time", () => {
    expect(halfOf(new Date("2026-06-30T23:30:00.000Z")).half).toBe(1);
    expect(halfOf(new Date("2026-07-01T00:30:00.000Z")).half).toBe(2);
    expect(halfOf(new Date("2026-12-31T23:30:00.000Z"))).toEqual({ year: 2026, half: 2 });
    expect(halfOf(new Date("2027-01-01T00:30:00.000Z"))).toEqual({ year: 2027, half: 1 });
  });
});

describe("previousHalf", () => {
  it("steps back within a year and across a year boundary", () => {
    expect(previousHalf({ year: 2026, half: 2 })).toEqual({ year: 2026, half: 1 });
    expect(previousHalf({ year: 2026, half: 1 })).toEqual({ year: 2025, half: 2 });
  });
});

describe("rollingStandardCycles", () => {
  it("returns two closed cycles then the open one, oldest first", () => {
    const cycles = rollingStandardCycles(new Date("2026-08-20T00:00:00.000Z"));
    expect(cycles.map((c) => c.key)).toEqual(["2025-h2", "2026-h1", "2026-h2"]);
    expect(cycles.map((c) => c.defaultStatus)).toEqual(["Closed", "Closed", "Open"]);
    expect(cycles.map((c) => c.label)).toEqual(["H2 2025", "H1 2026", "H2 2026"]);
  });

  it("rolls back across the year boundary in January", () => {
    const cycles = rollingStandardCycles(new Date("2026-01-05T00:00:00.000Z"));
    expect(cycles.map((c) => c.key)).toEqual(["2025-h1", "2025-h2", "2026-h1"]);
    expect(cycles.map((c) => c.defaultStatus)).toEqual(["Closed", "Closed", "Open"]);
  });

  it("marks exactly one cycle open and always carries a window", () => {
    for (const iso of [
      "2026-01-01T00:00:00.000Z",
      "2026-06-30T23:59:59.999Z",
      "2026-07-01T00:00:00.000Z",
      "2026-12-31T23:59:59.999Z",
    ]) {
      const cycles = rollingStandardCycles(new Date(iso));
      expect(cycles).toHaveLength(3);
      expect(cycles.filter((c) => c.defaultStatus === "Open")).toHaveLength(1);
      expect(cycles[cycles.length - 1].defaultStatus).toBe("Open");
      for (const cycle of cycles) {
        expect(cycle.start.getTime()).toBeLessThan(cycle.end.getTime());
      }
    }
  });

  it("keeps the open cycle's window around the instant it was computed for", () => {
    const asOf = new Date("2026-09-15T08:00:00.000Z");
    const open = rollingStandardCycles(asOf).find((c) => c.defaultStatus === "Open");
    expect(open.start.getTime()).toBeLessThanOrEqual(asOf.getTime());
    expect(open.end.getTime()).toBeGreaterThanOrEqual(asOf.getTime());
  });
});

describe("appeal window", () => {
  const submitted = new Date("2026-08-20T10:00:00.000Z");

  it("counts whole UTC calendar days", () => {
    expect(appealWindowDaysElapsed(submitted, new Date("2026-08-20T23:00:00.000Z"))).toBe(0);
    expect(appealWindowDaysElapsed(submitted, new Date("2026-08-21T00:10:00.000Z"))).toBe(1);
    expect(appealWindowDaysElapsed(submitted, new Date("2026-09-03T00:10:00.000Z"))).toBe(14);
    expect(appealWindowDaysElapsed(submitted, new Date("2026-09-04T00:10:00.000Z"))).toBe(15);
  });

  it("includes day 14 and rejects day 15", () => {
    expect(isWithinAppealWindow(submitted, new Date("2026-08-20T10:00:00.000Z"))).toBe(true);
    expect(isWithinAppealWindow(submitted, new Date("2026-09-03T23:59:59.000Z"))).toBe(true);
    expect(isWithinAppealWindow(submitted, new Date("2026-09-04T00:00:00.000Z"))).toBe(false);
  });

  it("uses calendar days, not a millisecond delta", () => {
    const lateSubmit = new Date("2026-08-20T23:50:00.000Z");
    const early = new Date("2026-09-03T00:10:00.000Z");
    expect((early.getTime() - lateSubmit.getTime()) / 86400000).toBeLessThan(14);
    expect(appealWindowDaysElapsed(lateSubmit, early)).toBe(14);
    expect(isWithinAppealWindow(lateSubmit, early)).toBe(true);
  });

  it("rejects a missing or future submission date", () => {
    expect(isWithinAppealWindow(null)).toBe(false);
    expect(isWithinAppealWindow(undefined)).toBe(false);
    expect(isWithinAppealWindow("")).toBe(false);
    expect(isWithinAppealWindow("not a date")).toBe(false);
    expect(isWithinAppealWindow(submitted, new Date("2026-08-19T10:00:00.000Z"))).toBe(false);
  });

  it("reports the deadline as a UTC date key exactly 14 days out", () => {
    expect(appealDeadlineKey(submitted)).toBe("2026-09-03");
    expect(appealDeadlineKey(new Date("2026-12-25T23:59:00.000Z"))).toBe("2027-01-08");
    expect(appealDeadlineKey(null)).toBe(null);
    expect(appealDeadlineKey("not a date")).toBe(null);
  });

  it("agrees with isWithinAppealWindow at the deadline it publishes", () => {
    const deadline = appealDeadlineKey(submitted);
    expect(isWithinAppealWindow(submitted, new Date(`${deadline}T23:59:59.999Z`))).toBe(true);
    expect(isWithinAppealWindow(submitted, new Date(`${deadline}T00:00:00.000Z`))).toBe(true);
    expect(APPEAL_WINDOW_DAYS).toBe(14);
  });
});
