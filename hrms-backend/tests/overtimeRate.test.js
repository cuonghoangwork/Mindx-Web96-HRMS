/**
 * overtimeRate.test.js — Attendance Overtime, milestone M1.
 *
 * Written before the engine, deliberately: a wrong multiplier or an
 * off-by-one at the 22:00 night boundary is invisible in the UI and would
 * sail straight through a demo. This file is the reviewer.
 *
 * Pure functions only — no DB, no network, same shape as workday.test.js.
 */

import { describe, it, expect } from "vitest";
import {
  END_OF_DAY,
  OT_MULTIPLIERS,
  overtimeHourlyRateVnd,
  overtimePayVnd,
  parseHHMMEnd,
  resolveDayType,
  splitDayNight,
} from "../utils/overtimeRate.js";
import { parseHHMM } from "../utils/workday.js";

describe("parseHHMMEnd", () => {
  it("accepts the end-of-day sentinel that parseHHMM rejects", () => {
    expect(parseHHMMEnd(END_OF_DAY)).toBe(1440);
    expect(parseHHMMEnd("24:00")).toBe(1440);
  });

  it("otherwise behaves exactly like parseHHMM", () => {
    for (const value of ["00:00", "09:15", "18:00", "22:00", "9:05"]) {
      expect(parseHHMMEnd(value)).toBe(parseHHMM(value));
    }
  });

  it("still rejects everything else parseHHMM rejects", () => {
    expect(() => parseHHMMEnd("25:00")).toThrow(/Invalid HH:MM/);
    expect(() => parseHHMMEnd("12:60")).toThrow(/Invalid HH:MM/);
    expect(() => parseHHMMEnd("abc")).toThrow(/Invalid HH:MM/);
    expect(() => parseHHMMEnd(undefined)).toThrow(/Invalid HH:MM/);
  });

  /**
   * The guard for the decision in HRMS_OVERTIME_PLAN.md §3.1.1: the sentinel
   * is confined to the overtime helpers on purpose. Folding it into
   * parseHHMM would also make `checkIn: "24:00"` legal, which is meaningless
   * — workday.test.js:27 pins the strict behavior and must stay green.
   */
  it("did not leak the sentinel into the shared parseHHMM", () => {
    expect(() => parseHHMM("24:00")).toThrow(/Invalid HH:MM/);
  });
});

describe("resolveDayType", () => {
  // 2026-07-25 is a Saturday, 2026-07-26 a Sunday, 2026-07-23 a Thursday.
  it("is 'normal' on a plain weekday", () => {
    expect(resolveDayType("2026-07-23", { isHoliday: false })).toBe("normal");
  });

  it("is 'restDay' on Saturday and Sunday", () => {
    expect(resolveDayType("2026-07-25", { isHoliday: false })).toBe("restDay");
    expect(resolveDayType("2026-07-26", { isHoliday: false })).toBe("restDay");
  });

  it("is 'holiday' on a public holiday", () => {
    expect(resolveDayType("2026-07-23", { isHoliday: true })).toBe("holiday");
  });

  it("prefers 'holiday' over 'restDay' for a holiday that falls on a Saturday", () => {
    // 300% beats 200%, and a public holiday does not stop being one because
    // it landed on a weekend. The order of the checks in resolveDayType is
    // the entire content of this test.
    expect(resolveDayType("2026-07-25", { isHoliday: true })).toBe("holiday");
  });

  it("defaults isHoliday to false rather than throwing", () => {
    expect(resolveDayType("2026-07-23")).toBe("normal");
    expect(resolveDayType("2026-07-25")).toBe("restDay");
  });
});

