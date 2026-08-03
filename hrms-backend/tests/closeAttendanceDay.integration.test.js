/**
 * closeAttendanceDay.integration.test.js
 *
 * Covers the Sprint 2 additions to jobs/closeAttendanceDay.js:
 *   - 4.2: a late check-in is marked "late" with lateHalfDayType "paid" while the
 *     employee still has paid-leave balance, and "unpaid" once it's exhausted.
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
  it("marks a late check-in as paid when leave balance remains", async (ctx) => {
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
    expect(record.lateHalfDayType).toBe("paid");
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

    // Burn the whole 12-day paid balance with one approved request earlier in the year.
    await LeaveRequestModel.create({
      employee: employee._id,
      requestedBy: hr._id,
      startDate: new Date("2026-01-05T00:00:00.000Z"),
      endDate: new Date("2026-01-16T00:00:00.000Z"), // 10 weekdays
      days: 12,
      type: "paid",
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
      type: "paid",
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
