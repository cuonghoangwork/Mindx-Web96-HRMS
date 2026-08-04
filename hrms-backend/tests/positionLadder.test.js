import { describe, it, expect } from "vitest";
import {
  ELIGIBILITY_THRESHOLD_MONTHS,
  LEVEL_ORDER,
  computeEligibility,
  monthsBetween,
  nextLevel,
} from "../utils/positionLadder.js";

describe("LEVEL_ORDER / ELIGIBILITY_THRESHOLD_MONTHS", () => {
  it("matches the ladder defined in HRMS_IMPROVEMENT_TASKS.md 2.4", () => {
    expect(LEVEL_ORDER).toEqual(["Intern", "Full-time", "Senior", "Manager"]);
    expect(ELIGIBILITY_THRESHOLD_MONTHS).toEqual({
      Intern: 2,
      "Full-time": 48,
      Senior: 60,
    });
  });
});

describe("nextLevel", () => {
  it("returns the level one step up the ladder", () => {
    expect(nextLevel("Intern")).toBe("Full-time");
    expect(nextLevel("Full-time")).toBe("Senior");
    expect(nextLevel("Senior")).toBe("Manager");
  });

  it("returns null for Manager (top of the ladder)", () => {
    expect(nextLevel("Manager")).toBeNull();
  });

  it("returns null for an unrecognized level", () => {
    expect(nextLevel("Executive")).toBeNull();
    expect(nextLevel(undefined)).toBeNull();
  });
});

describe("monthsBetween", () => {
  it("counts whole calendar months elapsed", () => {
    expect(monthsBetween("2026-01-01", "2026-03-01")).toBe(2);
    expect(monthsBetween("2022-01-01", "2026-01-01")).toBe(48);
  });

  it("truncates rather than rounds an incomplete final month", () => {
    // Jan 15 -> Feb 10: the 15th hasn't been reached again, so 0 complete months
    expect(monthsBetween("2026-01-15", "2026-02-10")).toBe(0);
    // Jan 15 -> Feb 15: exactly 1 complete month
    expect(monthsBetween("2026-01-15", "2026-02-15")).toBe(1);
    // Jan 15 -> Feb 20: 1 complete month, a few days into the second
    expect(monthsBetween("2026-01-15", "2026-02-20")).toBe(1);
  });

  it("never returns negative months", () => {
    expect(monthsBetween("2026-06-01", "2026-01-01")).toBe(0);
  });
});

describe("computeEligibility", () => {
  it("flags an Intern eligible for Full-time after 2 complete months", () => {
    const result = computeEligibility("Intern", "2026-01-01", new Date("2026-03-01"));
    expect(result.eligible).toBe(true);
    expect(result.nextLevel).toBe("Full-time");
    expect(result.monthsInLevel).toBe(2);
    expect(result.thresholdMonths).toBe(2);
  });

  it("does not flag an Intern one day short of 2 months", () => {
    const result = computeEligibility("Intern", "2026-01-15", new Date("2026-03-10"));
    expect(result.eligible).toBe(false);
  });

  it("flags a Full-time employee eligible for Senior after 4 years", () => {
    const result = computeEligibility("Full-time", "2022-01-01", new Date("2026-01-01"));
    expect(result.eligible).toBe(true);
    expect(result.nextLevel).toBe("Senior");
    expect(result.monthsInLevel).toBe(48);
  });

  it("does not flag a Full-time employee at 3 years 11 months", () => {
    const result = computeEligibility("Full-time", "2022-02-01", new Date("2026-01-01"));
    expect(result.eligible).toBe(false);
  });

  it("flags a Senior employee eligible for Manager after 5 years", () => {
    const result = computeEligibility("Senior", "2021-01-01", new Date("2026-01-01"));
    expect(result.eligible).toBe(true);
    expect(result.nextLevel).toBe("Manager");
  });

  it("never flags a Manager — no next level exists", () => {
    const result = computeEligibility("Manager", "2010-01-01", new Date("2026-01-01"));
    expect(result.eligible).toBe(false);
    expect(result.nextLevel).toBeNull();
    expect(result.thresholdMonths).toBeNull();
  });

  it("is not eligible when levelStartDate is missing", () => {
    const result = computeEligibility("Intern", null, new Date("2026-01-01"));
    expect(result.eligible).toBe(false);
  });

  it("defaults asOf to now when not provided", () => {
    // Started an Intern well over 2 months ago relative to whenever this
    // test actually runs — just proves the default parameter path works.
    const longAgo = new Date();
    longAgo.setFullYear(longAgo.getFullYear() - 1);
    const result = computeEligibility("Intern", longAgo);
    expect(result.eligible).toBe(true);
  });
});
