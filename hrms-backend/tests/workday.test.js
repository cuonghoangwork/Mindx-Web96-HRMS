import { describe, it, expect } from "vitest";
import {
  dateKeyInTz,
  endOfUtcDay,
  hoursBetween,
  isLater,
  isWeekend,
  minutesBetween,
  parseHHMM,
  utcMidnight,
} from "../utils/workday.js";

describe("parseHHMM", () => {
  it("parses a valid time into minutes since midnight", () => {
    expect(parseHHMM("00:00")).toBe(0);
    expect(parseHHMM("09:15")).toBe(555);
    expect(parseHHMM("18:00")).toBe(1080);
    expect(parseHHMM("9:05")).toBe(545);
  });

  it("throws a readable error on malformed values", () => {
    expect(() => parseHHMM(undefined)).toThrow(/Invalid HH:MM/);
    expect(() => parseHHMM(null)).toThrow(/Invalid HH:MM/);
    expect(() => parseHHMM("")).toThrow(/Invalid HH:MM/);
    expect(() => parseHHMM("9:5")).toThrow(/Invalid HH:MM/);
    expect(() => parseHHMM("abc")).toThrow(/Invalid HH:MM/);
    expect(() => parseHHMM("24:00")).toThrow(/Invalid HH:MM/);
    expect(() => parseHHMM("12:60")).toThrow(/Invalid HH:MM/);
  });
});

describe("dateKeyInTz", () => {
  it("returns an ISO date key", () => {
    expect(dateKeyInTz(new Date("2026-07-23T10:00:00.000Z"), "UTC")).toBe("2026-07-23");
  });

  it("resolves to a different calendar day either side of the timezone boundary", () => {
    const evening = new Date("2026-07-23T18:00:00.000Z");
    expect(dateKeyInTz(evening, "UTC")).toBe("2026-07-23");
    expect(dateKeyInTz(evening, "Asia/Ho_Chi_Minh")).toBe("2026-07-24");
  });

  it("keeps the same day for a 22:00 Ho Chi Minh run", () => {
    const run = new Date("2026-07-23T15:00:00.000Z");
    expect(dateKeyInTz(run, "Asia/Ho_Chi_Minh")).toBe("2026-07-23");
    expect(dateKeyInTz(run, "UTC")).toBe("2026-07-23");
  });
});

describe("utcMidnight", () => {
  it("builds the exact UTC midnight the attendance mapper stores", () => {
    const d = utcMidnight("2026-07-23");
    expect(d.toISOString()).toBe("2026-07-23T00:00:00.000Z");
  });

  it("matches new Date(dateString) used by attendanceFromClient", () => {
    expect(utcMidnight("2026-01-05").getTime()).toBe(new Date("2026-01-05").getTime());
  });

  it("rejects anything that is not a plain date key", () => {
    expect(() => utcMidnight("23/07/2026")).toThrow(/Invalid date key/);
    expect(() => utcMidnight(undefined)).toThrow(/Invalid date key/);
  });
});

describe("endOfUtcDay", () => {
  it("returns the last millisecond of the day", () => {
    expect(endOfUtcDay("2026-07-23").toISOString()).toBe("2026-07-23T23:59:59.999Z");
  });
});

describe("isWeekend", () => {
  it("is true for Saturday and Sunday", () => {
    expect(isWeekend("2026-07-25")).toBe(true);
    expect(isWeekend("2026-07-26")).toBe(true);
  });

  it("is false Monday through Friday", () => {
    ["2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23", "2026-07-24"].forEach((key) => {
      expect(isWeekend(key)).toBe(false);
    });
  });
});

describe("minutesBetween / hoursBetween", () => {
  it("matches the formula used by attendanceController.checkOut", () => {
    const [h1, m1] = "09:00".split(":").map(Number);
    const [h2, m2] = "18:00".split(":").map(Number);
    const expected = Math.max(0, h2 * 60 + m2 - (h1 * 60 + m1)) / 60;
    expect(hoursBetween("09:00", "18:00")).toBe(expected);
    expect(hoursBetween("09:00", "18:00")).toBe(9);
  });

  it("handles partial hours", () => {
    expect(minutesBetween("09:15", "10:00")).toBe(45);
    expect(hoursBetween("09:30", "10:00")).toBe(0.5);
  });

  it("clamps to zero when check-out is earlier than check-in", () => {
    expect(hoursBetween("19:00", "18:00")).toBe(0);
    expect(minutesBetween("19:00", "18:00")).toBe(0);
  });
});

describe("isLater", () => {
  it("compares HH:MM values", () => {
    expect(isLater("09:16", "09:15")).toBe(true);
    expect(isLater("09:15", "09:15")).toBe(false);
    expect(isLater("08:59", "09:15")).toBe(false);
  });
});
