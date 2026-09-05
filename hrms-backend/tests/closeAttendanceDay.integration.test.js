/**
 * closeAttendanceDay.integration.test.js
 *
 * Covers the Sprint 2 additions to jobs/closeAttendanceDay.js:
 *   - 4.2: a late check-in is marked "late" with lateHalfDayType "annual" while the
 *     employee still has Annual/PTO balance, and "unpaid" once it's exhausted.
 *   - 4.6: an employee with no attendance record and no leave request on file is
 *     marked "no-show"; an employee with a pending LeaveRequest for that date is
 *     left alone (not flagged).
 *
 * Uses the same in-memory MongoDB harness as crud.integration.test.js.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startDb, stopDb, clearDb } from "./testHelpers.js";

let dbAvailable = false;

beforeAll(async () => {
  try {
    await startDb();
    dbAvailable = true;
  } catch (err) {
    console.warn(`[closeAttendanceDay.integration] MongoDB unavailable — skipping.\n${err.message}`);
  }
});

afterAll(async () => {
  await stopDb();
});

beforeEach(async () => {
  if (dbAvailable) await clearDb();
});

// A known Monday, far from any seeded holiday.
const TEST_DATE_KEY = "2026-02-02";

async function makeEmployee(overrides = {}) {
  const { default: EmployeeModel } = await import("../model/Employee.js");
  const employee = await EmployeeModel.create({
    employeeId: overrides.employeeId ?? `EMP${Math.floor(Math.random() * 100000)}`,
    name: overrides.name ?? "Test Employee",
    email: overrides.email ?? `test${Math.random()}@hrms.com`,
    status: "active",
    ...overrides,
  });
  // Mongoose's timestamps plugin stamps createdAt with the real wall-clock
  // time on .create(), which is *after* TEST_DATE_KEY (a fixed date in the
  // past). markNoShow() correctly excludes employees who didn't exist yet
  // as of the date being closed, so tests must backdate createdAt to make
  // the fixture predate TEST_DATE_KEY. Using the raw collection bypasses
  // the timestamps middleware, which would otherwise re-stamp it on save.
  await EmployeeModel.collection.updateOne(
    { _id: employee._id },
    { $set: { createdAt: new Date("2026-01-01T00:00:00.000Z") } },
  );
  return employee;
}

describe("closeAttendanceDay — late half-day (task 4.2)", () => {
  it("marks a late check-in as annual when leave balance remains", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { default: AttendanceModel } = await import("../model/Attendance.js");
    const { closeAttendanceDay } = await import("../jobs/closeAttendanceDay.js");

    const employee = await makeEmployee();
    const date = new Date(`${TEST_DATE_KEY}T00:00:00.000Z`);
    await AttendanceModel.create({
      employee: employee._id,
      date,
      checkIn: "09:30", // after the default 09:15 late cutoff
      checkOut: null,
      status: "present",
    });

    const result = await closeAttendanceDay({ dateKey: TEST_DATE_KEY });
    expect(result.markedLate).toBe(1);
    expect(result.markedLateUnpaid).toBe(0);

    const record = await AttendanceModel.findOne({ employee: employee._id, date });
    expect(record.status).toBe("late");
    expect(record.lateHalfDayType).toBe("annual");
  });

  it("marks a late check-in as unpaid once the 12-day balance is exhausted", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { default: AttendanceModel } = await import("../model/Attendance.js");
    const { default: LeaveRequestModel } = await import("../model/LeaveRequest.js");
    const { default: UserModel } = await import("../model/User.js");
    const { closeAttendanceDay } = await import("../jobs/closeAttendanceDay.js");

    const employee = await makeEmployee();
    const hr = await UserModel.create({
      email: `hr${Math.random()}@hrms.com`,
      password: "hashed-not-checked",
      name: "HR Reviewer",
      role: "MANAGER",
    });

    // Burn the whole 12-day annual balance with one approved request earlier in the year.
    await LeaveRequestModel.create({
      employee: employee._id,
      requestedBy: hr._id,
      startDate: new Date("2026-01-05T00:00:00.000Z"),
      endDate: new Date("2026-01-16T00:00:00.000Z"), // 10 weekdays
      days: 12,
      type: "annual",
      status: "approved",
      appliedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const date = new Date(`${TEST_DATE_KEY}T00:00:00.000Z`);
    await AttendanceModel.create({
      employee: employee._id,
      date,
      checkIn: "09:45",
      checkOut: null,
      status: "present",
    });

    const result = await closeAttendanceDay({ dateKey: TEST_DATE_KEY });
    expect(result.markedLateUnpaid).toBe(1);

    const record = await AttendanceModel.findOne({ employee: employee._id, date });
    expect(record.lateHalfDayType).toBe("unpaid");
  });

  it("leaves an on-time check-in alone", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { default: AttendanceModel } = await import("../model/Attendance.js");
    const { closeAttendanceDay } = await import("../jobs/closeAttendanceDay.js");

    const employee = await makeEmployee();
    const date = new Date(`${TEST_DATE_KEY}T00:00:00.000Z`);
    await AttendanceModel.create({
      employee: employee._id,
      date,
      checkIn: "08:50",
      checkOut: null,
      status: "present",
    });

    await closeAttendanceDay({ dateKey: TEST_DATE_KEY });

    const record = await AttendanceModel.findOne({ employee: employee._id, date });
    expect(record.status).toBe("present");
    expect(record.lateHalfDayType).toBeNull();
  });
});

describe("closeAttendanceDay — no-show status (task 4.6)", () => {
  it("marks an employee with no record and no leave request as no-show", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { default: AttendanceModel } = await import("../model/Attendance.js");
    const { closeAttendanceDay } = await import("../jobs/closeAttendanceDay.js");

    const employee = await makeEmployee();
    const result = await closeAttendanceDay({ dateKey: TEST_DATE_KEY });
    expect(result.markedNoShow).toBe(1);

    const date = new Date(`${TEST_DATE_KEY}T00:00:00.000Z`);
    const record = await AttendanceModel.findOne({ employee: employee._id, date });
    expect(record).toBeTruthy();
    expect(record.status).toBe("no-show");
  });

  it("does not flag an employee with a pending leave request that day", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { default: AttendanceModel } = await import("../model/Attendance.js");
    const { default: LeaveRequestModel } = await import("../model/LeaveRequest.js");
    const { default: UserModel } = await import("../model/User.js");
    const { closeAttendanceDay } = await import("../jobs/closeAttendanceDay.js");

    const employee = await makeEmployee();
    const hr = await UserModel.create({
      email: `hr2${Math.random()}@hrms.com`,
      password: "hashed-not-checked",
      name: "HR Reviewer",
      role: "MANAGER",
    });

    const date = new Date(`${TEST_DATE_KEY}T00:00:00.000Z`);
    await LeaveRequestModel.create({
      employee: employee._id,
      requestedBy: hr._id,
      startDate: date,
      endDate: date,
      days: 1,
      type: "annual",
      status: "pending",
      appliedAt: new Date(`${TEST_DATE_KEY}T08:00:00.000Z`),
    });

    const result = await closeAttendanceDay({ dateKey: TEST_DATE_KEY });
    expect(result.markedNoShow).toBe(0);

    const record = await AttendanceModel.findOne({ employee: employee._id, date });
    expect(record).toBeNull(); // no attendance row inserted while the request is pending
  });

  it("skips no-show marking entirely on a weekend", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { closeAttendanceDay } = await import("../jobs/closeAttendanceDay.js");
    await makeEmployee();
    // 2026-02-01 is a Sunday
    const result = await closeAttendanceDay({ dateKey: "2026-02-01" });
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("weekend");
    expect(result.markedNoShow).toBe(0);
  });
});
/* ══════════════════════════════════════════════════
   Attendance Overtime (M3)

   The close job is where overtime stops being a request and becomes hours on
   a record. Two things it must get right, and both are silent when wrong:
   an approved employee has to be closed at their planned end rather than at
   18:00 (or the job erases the overtime it exists to record), and time worked
   with nothing approved has to be measured from the right boundary — 18:00 on
   a working day, but check-in on a rest day, where there is no normal shift.
══════════════════════════════════════════════════ */

