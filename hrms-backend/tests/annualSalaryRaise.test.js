import { describe, it, expect } from "vitest";
import { ANNUAL_RAISE_RATE, anniversaryOf } from "../jobs/annualSalaryRaise.js";

describe("ANNUAL_RAISE_RATE", () => {
  it("is ten percent", () => {
    expect(ANNUAL_RAISE_RATE).toBe(0.1);
    expect(Math.round(50_000 * (1 + ANNUAL_RAISE_RATE))).toBe(55_000);
  });
});

describe("anniversaryOf", () => {
  it("adds whole years and normalises to the start of the day", () => {
    const anniversary = anniversaryOf(new Date(2024, 6, 15, 10, 30), 2);
    expect(anniversary.getFullYear()).toBe(2026);
    expect(anniversary.getMonth()).toBe(6);
    expect(anniversary.getDate()).toBe(15);
    expect(anniversary.getHours()).toBe(0);
    expect(anniversary.getMinutes()).toBe(0);
    expect(anniversary.getSeconds()).toBe(0);
    expect(anniversary.getMilliseconds()).toBe(0);
  });

  it("lands before a same-day job run so the dedup predicate matches", () => {
    const hiredAt = new Date(2025, 3, 20, 10, 0);
    const jobRanAt = new Date(2026, 3, 20, 4, 0);
    expect(anniversaryOf(hiredAt, 1).getTime()).toBeLessThanOrEqual(jobRanAt.getTime());
  });

  it("does not mutate the date it is given", () => {
    const hiredAt = new Date(2025, 3, 20, 10, 0);
    const snapshot = hiredAt.getTime();
    anniversaryOf(hiredAt, 3);
    expect(hiredAt.getTime()).toBe(snapshot);
  });

  it("rolls a 29 February hire to 1 March in a non-leap year", () => {
    const anniversary = anniversaryOf(new Date(2024, 1, 29, 9, 0), 1);
    expect(anniversary.getMonth()).toBe(2);
    expect(anniversary.getDate()).toBe(1);
  });
});
