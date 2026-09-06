/**
 * overtimePay.test.js — Attendance Overtime, milestone M5.
 *
 * Pure aggregation: attendance rows in, one payable figure plus its breakdown
 * out. No DB, no network.
 *
 * The anchor case is HRMS_OVERTIME_PLAN.md §4's worked example, reproduced to
 * the exact VND. A wrong multiplier or a mis-split night portion is invisible
 * in the UI and would only ever show up as an employee being underpaid, so it
 * gets pinned against a figure computed by hand.
 */

import { describe, it, expect } from "vitest";
import { computeOvertimePay, overtimeSegments } from "../utils/overtimePay.js";

/** 2026-01 has 22 standard working days -> 176h -> 15,000,000/176 = 85,227/h. */
const PERIOD = { baseSalary: 15_000_000, year: 2026, month: 1 };

const row = (otMinutes, otNightMinutes, otDayType) => ({ otMinutes, otNightMinutes, otDayType });

describe("computeOvertimePay — the worked example (plan §4)", () => {
  const attendanceRows = [
    row(240, 0, "normal"), // Tuesday 18:00-22:00
    row(720, 120, "restDay"), // Saturday 12:00-24:00
  ];

  it("reproduces the monthly total to the exact VND", () => {
    const result = computeOvertimePay({ ...PERIOD, attendanceRows });
    expect(result.hourlyRate).toBe(85_227);
    expect(result.pay).toBe(2_676_128);
  });

  it("reports 16 overtime hours, 2 of them at night", () => {
    const result = computeOvertimePay({ ...PERIOD, attendanceRows });
    expect(result.hours).toBe(16);
    expect(result.nightHours).toBe(2);
    expect(result.minutes).toBe(960);
    expect(result.nightMinutes).toBe(120);
  });

  it("splits the breakdown by day type", () => {
    const { breakdown } = computeOvertimePay({ ...PERIOD, attendanceRows });
    expect(breakdown.normal).toEqual({ dayMinutes: 240, nightMinutes: 0, pay: 511_362 });
    expect(breakdown.restDay).toEqual({ dayMinutes: 600, nightMinutes: 120, pay: 2_164_766 });
    expect(breakdown.holiday).toEqual({ dayMinutes: 0, nightMinutes: 0, pay: 0 });
  });

  it("keeps the breakdown summing to the headline figure exactly", () => {
    // Each day is rounded and then summed, never summed then rounded — so a
    // payslip's sub-line can never disagree with its own total.
    const { pay, breakdown } = computeOvertimePay({ ...PERIOD, attendanceRows });
    const summed = breakdown.normal.pay + breakdown.restDay.pay + breakdown.holiday.pay;
    expect(summed).toBe(pay);
  });

  it("produces the payslip line's segments", () => {
    const { breakdown } = computeOvertimePay({ ...PERIOD, attendanceRows });
    expect(overtimeSegments(breakdown).map((s) => `${s.percent}% x ${s.hours}h`)).toEqual([
      "150% x 4h",
      "200% x 10h",
      "270% x 2h",
    ]);
  });
});

describe("computeOvertimePay — what it must not pay for", () => {
  it("ignores unapproved overtime entirely", () => {
    // The whole point of the approval queue: recorded, flagged, never paid.
    const result = computeOvertimePay({
      ...PERIOD,
      attendanceRows: [{ otMinutes: 0, otNightMinutes: 0, otUnapprovedMinutes: 480, otDayType: "restDay" }],
    });
    expect(result.pay).toBe(0);
    expect(result.hours).toBe(0);
  });

  it("skips a row with no day type rather than guessing", () => {
    // Guessing "normal" would underpay a rest day by a third, silently.
    const result = computeOvertimePay({
      ...PERIOD,
      attendanceRows: [row(240, 0, null), row(240, 0, "normal")],
    });
    expect(result.pay).toBe(511_362); // only the priced row
    expect(result.hours).toBe(4);
  });

  it("skips a row with an unrecognised day type", () => {
    const result = computeOvertimePay({ ...PERIOD, attendanceRows: [row(240, 0, "weekend")] });
    expect(result.pay).toBe(0);
  });

  it("returns a zeroed result for no rows at all", () => {
    const result = computeOvertimePay({ ...PERIOD, attendanceRows: [] });
    expect(result.pay).toBe(0);
    expect(result.hours).toBe(0);
    expect(result.breakdown.normal.pay).toBe(0);
    expect(overtimeSegments(result.breakdown)).toEqual([]);
  });

  it("returns zero pay when there is no salary to price against", () => {
    const result = computeOvertimePay({
      baseSalary: 0, year: 2026, month: 1, attendanceRows: [row(240, 0, "normal")],
    });
    expect(result.hourlyRate).toBe(0);
    expect(result.pay).toBe(0);
    // The hours still count — they were worked and approved, they just cannot
    // be priced without a salary.
    expect(result.hours).toBe(4);
  });

  it("clamps night minutes that exceed the total rather than paying twice", () => {
    // Defensive: a corrupt row must not produce negative day minutes and a
    // larger total than the hours actually worked.
    const result = computeOvertimePay({ ...PERIOD, attendanceRows: [row(120, 300, "restDay")] });
    expect(result.breakdown.restDay.dayMinutes).toBe(0);
    expect(result.breakdown.restDay.nightMinutes).toBe(120);
    expect(result.pay).toBe(Math.round(2 * 85_227 * 2.7));
  });
});

describe("computeOvertimePay — rates", () => {
  const oneHour = (dayType) =>
    computeOvertimePay({ ...PERIOD, attendanceRows: [row(60, 0, dayType)] }).pay;

  it("prices a holiday above a rest day above a working day", () => {
    expect(oneHour("normal")).toBe(Math.round(85_227 * 1.5));
    expect(oneHour("restDay")).toBe(Math.round(85_227 * 2.0));
    expect(oneHour("holiday")).toBe(Math.round(85_227 * 3.0));
    expect(oneHour("holiday")).toBeGreaterThan(oneHour("restDay"));
    expect(oneHour("restDay")).toBeGreaterThan(oneHour("normal"));
  });

  it("pays the night premium only for the night portion", () => {
    const allDay = computeOvertimePay({ ...PERIOD, attendanceRows: [row(120, 0, "restDay")] }).pay;
    const allNight = computeOvertimePay({ ...PERIOD, attendanceRows: [row(120, 120, "restDay")] }).pay;
    expect(allNight / allDay).toBeCloseTo(2.7 / 2.0, 4);
  });

  it("accumulates many days without drifting", () => {
    const rows = Array.from({ length: 10 }, () => row(240, 0, "normal"));
    const result = computeOvertimePay({ ...PERIOD, attendanceRows: rows });
    expect(result.hours).toBe(40); // exactly the monthly cap
    expect(result.pay).toBe(511_362 * 10);
    expect(Number.isInteger(result.pay)).toBe(true);
  });
});