describe("OT_MULTIPLIERS", () => {
  it("matches the statutory table (Art. 98 + Decree 145/2020 Art. 57)", () => {
    expect(OT_MULTIPLIERS.normal.day).toBe(1.5);
    expect(OT_MULTIPLIERS.normal.night).toBe(2.1);
    expect(OT_MULTIPLIERS.restDay.day).toBe(2.0);
    expect(OT_MULTIPLIERS.restDay.night).toBe(2.7);
    expect(OT_MULTIPLIERS.holiday.day).toBe(3.0);
    expect(OT_MULTIPLIERS.holiday.night).toBe(3.9);
  });

  it("derives each night rate as day + 30% + 20% of the day rate", () => {
    // Decree 145/2020 Art. 57: OT rate + 30% night premium + 20% of the OT rate.
    for (const [dayType, m] of Object.entries(OT_MULTIPLIERS)) {
      expect(m.night, dayType).toBeCloseTo(m.day + 0.3 + 0.2 * m.day, 10);
    }
  });

  it("covers exactly the three day types resolveDayType can return", () => {
    expect(Object.keys(OT_MULTIPLIERS).sort()).toEqual(["holiday", "normal", "restDay"]);
  });
});

describe("splitDayNight", () => {
  it("counts a whole weekday overtime window as daytime", () => {
    expect(splitDayNight("18:00", "22:00")).toEqual({ dayMinutes: 240, nightMinutes: 0 });
  });

  it("splits a full rest-day span at the 22:00 boundary", () => {
    expect(splitDayNight("12:00", "24:00")).toEqual({ dayMinutes: 600, nightMinutes: 120 });
  });

  it("counts a span entirely inside the night window as night", () => {
    expect(splitDayNight("22:00", "24:00")).toEqual({ dayMinutes: 0, nightMinutes: 120 });
  });

  it("splits a span straddling 22:00 — the off-by-one catcher", () => {
    expect(splitDayNight("21:30", "22:30")).toEqual({ dayMinutes: 30, nightMinutes: 30 });
  });

  it("treats a span ending exactly at 22:00 as fully daytime", () => {
    expect(splitDayNight("21:00", "22:00")).toEqual({ dayMinutes: 60, nightMinutes: 0 });
  });

  it("always accounts for every minute of the span", () => {
    const spans = [
      ["18:00", "22:00"], ["12:00", "24:00"], ["22:00", "24:00"],
      ["21:30", "22:30"], ["06:00", "23:59"], ["00:00", "24:00"],
    ];
    for (const [start, end] of spans) {
      const { dayMinutes, nightMinutes } = splitDayNight(start, end);
      const total = parseHHMMEnd(end) - parseHHMM(start);
      expect(dayMinutes + nightMinutes, `${start}-${end}`).toBe(total);
      expect(dayMinutes).toBeGreaterThanOrEqual(0);
      expect(nightMinutes).toBeGreaterThanOrEqual(0);
    }
  });

  it("rejects a span that would cross midnight instead of silently returning 0", () => {
    // hoursBetween() would quietly return 0 here (Math.max(0, …) in
    // workday.js) — the whole point of the explicit throw.
    expect(() => splitDayNight("20:00", "01:00")).toThrow(/cross midnight/i);
    expect(() => splitDayNight("22:00", "22:00")).toThrow(/cross midnight/i);
  });

  it("attaches the OT_CROSSES_MIDNIGHT code and a 400 status", () => {
    try {
      splitDayNight("20:00", "01:00");
      throw new Error("expected splitDayNight to throw");
    } catch (err) {
      expect(err.code).toBe("OT_CROSSES_MIDNIGHT");
      expect(err.status).toBe(400);
    }
  });

  it("rejects a span that starts at end-of-day", () => {
    expect(() => splitDayNight("24:00", "24:00")).toThrow(/Invalid HH:MM/);
  });
});

describe("overtimeHourlyRateVnd", () => {
  it("divides the base salary by the month's standard working hours", () => {
    // 2026-01 has 22 standard working days → 176 hours.
    expect(overtimeHourlyRateVnd({ baseSalary: 15_000_000, year: 2026, month: 1 })).toBe(85_227);
  });

  it("rounds to whole VND, matching autoDeductionVnd's daily-rate convention", () => {
    const rate = overtimeHourlyRateVnd({ baseSalary: 15_000_000, year: 2026, month: 1 });
    expect(Number.isInteger(rate)).toBe(true);
  });

  it("returns 0 for a missing or non-positive base salary", () => {
    expect(overtimeHourlyRateVnd({ baseSalary: 0, year: 2026, month: 1 })).toBe(0);
    expect(overtimeHourlyRateVnd({ year: 2026, month: 1 })).toBe(0);
    expect(overtimeHourlyRateVnd({ baseSalary: -5, year: 2026, month: 1 })).toBe(0);
  });

  it("rejects an invalid month rather than inventing a denominator", () => {
    expect(() => overtimeHourlyRateVnd({ baseSalary: 15_000_000, year: 2026, month: 13 }))
      .toThrow(/Invalid year\/month/);
  });
});

