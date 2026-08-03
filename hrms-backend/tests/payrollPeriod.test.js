import { describe, it, expect } from "vitest";
import {
  attendanceDateKey,
  collectAbsentKeys,
  collectLeaveKeys,
  collectOnLeaveCoverageKeys,
  groupByEmployee,
  holidayKeySet,
  isWeekendKey,
  leaveDayKeys,
  monthPrefix,
  monthQueryWindowUtc,
  periodEndUtc,
} from "../utils/payrollPeriod.js";
import { localDateKey, utcDateKey } from "../utils/workday.js";

const localDate = (y, m, d) => new Date(y, m - 1, d);
const utcDate = (y, m, d) => new Date(Date.UTC(y, m - 1, d));

describe("date key basis", () => {
  it("reads a local-midnight Date back with local getters", () => {
    expect(localDateKey(localDate(2026, 8, 1))).toBe("2026-08-01");
    expect(localDateKey(localDate(2026, 12, 31))).toBe("2026-12-31");
  });

  it("reads a UTC-midnight Date back with UTC getters", () => {
    expect(utcDateKey(utcDate(2026, 8, 1))).toBe("2026-08-01");
    expect(utcDateKey(utcDate(2026, 12, 31))).toBe("2026-12-31");
  });

  it("attendanceDateKey picks the basis the row was written with", () => {
    expect(attendanceDateKey(utcDate(2026, 8, 3))).toBe("2026-08-03");
    expect(attendanceDateKey(localDate(2026, 8, 3))).toBe("2026-08-03");
  });
});

describe("isWeekendKey", () => {
  it("flags Saturday and Sunday", () => {
    expect(isWeekendKey("2026-08-01")).toBe(true);
    expect(isWeekendKey("2026-08-02")).toBe(true);
  });

  it("clears Monday through Friday", () => {
    ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07"]
      .forEach((k) => expect(isWeekendKey(k)).toBe(false));
  });
});

describe("leaveDayKeys", () => {
  it("walks working days inclusive", () => {
    expect(leaveDayKeys({ startDate: localDate(2026, 8, 3), endDate: localDate(2026, 8, 7) }))
      .toEqual(["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07"]);
  });

  it("returns a single key for a one-day range", () => {
    expect(leaveDayKeys({ startDate: localDate(2026, 8, 3), endDate: localDate(2026, 8, 3) }))
      .toEqual(["2026-08-03"]);
  });

  it("returns nothing for a weekend-only range", () => {
    expect(leaveDayKeys({ startDate: localDate(2026, 8, 1), endDate: localDate(2026, 8, 2) }))
      .toEqual([]);
  });

  it("skips keys in the skip set", () => {
    const skip = new Set(["2026-08-04"]);
    expect(leaveDayKeys({ startDate: localDate(2026, 8, 3), endDate: localDate(2026, 8, 5) }, skip))
      .toEqual(["2026-08-03", "2026-08-05"]);
  });
});

describe("collectLeaveKeys", () => {
  it("keeps only the days that fall in the requested month", () => {
    const keys = collectLeaveKeys(
      [{ startDate: localDate(2026, 7, 30), endDate: localDate(2026, 8, 4) }],
      2026, 8,
    );
    expect([...keys].sort()).toEqual(["2026-08-03", "2026-08-04"]);
  });

  it("deduplicates overlapping requests", () => {
    const keys = collectLeaveKeys([
      { startDate: localDate(2026, 8, 3), endDate: localDate(2026, 8, 5) },
      { startDate: localDate(2026, 8, 4), endDate: localDate(2026, 8, 6) },
    ], 2026, 8);
    expect([...keys].sort()).toEqual(["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06"]);
  });

  it("excludes public holidays", () => {
    const holidays = holidayKeySet([{ date: utcDate(2026, 9, 2) }]);
    const keys = collectLeaveKeys(
      [{ startDate: localDate(2026, 9, 1), endDate: localDate(2026, 9, 3) }],
      2026, 9, holidays,
    );
    expect(keys.has("2026-09-02")).toBe(false);
    expect([...keys].sort()).toEqual(["2026-09-01", "2026-09-03"]);
  });

  it("handles an empty input", () => {
    expect(collectLeaveKeys([], 2026, 8).size).toBe(0);
    expect(collectLeaveKeys(undefined, 2026, 8).size).toBe(0);
  });
});

describe("collectAbsentKeys", () => {
  it("counts a UTC-midnight absent row in its own month", () => {
    const keys = collectAbsentKeys([{ date: utcDate(2026, 8, 3) }], 2026, 8);
    expect([...keys]).toEqual(["2026-08-03"]);
  });

  it("counts a local-midnight absent row in its own month", () => {
    const keys = collectAbsentKeys([{ date: localDate(2026, 8, 3) }], 2026, 8);
    expect([...keys]).toEqual(["2026-08-03"]);
  });

  it("drops rows from an adjacent month that sit inside the widened window", () => {
    const keys = collectAbsentKeys(
      [{ date: utcDate(2026, 7, 31) }, { date: utcDate(2026, 9, 1) }, { date: utcDate(2026, 8, 3) }],
      2026, 8,
    );
    expect([...keys]).toEqual(["2026-08-03"]);
  });

  it("skips weekend rows", () => {
    expect(collectAbsentKeys([{ date: utcDate(2026, 8, 1) }], 2026, 8).size).toBe(0);
  });

  it("excludes days already covered by leave", () => {
    const exclude = new Set(["2026-08-03", "2026-08-04"]);
    const keys = collectAbsentKeys(
      [{ date: utcDate(2026, 8, 3) }, { date: utcDate(2026, 8, 4) }, { date: utcDate(2026, 8, 5) }],
      2026, 8, exclude,
    );
    expect([...keys]).toEqual(["2026-08-05"]);
  });
});

