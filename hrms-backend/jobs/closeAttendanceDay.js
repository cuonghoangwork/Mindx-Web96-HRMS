import AttendanceModel from "../model/Attendance.js";
import EmployeeModel from "../model/Employee.js";
import LeaveRequestModel from "../model/LeaveRequest.js";
import NoShowReviewModel from "../model/NoShowReview.js";
import OvertimeRequestModel from "../model/OvertimeRequest.js";
import { logAction } from "../utils/auditLog.js";
import { notifyHR } from "../utils/notify.js";
import { getRemainingDays } from "../utils/leaveBalance.js";
import {
  WORKDAY_END,
  WORKDAY_LATE_AFTER,
  endOfUtcDay,
  isLater,
  isWeekend,
  localDateKey,
  utcDateKey,
  utcMidnight,
} from "../utils/workday.js";
import { isHolidayOn } from "../utils/holidayLookup.js";
import { hoursBetweenEnd, resolveDayType } from "../utils/overtimeRate.js";
import { applyOvertimeToRecord } from "../utils/overtimeRecompute.js";

/**
 * One Holiday lookup per run, answering two different questions.
 *
 * They resolve a Saturday-holiday in opposite directions, on purpose:
 *
 *   - skipReason keeps its original precedence (weekend first), so late/no-show
 *     marking behaves exactly as it did before overtime existed.
 *   - dayType puts holiday first, because a public holiday pays 300% and does
 *     not stop being a holiday because it landed on a weekend.
 *
 * The lookup itself goes through utils/holidayLookup.js so attendance and
 * overtime cannot drift onto different holiday-matching idioms (the codebase
 * has an exact-Date match here and a range match in payrollGeneration; they
 * agree only while every Holiday row sits at exactly UTC midnight).
 */
async function resolveDayContext(dateKey, date) {
  const isHoliday = await isHolidayOn(date);
  return {
    skipReason: isWeekend(dateKey) ? "weekend" : isHoliday ? "holiday" : null,
    dayType: resolveDayType(dateKey, { isHoliday }),
  };
}

/**
 * Closes every still-open record for the day.
 *
 * An employee with an approved overtime request is closed at their planned
 * end (up to 22:00 on a working day, up to 24:00 on a rest day) rather than
 * at 18:00 — otherwise the close job would erase the overtime it is supposed
 * to record.
 *
 * The approved requests are fetched in one query for the whole batch, not one
 * per record: this runs over every open attendance row in the company, and the
 * late-day handler below already documents the same N+1 concern.
 *
 * Note what is NOT set here: rawCheckOut. It records a *genuine* employee
 * clock-out, so the job must leave it null — that null is exactly what tells a
 * late approval tomorrow that these hours are planned rather than clocked.
 */
async function autoCheckOut(date, dayType) {
  const open = await AttendanceModel.find({
    date,
    checkIn: { $ne: null },
    checkOut: null,
    status: { $in: ["present", "late"] },
  });
  if (!open.length) return 0;

  const approved = await OvertimeRequestModel.find({
    date,
    status: "approved",
    employee: { $in: open.map((r) => r.employee) },
  });
  const otByEmployee = new Map(approved.map((r) => [String(r.employee), r]));

  let closed = 0;
  for (const record of open) {
    const request = otByEmployee.get(String(record.employee)) ?? null;
    const closeAt = request ? request.plannedEnd : WORKDAY_END;
    try {
      record.checkOut = closeAt;
      // hoursBetweenEnd, not hoursBetween: on a rest day an approved
      // plannedEnd can legitimately be "24:00", which parseHHMM rejects.
      record.hours = hoursBetweenEnd(record.checkIn, closeAt);
      applyOvertimeToRecord(record, request, { dayType });
      await record.save();
      closed += 1;
    } catch (err) {
      // One malformed record must not abort the nightly close for everyone
      // else. Logged loudly rather than swallowed, so it can be fixed.
      console.error(
        `[closeAttendanceDay] could not auto-close attendance ${record._id} ` +
          `(employee ${record.employee}): ${err.message}`,
      );
    }
  }
  return closed;
}

/**
 * Task 4.2: "late count as half-day Annual/PTO leave or half-day unpaid
 * leave". For each employee whose check-in is after WORKDAY_LATE_AFTER, mark
 * the day "late" and decide whether it draws from their Annual/PTO balance
 * (if they have >= 0.5 remaining for the year) or is unpaid (once exhausted).
 *
 * Grouped by employee and processed one employee at a time within each
 * group, but the groups themselves run in parallel: when the SAME employee
 * has multiple late days queued in one run, each of THEIR checks must see
 * the previous one's deduction already applied via getRemainingDays —
 * otherwise two late days in the same batch could both read the same
 * "before" balance and both get marked "annual" even though only one
 * 0.5-day slice was actually left. Different employees have no such
 * dependency (the common case is one late record each), so serializing the
 * whole batch behind that per-employee ordering wastes N-1 round trips.
 */