describe("overtimePayVnd", () => {
  const hourlyRate = 85_227; // §4's worked example

  it("prices a weekday evening at 150%", () => {
    expect(overtimePayVnd({ hourlyRate, dayType: "normal", startHHMM: "18:00", endHHMM: "22:00" }))
      .toBe(511_362);
  });

  it("prices a full rest day at 200% plus a 270% night tail", () => {
    // 10h × 85,227 × 2.00 = 1,704,540 ; 2h × 85,227 × 2.70 = 460,225.8
    expect(overtimePayVnd({ hourlyRate, dayType: "restDay", startHHMM: "12:00", endHHMM: "24:00" }))
      .toBe(2_164_766);
  });

  it("reproduces the worked example's monthly total exactly", () => {
    const tuesday = overtimePayVnd({ hourlyRate, dayType: "normal", startHHMM: "18:00", endHHMM: "22:00" });
    const saturday = overtimePayVnd({ hourlyRate, dayType: "restDay", startHHMM: "12:00", endHHMM: "24:00" });
    expect(tuesday + saturday).toBe(2_676_128);
  });

  it("prices a public holiday above a rest day above a working day", () => {
    const span = { hourlyRate, startHHMM: "18:00", endHHMM: "22:00" };
    const normal = overtimePayVnd({ ...span, dayType: "normal" });
    const restDay = overtimePayVnd({ ...span, dayType: "restDay" });
    const holiday = overtimePayVnd({ ...span, dayType: "holiday" });
    expect(restDay).toBeGreaterThan(normal);
    expect(holiday).toBeGreaterThan(restDay);
  });

  it("pays the night premium for the night portion only", () => {
    const allDay = overtimePayVnd({ hourlyRate, dayType: "restDay", startHHMM: "20:00", endHHMM: "22:00" });
    const allNight = overtimePayVnd({ hourlyRate, dayType: "restDay", startHHMM: "22:00", endHHMM: "24:00" });
    expect(allNight).toBeGreaterThan(allDay);
    expect(allNight / allDay).toBeCloseTo(2.7 / 2.0, 4);
  });

  it("returns a whole number of VND", () => {
    const spans = [["18:00", "22:00"], ["12:00", "24:00"], ["21:30", "22:30"]];
    for (const dayType of ["normal", "restDay", "holiday"]) {
      for (const [startHHMM, endHHMM] of spans) {
        const pay = overtimePayVnd({ hourlyRate, dayType, startHHMM, endHHMM });
        expect(Number.isInteger(pay), `${dayType} ${startHHMM}-${endHHMM}`).toBe(true);
      }
    }
  });

  it("rejects an unknown day type rather than silently paying nothing", () => {
    expect(() =>
      overtimePayVnd({ hourlyRate, dayType: "weekend", startHHMM: "18:00", endHHMM: "22:00" }),
    ).toThrow(/day type/i);
  });

  it("propagates the midnight guard", () => {
    expect(() =>
      overtimePayVnd({ hourlyRate, dayType: "restDay", startHHMM: "20:00", endHHMM: "01:00" }),
    ).toThrow(/cross midnight/i);
  });

  it("returns 0 for a zero or invalid hourly rate", () => {
    const span = { dayType: "normal", startHHMM: "18:00", endHHMM: "22:00" };
    expect(overtimePayVnd({ ...span, hourlyRate: 0 })).toBe(0);
    expect(overtimePayVnd({ ...span })).toBe(0);
  });
});