// 2026-02-07 is a Saturday; TEST_DATE_KEY above is the Monday of that week.
const SATURDAY_KEY = "2026-02-07";

async function makeAttendance(employee, dateKey, overrides = {}) {
  const { default: AttendanceModel } = await import("../model/Attendance.js");
  const { utcMidnight } = await import("../utils/workday.js");
  return AttendanceModel.create({
    employee: employee._id,
    date: utcMidnight(dateKey),
    checkIn: "09:00",
    checkOut: null,
    status: "present",
    ...overrides,
  });
}

async function makeApprovedOvertime(employee, dateKey, plannedStart, plannedEnd, overrides = {}) {
  const { default: OvertimeRequestModel } = await import("../model/OvertimeRequest.js");
  const { utcMidnight, parseHHMM } = await import("../utils/workday.js");
  const { parseHHMMEnd } = await import("../utils/overtimeRate.js");
  return OvertimeRequestModel.create({
    employee: employee._id,
    date: utcMidnight(dateKey),
    plannedStart,
    plannedEnd,
    plannedMinutes: parseHHMMEnd(plannedEnd) - parseHHMM(plannedStart),
    dayType: overrides.dayType ?? "normal",
    status: "approved",
    origin: "self",
    ...overrides,
  });
}

const reload = async (id) => {
  const { default: AttendanceModel } = await import("../model/Attendance.js");
  return AttendanceModel.findById(id);
};