async function markLate(date) {
  const candidates = await AttendanceModel.find({
    date,
    checkIn: { $ne: null },
    status: "present",
  });

  const lateRecords = candidates.filter((record) => {
    try {
      return isLater(record.checkIn, WORKDAY_LATE_AFTER);
    } catch {
      return false;
    }
  });
  if (!lateRecords.length) return { count: 0, unpaidCount: 0 };

  const year = date.getUTCFullYear();

  const byEmployee = new Map();
  for (const record of lateRecords) {
    const key = String(record.employee);
    if (!byEmployee.has(key)) byEmployee.set(key, []);
    byEmployee.get(key).push(record);
  }

  const unpaidCounts = await Promise.all(
    [...byEmployee.values()].map(async (records) => {
      let unpaid = 0;
      for (const record of records) {
        const remaining = await getRemainingDays(record.employee, year, "annual");
        const type = remaining >= 0.5 ? "annual" : "unpaid";
        if (type === "unpaid") unpaid += 1;

        record.status = "late";
        record.lateHalfDayType = type;
        await record.save();
      }
      return unpaid;
    }),
  );

  return { count: lateRecords.length, unpaidCount: unpaidCounts.reduce((sum, n) => sum + n, 0) };
}

/**
 * Task 4.6: employees who are neither checked in nor covered by a
 * pending/approved LeaveRequest for this date are "no-shows", not generic
 * "absent" — "absent" stays available for manual HR entry. A pending
 * (not-yet-reviewed) request still counts as "covered": the employee did
 * file something, and it would be unfair to flag them before HR has acted
 * on it. Approved requests are already reflected as "on-leave" attendance
 * records by leaveRequestController's onApprove hook, so they're excluded
 * here via the `covered` (existing attendance) check, same as before.
 */
async function markNoShow(dateKey, date) {
  const employees = await EmployeeModel.find(
    { status: "active", createdAt: { $lte: endOfUtcDay(dateKey) } },
    "_id",
  );
  if (!employees.length) return { count: 0, employeeIds: [] };

  const existing = await AttendanceModel.find(
    {
      date: {
        $gte: new Date(date.getTime() - 86400000),
        $lte: new Date(date.getTime() + 2 * 86400000),
      },
    },
    "employee date",
  );
  const covered = new Set(
    existing
      .filter((r) => utcDateKey(r.date) === dateKey || localDateKey(r.date) === dateKey)
      .map((r) => String(r.employee)),
  );

  const leaveRequests = await LeaveRequestModel.find(
    {
      status: { $in: ["pending", "approved"] },
      startDate: { $lte: date },
      endDate: { $gte: date },
    },
    "employee",
  );
  const hasLeaveOnFile = new Set(leaveRequests.map((r) => String(r.employee)));

  const toInsert = employees
    .filter((e) => !covered.has(String(e._id)) && !hasLeaveOnFile.has(String(e._id)))
    .map((e) => ({
      employee: e._id,
      date,
      checkIn: null,
      checkOut: null,
      hours: 0,
      status: "no-show",
    }));

  if (!toInsert.length) return { count: 0, employeeIds: [] };

  // Captured before the insert (not derived from its result) so task 4.7's
  // flag check still runs for an employee even if their own insert hit the
  // duplicate-key race handled below — worst case it's a harmless no-op
  // re-check, not a missed flag.
  const employeeIds = toInsert.map((r) => r.employee);

  try {
    const inserted = await AttendanceModel.insertMany(toInsert, { ordered: false });
    return { count: inserted.length, employeeIds };
  } catch (err) {
    const isDuplicateOnly =
      err?.code === 11000 ||
      (Array.isArray(err?.writeErrors) &&
        err.writeErrors.length > 0 &&
        err.writeErrors.every((w) => (w?.err?.code ?? w?.code) === 11000));
    if (!isDuplicateOnly) throw err;
    return { count: err.result?.insertedCount ?? err.insertedDocs?.length ?? 0, employeeIds };
  }
}

/**
 * Task 4.7: "5 no-shows -> flag for HR review (not auto-terminate)". After
 * today's no-show records are written, check whether any of those
 * employees have now accumulated a new multiple of 5 no-show days
 * *all-time* and, if so, auto-create a pending NoShowReview (task 0.2's
 * review-queue pattern — see model/NoShowReview.js) plus notify HR (task
 * 4.8, via the same notifyHR() every other scheduled job already uses).
 *
 * Deliberately never touches Employee.status — flagging is the entire
 * effect. Any consequence beyond that is a human decision made through the
 * review queue (controller/noShowReviewController.js), not this job.
 *
 * Dedup: only scoped to employees marked no-show *today* (cheap — avoids a
 * full-collection scan every run) and only re-flags once the employee's
 * all-time count has grown by >= 5 since their last flag (pending or
 * already reviewed), the same "flag once per threshold, don't refire every
 * day the count sits still" rule checkPromotionEligibility.js uses.
 */
