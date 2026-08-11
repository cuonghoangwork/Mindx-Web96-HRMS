import { describe, it, expect } from "vitest";
import { targetMonthOf } from "../jobs/runMonthlyPayroll.js";

describe("targetMonthOf", () => {
  it("targets the previous calendar month", () => {
    expect(targetMonthOf(new Date(2026, 2, 10))).toEqual({ year: 2026, month: 2 });
    expect(targetMonthOf(new Date(2026, 7, 10))).toEqual({ year: 2026, month: 7 });
    expect(targetMonthOf(new Date(2026, 11, 10))).toEqual({ year: 2026, month: 11 });
  });

  it("rolls back to December of the prior year in January", () => {
    expect(targetMonthOf(new Date(2027, 0, 10))).toEqual({ year: 2026, month: 12 });
    expect(targetMonthOf(new Date(2027, 0, 1))).toEqual({ year: 2026, month: 12 });
    expect(targetMonthOf(new Date(2027, 0, 31))).toEqual({ year: 2026, month: 12 });
  });

  it("never carries the day of month into the next month", () => {
    expect(targetMonthOf(new Date(2026, 2, 31))).toEqual({ year: 2026, month: 2 });
    expect(targetMonthOf(new Date(2026, 4, 31))).toEqual({ year: 2026, month: 4 });
    expect(targetMonthOf(new Date(2026, 6, 31))).toEqual({ year: 2026, month: 6 });
  });

  it("is stable across every day of every month of a year", () => {
    for (let month = 0; month < 12; month += 1) {
      const daysInMonth = new Date(2026, month + 1, 0).getDate();
      for (let day = 1; day <= daysInMonth; day += 1) {
        const expected =
          month === 0 ? { year: 2025, month: 12 } : { year: 2026, month };
        expect(targetMonthOf(new Date(2026, month, day, 3))).toEqual(expected);
      }
    }
  });
});
