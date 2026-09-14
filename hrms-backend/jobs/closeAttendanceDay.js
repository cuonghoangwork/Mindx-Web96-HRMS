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
 * One Holiday lookup per run, answering two questions that rank a
 * Saturday-holiday in opposite directions on purpose: skipReason says
 * "weekend" (late/no-show marking unchanged), dayType says "holiday" (it
 * pays 300% regardless of the weekday).
 */
async function resolveDayContext(dateKey, date) {
  const isHoliday = await isHolidayOn(date);
  return {
    skipReason: isWeekend(dateKey) ? "weekend" : isHoliday ? "holiday" : null,
    dayType: resolveDayType(dateKey, { isHoliday }),
  };
}

/**
 * Closes every still-open record at WORKDAY_END, or at the approved overtime
 * shift's plannedEnd. Never sets rawCheckOut — that null is what tells a late
 * approval tomorrow these hours were planned, not clocked.
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
      record.hours = hoursBetweenEnd(record.checkIn, closeAt);
      applyOvertimeToRecord(record, request, { dayType });
      await record.save();
      closed += 1;
    } catch (err) {
      // One malformed record must not abort the close for everyone else.
      console.error(
        `[closeAttendanceDay] could not auto-close attendance ${record._id} ` +
          `(employee ${record.employee}): ${err.message}`,
      );
    }
  }
  return closed;
}

/**
 * Check-in after WORKDAY_LATE_AFTER marks the day "late" and costs half a
 * day of annual leave, or is unpaid once the balance is below 0.5
 * (DECISIONS.md D4). Records are processed sequentially per employee (each
 * check must see the previous deduction) but employees run in parallel.
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
 * Employees with no attendance row and no pending/approved leave for the
 * date are "no-show" — distinct from "absent", which HR enters by hand (D4).
 * A pending request counts as covered: they filed something, and HR has not
 * acted on it yet.
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

  // Captured before the insert so the flag check still runs for an employee
  // whose insert lost the duplicate-key race below.
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
 * Flags a pending NoShowReview each time an employee's all-time no-show count
 * grows by another 5 since their last flag (D2). Flagging is the entire
 * effect — Employee.status is never touched. Scoped to today's no-shows so
 * it is not a full-collection scan.
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

  // Outside the skip guard: a rest day has no late/no-show marking, but it is when rest-day overtime closes.
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