describe("approved paid leave is never charged as absence", () => {
  it("nets every approved leave day out of the absent set regardless of type", () => {
    const leaveRows = [
      { employee: "e1", type: "paid", startDate: localDate(2026, 8, 3), endDate: localDate(2026, 8, 7) },
    ];
    const spuriousAbsences = [
      { employee: "e1", date: utcDate(2026, 8, 3) },
      { employee: "e1", date: utcDate(2026, 8, 4) },
      { employee: "e1", date: utcDate(2026, 8, 5) },
      { employee: "e1", date: utcDate(2026, 8, 6) },
      { employee: "e1", date: utcDate(2026, 8, 7) },
    ];

    const unpaidSet = collectLeaveKeys(leaveRows.filter((r) => r.type === "unpaid"), 2026, 8);
    const leaveCovered = collectLeaveKeys(leaveRows, 2026, 8);
    const absentSet = collectAbsentKeys(spuriousAbsences, 2026, 8, leaveCovered);

    expect(unpaidSet.size).toBe(0);
    expect(absentSet.size).toBe(0);
  });

  it("still charges unpaid leave", () => {
    const leaveRows = [
      { employee: "e1", type: "unpaid", startDate: localDate(2026, 8, 3), endDate: localDate(2026, 8, 5) },
    ];
    const unpaidSet = collectLeaveKeys(leaveRows.filter((r) => r.type === "unpaid"), 2026, 8);
    const leaveCovered = collectLeaveKeys(leaveRows, 2026, 8);
    const absentSet = collectAbsentKeys(
      [{ employee: "e1", date: utcDate(2026, 8, 3) }], 2026, 8, leaveCovered,
    );
    expect(unpaidSet.size).toBe(3);
    expect(absentSet.size).toBe(0);
  });

  it("never double counts a day as both unpaid leave and absence", () => {
    const leaveRows = [
      { employee: "e1", type: "unpaid", startDate: localDate(2026, 8, 3), endDate: localDate(2026, 8, 4) },
    ];
    const unpaidSet = collectLeaveKeys(leaveRows, 2026, 8);
    const leaveCovered = collectLeaveKeys(leaveRows, 2026, 8);
    const absentSet = collectAbsentKeys([
      { date: utcDate(2026, 8, 3) },
      { date: utcDate(2026, 8, 4) },
      { date: utcDate(2026, 8, 5) },
    ], 2026, 8, leaveCovered);

    const union = new Set([...unpaidSet, ...absentSet]);
    expect(unpaidSet.size + absentSet.size).toBe(union.size);
    expect(union.size).toBe(3);
  });

  it("covers on-leave attendance rows in both bases", () => {
    const covered = collectOnLeaveCoverageKeys([{ date: localDate(2026, 8, 3) }], 2026, 8);
    const absentSet = collectAbsentKeys([{ date: utcDate(2026, 8, 3) }], 2026, 8, covered);
    expect(absentSet.size).toBe(0);
  });
});

describe("monthQueryWindowUtc / periodEndUtc", () => {
  it("widens two days either side of the month", () => {
    const { lo, hi } = monthQueryWindowUtc(2026, 8);
    expect(lo.toISOString()).toBe("2026-07-30T00:00:00.000Z");
    expect(hi.toISOString()).toBe("2026-09-02T23:59:59.999Z");
  });

  it("handles a 30-day month and a leap February", () => {
    expect(monthQueryWindowUtc(2026, 9).hi.toISOString()).toBe("2026-10-02T23:59:59.999Z");
    expect(monthQueryWindowUtc(2024, 2).hi.toISOString()).toBe("2024-03-02T23:59:59.999Z");
  });

  it("ends the period on the last millisecond of the last day", () => {
    expect(periodEndUtc(2026, 8).toISOString()).toBe("2026-08-31T23:59:59.999Z");
    expect(periodEndUtc(2026, 12).toISOString()).toBe("2026-12-31T23:59:59.999Z");
    expect(periodEndUtc(2024, 2).toISOString()).toBe("2024-02-29T23:59:59.999Z");
  });
});

describe("monthPrefix / groupByEmployee", () => {
  it("pads the month", () => {
    expect(monthPrefix(2026, 8)).toBe("2026-08");
    expect(monthPrefix(2026, 12)).toBe("2026-12");
  });

  it("groups rows by employee id string", () => {
    const map = groupByEmployee([
      { employee: "a", n: 1 }, { employee: "b", n: 2 }, { employee: "a", n: 3 },
    ]);
    expect(map.get("a")).toHaveLength(2);
    expect(map.get("b")).toHaveLength(1);
    expect(map.get("c")).toBeUndefined();
  });
});
