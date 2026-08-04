/**
 * noShowReview.integration.test.js
 *
 * Covers task 4.7 (jobs/closeAttendanceDay.js's flagRepeatedNoShows) and
 * task 4.8 (notifyHR on flag):
 *   - An employee's 5th all-time no-show auto-creates a pending
 *     NoShowReview and notifies HR — never touches Employee.status.
 *   - No flag is raised before the 5th no-show.
 *   - A pending flag is not duplicated while more no-shows accrue.
 *   - Once the pending flag is resolved, a new one can fire after another
 *     5 no-shows accumulate.
 *
 * Uses the same in-memory MongoDB harness as closeAttendanceDay.integration.test.js.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startDb, stopDb, clearDb } from "./testHelpers.js";

let dbAvailable = false;

beforeAll(async () => {
  try {
    await startDb();
    dbAvailable = true;
  } catch (err) {
    console.warn(`[noShowReview.integration] MongoDB unavailable — skipping.\n${err.message}`);
  }
});

afterAll(async () => {
  await stopDb();
});

beforeEach(async () => {
  if (dbAvailable) await clearDb();
});

// Five consecutive weekdays, none of them holidays in a clean test DB.
const WEEKDAYS = ["2026-02-02", "2026-02-03", "2026-02-04", "2026-02-05", "2026-02-06"];
const NEXT_WEEKDAYS = ["2026-02-09", "2026-02-10", "2026-02-11"];

async function makeEmployee(overrides = {}) {
  const { default: EmployeeModel } = await import("../model/Employee.js");
  const employee = await EmployeeModel.create({
    employeeId: overrides.employeeId ?? `EMP${Math.floor(Math.random() * 100000)}`,
    name: overrides.name ?? "Test Employee",
    email: overrides.email ?? `test${Math.random()}@hrms.com`,
    status: "active",
    ...overrides,
  });
  // Same backdating trick as closeAttendanceDay.integration.test.js — markNoShow()
  // excludes employees who didn't exist yet as of the date being closed.
  await EmployeeModel.collection.updateOne(
    { _id: employee._id },
    { $set: { createdAt: new Date("2026-01-01T00:00:00.000Z") } },
  );
  return employee;
}

describe("flagRepeatedNoShows (task 4.7 / 4.8)", () => {
  it("flags an employee on their 5th all-time no-show and notifies HR, without changing employee status", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { closeAttendanceDay } = await import("../jobs/closeAttendanceDay.js");
    const { default: NoShowReviewModel } = await import("../model/NoShowReview.js");
    const { default: NotificationModel } = await import("../model/Notification.js");
    const { default: EmployeeModel } = await import("../model/Employee.js");

    const employee = await makeEmployee();

    let lastResult;
    for (const dateKey of WEEKDAYS) {
      lastResult = await closeAttendanceDay({ dateKey });
    }

    expect(lastResult.markedNoShow).toBe(1);
    expect(lastResult.flaggedForReview).toBe(1);

    const reviews = await NoShowReviewModel.find({ employee: employee._id });
    expect(reviews).toHaveLength(1);
    expect(reviews[0].status).toBe("pending");
    expect(reviews[0].systemGenerated).toBe(true);
    expect(reviews[0].noShowCountAtFlag).toBe(5);
    expect(reviews[0].requestedBy).toBeNull();

    const stillActive = await EmployeeModel.findById(employee._id);
    expect(stillActive.status).toBe("active");

    const hrNotice = await NotificationModel.findOne({
      audience: "hr",
      title: "No-show pattern flagged for review",
    });
    expect(hrNotice).toBeTruthy();
  });

  it("does not flag before the 5th no-show", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { closeAttendanceDay } = await import("../jobs/closeAttendanceDay.js");
    const { default: NoShowReviewModel } = await import("../model/NoShowReview.js");

    await makeEmployee();

    for (const dateKey of WEEKDAYS.slice(0, 4)) {
      const result = await closeAttendanceDay({ dateKey });
      expect(result.flaggedForReview).toBe(0);
    }

    const reviews = await NoShowReviewModel.find({});
    expect(reviews).toHaveLength(0);
  });

  it("does not duplicate a pending flag while more no-shows accrue", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { closeAttendanceDay } = await import("../jobs/closeAttendanceDay.js");
    const { default: NoShowReviewModel } = await import("../model/NoShowReview.js");

    await makeEmployee();

    for (const dateKey of WEEKDAYS) {
      await closeAttendanceDay({ dateKey });
    }
    // Two more no-show days on top of the 5 that already triggered a flag.
    for (const dateKey of NEXT_WEEKDAYS.slice(0, 2)) {
      const result = await closeAttendanceDay({ dateKey });
      expect(result.flaggedForReview).toBe(0);
    }

    const reviews = await NoShowReviewModel.find({});
    expect(reviews).toHaveLength(1);
  });

  it("can flag again after the prior flag is resolved and the count grows by another 5", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { closeAttendanceDay } = await import("../jobs/closeAttendanceDay.js");
    const { default: NoShowReviewModel } = await import("../model/NoShowReview.js");
    const { default: AttendanceModel } = await import("../model/Attendance.js");

    const employee = await makeEmployee();

    for (const dateKey of WEEKDAYS) {
      await closeAttendanceDay({ dateKey });
    }
    const [firstFlag] = await NoShowReviewModel.find({ employee: employee._id });
    expect(firstFlag.noShowCountAtFlag).toBe(5);

    // HR resolves the first flag (mirrors what noShowReviewController.review does).
    firstFlag.status = "approved";
    firstFlag.reviewedAt = new Date();
    await firstFlag.save();

    // 5 more no-show weekdays (count now 10) — need extra dates past NEXT_WEEKDAYS.
    const moreWeekdays = ["2026-02-09", "2026-02-10", "2026-02-11", "2026-02-12", "2026-02-13"];
    let lastResult;
    for (const dateKey of moreWeekdays) {
      lastResult = await closeAttendanceDay({ dateKey });
    }

    expect(lastResult.flaggedForReview).toBe(1);
    const totalNoShows = await AttendanceModel.countDocuments({ employee: employee._id, status: "no-show" });
    expect(totalNoShows).toBe(10);

    const allFlags = await NoShowReviewModel.find({ employee: employee._id }).sort({ noShowCountAtFlag: 1 });
    expect(allFlags).toHaveLength(2);
    expect(allFlags[1].noShowCountAtFlag).toBe(10);
    expect(allFlags[1].status).toBe("pending");
  });
});