describe("closeAttendanceDay — overtime (M3)", () => {
  it("closes an approved employee at their planned end, not at 18:00", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { closeAttendanceDay } = await import("../jobs/closeAttendanceDay.js");

    const employee = await makeEmployee();
    const record = await makeAttendance(employee, TEST_DATE_KEY);
    await makeApprovedOvertime(employee, TEST_DATE_KEY, "18:00", "22:00");

    await closeAttendanceDay({ dateKey: TEST_DATE_KEY });

    const after = await reload(record._id);
    expect(after.checkOut).toBe("22:00");
    expect(after.hours).toBe(13);
    expect(after.otMinutes).toBe(240);
    expect(after.otDayType).toBe("normal");
    // No genuine clock-out happened, so the credit rests on the plan.
    expect(after.rawCheckOut).toBeNull();
    expect(after.otEvidence).toBe("planned");
    expect(after.otUnapprovedMinutes).toBe(0);
  });

  it("still closes an unapproved employee at 18:00 with no overtime", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { closeAttendanceDay } = await import("../jobs/closeAttendanceDay.js");

    const employee = await makeEmployee();
    const record = await makeAttendance(employee, TEST_DATE_KEY);

    await closeAttendanceDay({ dateKey: TEST_DATE_KEY });

    const after = await reload(record._id);
    expect(after.checkOut).toBe("18:00");
    expect(after.otMinutes).toBe(0);
    expect(after.otUnapprovedMinutes).toBe(0);
    expect(after.otEvidence).toBeNull();
  });

  it("does not credit overtime for a request that is still pending", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { closeAttendanceDay } = await import("../jobs/closeAttendanceDay.js");

    const employee = await makeEmployee();
    const record = await makeAttendance(employee, TEST_DATE_KEY);
    await makeApprovedOvertime(employee, TEST_DATE_KEY, "18:00", "22:00", { status: "pending" });

    await closeAttendanceDay({ dateKey: TEST_DATE_KEY });

    const after = await reload(record._id);
    expect(after.checkOut).toBe("18:00");
    expect(after.otMinutes).toBe(0);
  });

  it("records a genuine late clock-out as unapproved overtime", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { closeAttendanceDay } = await import("../jobs/closeAttendanceDay.js");

    const employee = await makeEmployee();
    // Already clocked out at 21:00 with nothing approved. autoCheckOut skips
    // it (checkOut is set), so this exercises the recompute from clock times.
    const record = await makeAttendance(employee, TEST_DATE_KEY, {
      checkOut: "21:00",
      rawCheckOut: "21:00",
    });
    const { applyOvertimeToRecord } = await import("../utils/overtimeRecompute.js");
    applyOvertimeToRecord(record, null, { dayType: "normal" });
    await record.save();

    const after = await reload(record._id);
    expect(after.otUnapprovedMinutes).toBe(180);
    expect(after.otMinutes).toBe(0);
  });

  it("closes a rest day at a 24:00 planned end without throwing on the sentinel", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { closeAttendanceDay } = await import("../jobs/closeAttendanceDay.js");

    const employee = await makeEmployee();
    const record = await makeAttendance(employee, SATURDAY_KEY, { checkIn: "12:00" });
    await makeApprovedOvertime(employee, SATURDAY_KEY, "12:00", "24:00", { dayType: "restDay" });

    // The whole point: hoursBetween() would throw on "24:00" here, because
    // parseHHMM rejects it. hoursBetweenEnd() is what makes this survive.
    const result = await closeAttendanceDay({ dateKey: SATURDAY_KEY });
    expect(result.autoCheckedOut).toBe(1);

    const after = await reload(record._id);
    expect(after.checkOut).toBe("24:00");
    expect(after.hours).toBe(12);
    expect(after.otMinutes).toBe(720);
    expect(after.otNightMinutes).toBe(120); // 22:00-24:00
    expect(after.otDayType).toBe("restDay");
  });

  /**
   * The §6 regression. Measuring unapproved overtime from 18:00 on every day
   * reports ZERO for a Saturday worked 09:00-17:00 — silent on exactly the
   * pattern the flag exists to surface.
   */
  it("counts a whole unapproved Saturday, not just the part after 18:00", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { closeAttendanceDay } = await import("../jobs/closeAttendanceDay.js");

    const employee = await makeEmployee();
    const record = await makeAttendance(employee, SATURDAY_KEY, { checkIn: "09:00" });

    await closeAttendanceDay({ dateKey: SATURDAY_KEY });

    const after = await reload(record._id);
    // Closed at the 18:00 default (nothing approved), and every worked minute
    // from check-in counts, because a rest day has no normal shift.
    expect(after.checkOut).toBe("18:00");
    expect(after.otDayType).toBe("restDay");
    expect(after.otUnapprovedMinutes).toBe(540); // 09:00-18:00, not 0
    expect(after.otMinutes).toBe(0);
  });

  it("keeps auto-closing on a rest day even though late/no-show marking is skipped", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { closeAttendanceDay } = await import("../jobs/closeAttendanceDay.js");

    const employee = await makeEmployee();
    await makeAttendance(employee, SATURDAY_KEY, { checkIn: "12:00" });

    const result = await closeAttendanceDay({ dateKey: SATURDAY_KEY });
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("weekend");
    // autoCheckOut runs outside the skip guard, on purpose.
    expect(result.autoCheckedOut).toBe(1);
  });

  it("rates a public holiday as a holiday even when it falls on a Saturday", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { closeAttendanceDay } = await import("../jobs/closeAttendanceDay.js");
    const { default: HolidayModel } = await import("../model/Holiday.js");
    const { utcMidnight } = await import("../utils/workday.js");

    await HolidayModel.create({
      name: "Test Holiday",
      date: utcMidnight(SATURDAY_KEY),
      type: "public",
    });

    const employee = await makeEmployee();
    const record = await makeAttendance(employee, SATURDAY_KEY, { checkIn: "12:00" });

    const result = await closeAttendanceDay({ dateKey: SATURDAY_KEY });
    // The skip reason keeps its original precedence (weekend first) so
    // late/no-show behaviour is unchanged...
    expect(result.reason).toBe("weekend");

    // ...but the pay rate does not: a holiday is 300%, and it does not stop
    // being a holiday because it landed on a weekend.
    const after = await reload(record._id);
    expect(after.otDayType).toBe("holiday");
  });

  it("is idempotent — a second close does not double the overtime", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { closeAttendanceDay } = await import("../jobs/closeAttendanceDay.js");

    const employee = await makeEmployee();
    const record = await makeAttendance(employee, TEST_DATE_KEY);
    await makeApprovedOvertime(employee, TEST_DATE_KEY, "18:00", "22:00");

    await closeAttendanceDay({ dateKey: TEST_DATE_KEY });
    await closeAttendanceDay({ dateKey: TEST_DATE_KEY });

    const after = await reload(record._id);
    expect(after.otMinutes).toBe(240); // not 480
  });
});
