import AttendanceModel from "../model/Attendance.js";
import EmployeeModel from "../model/Employee.js";
import HolidayModel from "../model/Holiday.js";
import { logAction } from "../utils/auditLog.js";
import { notifyHR } from "../controller/notificationController.js";
import {
  WORKDAY_END,
  WORKDAY_LATE_AFTER,
  endOfUtcDay,
  hoursBetween,
  isLater,
  isWeekend,
  utcMidnight,
} from "../utils/workday.js";

async function resolveSkipReason(dateKey, date) {
  if (isWeekend(dateKey)) return "weekend";
  const holiday = await HolidayModel.findOne({ date });
  return holiday ? "holiday" : null;
}

async function autoCheckOut(date) {
  const open = await AttendanceModel.find({
    date,
    checkIn: { $ne: null },
    checkOut: null,
    status: { $in: ["present", "late"] },
  });

  let closed = 0;
  for (const record of open) {
    let hours = 0;
    try {
      hours = hoursBetween(record.checkIn, WORKDAY_END);
    } catch {
      hours = 0;
    }
    record.checkOut = WORKDAY_END;
    record.hours = hours;
    await record.save();
    closed += 1;
  }
  return closed;
}

async function markLate(date) {
  const candidates = await AttendanceModel.find({
    date,
    checkIn: { $ne: null },
    status: "present",
  });

  const lateIds = [];
  for (const record of candidates) {
    try {
      if (isLater(record.checkIn, WORKDAY_LATE_AFTER)) lateIds.push(record._id);
    } catch {
      continue;
    }
  }
  if (!lateIds.length) return 0;

  const result = await AttendanceModel.updateMany(
    { _id: { $in: lateIds } },
    { status: "late" },
  );
  return result.modifiedCount ?? lateIds.length;
}

async function markAbsent(dateKey, date) {
  const employees = await EmployeeModel.find(
    { status: "active", createdAt: { $lte: endOfUtcDay(dateKey) } },
    "_id",
  );
  if (!employees.length) return 0;

  const existing = await AttendanceModel.find({ date }, "employee");
  const covered = new Set(existing.map((r) => String(r.employee)));

  const toInsert = employees
    .filter((e) => !covered.has(String(e._id)))
    .map((e) => ({
      employee: e._id,
      date,
      checkIn: null,
      checkOut: null,
      hours: 0,
      status: "absent",
    }));

  if (!toInsert.length) return 0;

  try {
    const inserted = await AttendanceModel.insertMany(toInsert, { ordered: false });
    return inserted.length;
  } catch (err) {
    const isDuplicateOnly =
      err?.code === 11000 ||
      (Array.isArray(err?.writeErrors) &&
        err.writeErrors.length > 0 &&
        err.writeErrors.every((w) => (w?.err?.code ?? w?.code) === 11000));
    if (!isDuplicateOnly) throw err;
    return err.result?.insertedCount ?? err.insertedDocs?.length ?? 0;
  }
}

export async function closeAttendanceDay({ dateKey } = {}) {
  const date = utcMidnight(dateKey);
  const reason = await resolveSkipReason(dateKey, date);

  const autoCheckedOut = await autoCheckOut(date);

  let markedLate = 0;
  let markedAbsent = 0;
  if (!reason) {
    markedLate = await markLate(date);
    markedAbsent = await markAbsent(dateKey, date);
  }

  const total = autoCheckedOut + markedLate + markedAbsent;
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
          markedAbsent: { from: 0, to: markedAbsent },
        },
      },
    );

    await notifyHR({
      title: `Attendance closed for ${dateKey}`,
      message: `${autoCheckedOut} auto checked out, ${markedLate} marked late, ${markedAbsent} marked absent.`,
      category: "system",
      link: "/attendance",
      linkLabel: "View attendance",
    });
  }

  return {
    dateKey,
    skipped: Boolean(reason),
    reason,
    autoCheckedOut,
    markedLate,
    markedAbsent,
  };
}

export default closeAttendanceDay;