async function flagRepeatedNoShows(employeeIds) {
  if (!employeeIds.length) return 0;

  let flagged = 0;
  for (const employeeId of employeeIds) {
    const count = await AttendanceModel.countDocuments({ employee: employeeId, status: "no-show" });
    if (count < 5) continue;

    const lastFlag = await NoShowReviewModel.findOne({ employee: employeeId }).sort({ noShowCountAtFlag: -1 });
    const lastFlaggedCount = lastFlag?.noShowCountAtFlag ?? 0;
    if (count < lastFlaggedCount + 5) continue;

    const alreadyPending = await NoShowReviewModel.findOne({ employee: employeeId, status: "pending" });
    if (alreadyPending) continue;

    const employee = await EmployeeModel.findById(employeeId, "name employeeId");
    if (!employee) continue;

    await NoShowReviewModel.create({
      employee: employeeId,
      requestedBy: null,
      systemGenerated: true,
      status: "pending",
      noShowCountAtFlag: count,
      reason: `Auto-flagged: ${count} no-show day(s) recorded to date.`,
      flaggedAt: new Date(),
    });
    flagged += 1;

    await notifyHR({
      title: "No-show pattern flagged for review",
      message: `${employee.name} (${employee.employeeId}) has ${count} no-show day(s) on record and needs HR review.`,
      category: "employee",
      link: "/attendance",
      linkLabel: "Review no-show flags",
      titleKey: "noShowPatternFlagged",
      messageKey: "noShowPatternFlagged",
      params: { employeeName: employee.name, employeeId: employee.employeeId, count },
    });
  }
  return flagged;
}

export async function closeAttendanceDay({ dateKey } = {}) {
  const date = utcMidnight(dateKey);
  const { skipReason: reason, dayType } = await resolveDayContext(dateKey, date);

  // Deliberately outside the skip guard below: a rest day or holiday has no
  // late/no-show marking to do, but it is exactly when rest-day overtime needs
  // closing.
  const autoCheckedOut = await autoCheckOut(date, dayType);

  let markedLate = 0;
  let markedLateUnpaid = 0;
  let markedNoShow = 0;
  let flaggedForReview = 0;
  if (!reason) {
    const lateResult = await markLate(date);
    markedLate = lateResult.count;
    markedLateUnpaid = lateResult.unpaidCount;

    const noShowResult = await markNoShow(dateKey, date);
    markedNoShow = noShowResult.count;
    // Task 4.7/4.8 — only worth checking employees actually marked no-show
    // today (see flagRepeatedNoShows() header for why this is scoped, not
    // a full-collection sweep).
    flaggedForReview = await flagRepeatedNoShows(noShowResult.employeeIds);
  }

  const total = autoCheckedOut + markedLate + markedNoShow;
  if (total > 0) {
    await logAction(
      {},
      {
        action: "status_changed",
        resource: "attendance",
        label: `Attendance closed for ${dateKey}`,
        changes: {
          autoCheckedOut: { from: 0, to: autoCheckedOut },
          markedLate: { from: 0, to: markedLate },
          markedLateUnpaid: { from: 0, to: markedLateUnpaid },
          markedNoShow: { from: 0, to: markedNoShow },
          flaggedForReview: { from: 0, to: flaggedForReview },
        },
      },
    );

    await notifyHR({
      title: `Attendance closed for ${dateKey}`,
      message: `${autoCheckedOut} auto checked out, ${markedLate} marked late (${markedLateUnpaid} unpaid), ${markedNoShow} marked no-show${flaggedForReview > 0 ? `, ${flaggedForReview} flagged for no-show review` : ""}.`,
      category: "system",
      link: "/attendance",
      linkLabel: "View attendance",
      titleKey: "attendanceClosed",
      messageKey: flaggedForReview > 0 ? "attendanceClosedWithFlagged" : "attendanceClosed",
      params: { date: dateKey, autoCheckedOut, markedLate, markedLateUnpaid, markedNoShow, flaggedForReview },
    });
  }

  return {
    dateKey,
    skipped: Boolean(reason),
    reason,
    autoCheckedOut,
    markedLate,
    markedLateUnpaid,
    markedNoShow,
    flaggedForReview,
  };
}

export default closeAttendanceDay;
