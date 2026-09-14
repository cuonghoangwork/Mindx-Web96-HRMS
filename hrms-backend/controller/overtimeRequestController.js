/**
 * Overtime requests (DECISIONS.md D5). list/review come from the review-queue
 * pattern (D6); create/assign are bespoke because the rules are — a
 * time-zone-aware cutoff, a day type that sets the multiplier, three
 * cumulative caps. buildRequestPayload() checks cheap things first, then the
 * database, then the arithmetic, so the employee sees the first thing wrong
 * with the request rather than whichever check happened to run first.
 */

import OvertimeRequestModel, { OT_LIVE_STATUSES } from "../model/OvertimeRequest.js";
import LeaveRequestModel from "../model/LeaveRequest.js";
import UserModel from "../model/User.js";
import EmployeeModel, { PAYABLE_EMPLOYEE_STATUSES } from "../model/Employee.js";
import AttendanceModel from "../model/Attendance.js";
import { recomputeRecordOvertime } from "../utils/overtimeRecompute.js";
import {
  createReviewRequestController,
  resolveRequestingEmployee,
  assertNoPendingRequest,
} from "../utils/reviewQueue.js";
import { getManagerDepartmentId } from "../utils/managerScope.js";
import { emitNotificationEach } from "../utils/notify.js";
import { departmentManagerUserIds } from "../utils/performanceScope.js";
import { AppError } from "../utils/appError.js";
import { dateKeyInTz, parseHHMM, utcMidnight } from "../utils/workday.js";
import { serverNow } from "../utils/appNow.js";
import { isPastCutoff, OT_TIMEZONE } from "../utils/overtimeCutoff.js";
import { isHolidayOn } from "../utils/holidayLookup.js";
import { resolveDayType, splitDayNight } from "../utils/overtimeRate.js";
import {
  dailyCapHoursFor,
  minutesToHours,
  OT_MONTHLY_CAP_HOURS,
  OT_ANNUAL_CAP_HOURS,
  OT_WORKDAY_START,
} from "../utils/overtime.js";
import {
  getOvertimeBalance,
  monthBoundsUtc,
  usedMinutesInWindow,
  yearBoundsUtc,
} from "../utils/overtimeBalance.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { toPlainObject, reviewRequestBase, dateOnly } from "../utils/mappers.js";

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function toClientRequest(doc) {
  if (!doc) return doc;
  const o = toPlainObject(doc);
  return {
    ...reviewRequestBase(o),
    employeeCode: o.employee?.employeeId ?? null,
    requestedBy: o.requestedBy ? String(o.requestedBy._id ?? o.requestedBy) : null,
    date: dateOnly(o.date),
    plannedStart: o.plannedStart,
    plannedEnd: o.plannedEnd,
    plannedMinutes: o.plannedMinutes,
    plannedHours: minutesToHours(o.plannedMinutes ?? 0),
    origin: o.origin,
    dayType: o.dayType,
    reason: o.reason ?? "",
    appliedAt: o.appliedAt,
  };
}

/**
 * Overtime may only be scheduled for someone payroll will pay — the same
 * PAYABLE_EMPLOYEE_STATUSES payrollGeneration.js filters on, so the two cannot
 * drift. Fails closed when `status` was not loaded.
 */
function assertEmployable(employee) {
  if (PAYABLE_EMPLOYEE_STATUSES.includes(employee?.status)) return;
  throw new AppError(
    "This employee is no longer employed, so overtime cannot be scheduled or approved for them.",
    "OT_EMPLOYEE_NOT_EMPLOYED",
    { status: employee?.status ?? null },
    409,
  );
}

/**
 * Validation shared by create() and assign(); throws an AppError with a
 * specific code on the first failure. Resolving *which* employee is the
 * caller's job — create() uses the requester's own record, assign() checks
 * departmental scope over a list.
 */
async function buildRequestPayload({
  employee,
  dateKey,
  plannedStart,
  plannedEnd,
  reason,
  origin,
  now,
  skipCutoff,
}) {
  assertEmployable(employee);

  // A valid, non-past date — compared as date keys in APP_TIMEZONE, never via
  // getDate(), which reads the container's UTC clock.
  if (!dateKey || !DATE_KEY_RE.test(String(dateKey))) {
    throw new AppError("date must be a YYYY-MM-DD date.", "OT_INVALID_DATE", undefined, 400);
  }
  const date = utcMidnight(dateKey);
  const todayKey = dateKeyInTz(now, OT_TIMEZONE);
  if (dateKey < todayKey) {
    throw new AppError(
      "Overtime cannot be applied for a date in the past.",
      "OT_DATE_IN_PAST",
      { date: dateKey },
      400,
    );
  }

  // The 13:00 cutoff exists to stop employees back-filling a shift, not to stop management scheduling one.
  if (!skipCutoff && isPastCutoff(now, dateKey)) {
    throw new AppError(
      "Overtime applications close at 13:00 on the overtime date.",
      "OT_APPLICATION_PAST_CUTOFF",
      { date: dateKey },
      409,
    );
  }

  // The partial unique index is what enforces this; the pre-check gives a readable message.
  await assertNoPendingRequest(
    OvertimeRequestModel,
    employee._id,
    "There is already an overtime request for this date.",
    "OT_DUPLICATE_FOR_DATE",
    { date: dateKey },
    { date, status: { $in: OT_LIVE_STATUSES } },
  );

  const onLeave = await LeaveRequestModel.findOne(
    { employee: employee._id, status: "approved", startDate: { $lte: date }, endDate: { $gte: date } },
    "_id",
  );
  if (onLeave) {
    throw new AppError(
      "This employee is on approved leave for that date.",
      "OT_ON_LEAVE_DAY",
      { date: dateKey },
      409,
    );
  }

  // Snapshotted onto the request so a Holiday row added later cannot reprice an approved shift.
  const dayType = resolveDayType(dateKey, { isHoliday: await isHolidayOn(date) });

  const { dayMinutes, nightMinutes } = splitDayNight(plannedStart, plannedEnd);
  const plannedMinutes = dayMinutes + nightMinutes;

  // On a working day overtime cannot start before the shift ends: a 17:00–20:00
  // request would be accepted as 3h but paid as 2h, since the recompute clamps
  // to 18:00. Rest days and holidays have no normal shift.
  if (dayType === "normal" && parseHHMM(plannedStart) < parseHHMM(OT_WORKDAY_START)) {
    throw new AppError(
      `Overtime on a working day cannot start before ${OT_WORKDAY_START}.`,
      "OT_STARTS_BEFORE_WINDOW",
      { start: OT_WORKDAY_START },
      400,
    );
  }

  const dailyCapHours = dailyCapHoursFor(dayType);
  if (plannedMinutes > dailyCapHours * 60) {
    throw new AppError(
      `Overtime on this day is capped at ${dailyCapHours} hours.`,
      "OT_EXCEEDS_DAILY_CAP",
      { cap: dailyCapHours, requested: minutesToHours(plannedMinutes), dayType },
      409,
    );
  }

  // Cumulative caps; pending requests count too (see overtimeBalance.js).
  const year = Number(dateKey.slice(0, 4));
  const month = Number(dateKey.slice(5, 7));

  const monthUsed = await usedMinutesInWindow(employee._id, monthBoundsUtc(year, month));
  if (monthUsed + plannedMinutes > OT_MONTHLY_CAP_HOURS * 60) {
    throw new AppError(
      `This would exceed the ${OT_MONTHLY_CAP_HOURS}-hour monthly overtime cap.`,
      "OT_EXCEEDS_MONTHLY_CAP",
      { cap: OT_MONTHLY_CAP_HOURS, used: minutesToHours(monthUsed), requested: minutesToHours(plannedMinutes) },
      409,
    );
  }

  const yearUsed = await usedMinutesInWindow(employee._id, yearBoundsUtc(year));
  if (yearUsed + plannedMinutes > OT_ANNUAL_CAP_HOURS * 60) {
    throw new AppError(
      `This would exceed the ${OT_ANNUAL_CAP_HOURS}-hour annual overtime cap.`,
      "OT_EXCEEDS_ANNUAL_CAP",
      { cap: OT_ANNUAL_CAP_HOURS, used: minutesToHours(yearUsed), requested: minutesToHours(plannedMinutes) },
      409,
    );
  }

  return {
    employee: employee._id,
    date,
    plannedStart,
    plannedEnd,
    plannedMinutes,
    origin,
    dayType,
    reason: reason ?? "",
    appliedAt: now,
  };
}

/**
 * Two concurrent submissions can both pass the pre-commit caps check. Once
 * committed, walk the window's live requests in _id order (the same order for
 * both racers) and roll this one back if it is the row that crossed the line.
 * Same pattern as leaveRequestController.create's balance cap.
 */
async function assertCapsAfterCommit(request, dateKey) {
  const year = Number(dateKey.slice(0, 4));
  const month = Number(dateKey.slice(5, 7));

  const windows = [
    { bounds: monthBoundsUtc(year, month), capHours: OT_MONTHLY_CAP_HOURS, code: "OT_EXCEEDS_MONTHLY_CAP" },
    { bounds: yearBoundsUtc(year), capHours: OT_ANNUAL_CAP_HOURS, code: "OT_EXCEEDS_ANNUAL_CAP" },
  ];

  for (const { bounds, capHours, code } of windows) {
    const rows = await OvertimeRequestModel.find(
      {
        employee: request.employee,
        status: { $in: OT_LIVE_STATUSES },
        date: { $gte: bounds.lo, $lte: bounds.hi },
      },
      "plannedMinutes",
    ).sort({ _id: 1 });

    let cumulative = 0;
    for (const row of rows) {
      cumulative += row.plannedMinutes ?? 0;
      if (String(row._id) !== String(request._id)) continue;
      if (cumulative > capHours * 60) {
        await OvertimeRequestModel.deleteOne({ _id: request._id });
        throw new AppError(
          `This would exceed the ${capHours}-hour overtime cap — a concurrent request already used it.`,
          code,
          { cap: capHours },
          409,
        );
      }
      break;
    }
  }
}

/** Turns the partial unique index's duplicate-key error into the readable code. */
function asDuplicateError(err, dateKey) {
  if (err?.code !== 11000) return err;
  return new AppError(
    "There is already an overtime request for this date.",
    "OT_DUPLICATE_FOR_DATE",
    { date: dateKey },
    409,
  );
}

/**
 * Approval writes the derived hours onto that day's attendance record. Safe
 * to run late (the close job may already have shut the row at 18:00 —
 * rawCheckOut still shows when they left) and safe to run twice
 * (applyOvertimeToRecord derives, never increments).
 */
const { list, review } = createReviewRequestController({
  Model: OvertimeRequestModel,
  resourceLabel: "overtime request",
  capability: "approveOvertimeRequests",
  // The default "employee" category is in-app only (D7); a decision about tonight's shift must reach a phone.
  notifyCategory: "overtime",
  toClient: toClientRequest,
  // The queue's warning triangle needs otEvidence, which lives on Attendance, not the request. One query per page.
  enrichItems: async (items) => {
    if (!items.length) return items;
    const records = await AttendanceModel.find(
      {
        employee: { $in: items.map((i) => i.employeeId) },
        date: { $in: items.map((i) => utcMidnight(i.date)) },
      },
      "employee date otEvidence otMinutes otNightMinutes otUnapprovedMinutes",
    );
    const key = (employee, date) => String(employee) + "|" + dateOnly(date);
    const byKey = new Map(records.map((r) => [key(r.employee, r.date), r]));

    return items.map((item) => {
      const rec = byKey.get(key(item.employeeId, item.date));
      return {
        ...item,
        otEvidence: rec?.otEvidence ?? null,
        actualHours: minutesToHours(rec?.otMinutes ?? 0),
        actualNightHours: minutesToHours(rec?.otNightMinutes ?? 0),
        unapprovedHours: minutesToHours(rec?.otUnapprovedMinutes ?? 0),
      };
    });
  },
  onApprove: async (request) => {
    const employeeId = request.employee?._id ?? request.employee;

    // Re-checked at review time: they may have been terminated since applying.
    // Throwing leaves the request pending (D6) so the reviewer rejects it explicitly.
    assertEmployable(await EmployeeModel.findById(employeeId, "status"));

    const record = await AttendanceModel.findOne({ employee: employeeId, date: request.date });
    if (!record) return; // approved ahead of the day — the close job applies it

    // Pass the request: reviewQueue set status = "approved" in memory but has not saved yet.
    await recomputeRecordOvertime(record, { request });
    await record.save();
  },
  notifyEmployee: (decision, request) => ({
    title: decision === "approved" ? "Overtime approved" : "Overtime rejected",
    message:
      decision === "approved"
        ? `Your overtime on ${dateOnly(request.date)} (${request.plannedStart}-${request.plannedEnd}) has been approved.`
        : `Your overtime request for ${dateOnly(request.date)} was rejected.${request.reviewNote ? ` Note: ${request.reviewNote}` : ""}`,
    titleKey: decision === "approved" ? "overtimeApproved" : "overtimeRejected",
    messageKey:
      decision === "approved"
        ? "overtimeApproved"
        : request.reviewNote
          ? "overtimeRejectedWithNote"
          : "overtimeRejected",
    params:
      decision === "approved"
        ? { date: request.date, start: request.plannedStart, end: request.plannedEnd }
        : request.reviewNote
          ? { date: request.date, note: request.reviewNote }
          : { date: request.date },
  }),
  employeeLink: "/attendance",
  employeeLinkLabel: "View overtime",
});

const overtimeRequestController = {
  /**
   * POST /api/v1/overtime-requests — apply for oneself. A body employeeId is
   * ignored (as in attendanceController.checkIn). HR/Admin bypass the cutoff.
   */
  create: async (req, res) => {
    const dateKey = req.body?.date;
    try {
      const employee = await resolveRequestingEmployee(req);
      if (!employee) {
        return res.status(404).json({
          success: false,
          message: "No employee profile is linked to your account. Ask HR to link your profile.",
          code: "EMPLOYEE_PROFILE_NOT_LINKED",
        });
      }

      const now = serverNow(req);
      const payload = await buildRequestPayload({
        employee,
        dateKey,
        plannedStart: req.body?.plannedStart,
        plannedEnd: req.body?.plannedEnd,
        reason: req.body?.reason,
        origin: "self",
        now,
        skipCutoff: req.user.role === "HR" || req.user.role === "ADMIN",
      });

      let request;
      try {
        request = await OvertimeRequestModel.create({ ...payload, requestedBy: req.user.id });
      } catch (err) {
        throw asDuplicateError(err, dateKey);
      }
      await assertCapsAfterCommit(request, dateKey);
      await request.populate("employee", "name email employeeId");

      const reviewerNotice = {
        title: "New overtime request",
        message: `${employee.name} requested overtime on ${dateKey} (${payload.plannedStart}-${payload.plannedEnd}).`,
        category: "overtime",
        link: "/attendance",
        linkLabel: "Review overtime",
        titleKey: "overtimeRequestSubmitted",
        messageKey: "overtimeRequestSubmitted",
        params: {
          employeeName: employee.name,
          date: dateKey,
          start: payload.plannedStart,
          end: payload.plannedEnd,
        },
      };

      // Addressed notices, not a broadcast (D8): a department manager is never
      // in the "hr" audience, and broadcast read state is shared — one reviewer
      // opening it would clear every other reviewer's badge. Excluding the
      // caller covers a reviewer applying for their own overtime.
      const [hrTier, departmentManagers] = await Promise.all([
        UserModel.find({ role: { $in: ["HR", "ADMIN"] }, _id: { $ne: req.user.id } }, "_id"),
        departmentManagerUserIds(employee.department, req.user.id),
      ]);

      await emitNotificationEach(
        [...hrTier.map((u) => u._id), ...departmentManagers],
        reviewerNotice,
      );

      res.status(201).json({ success: true, data: toClientRequest(request) });
    } catch (error) {
      res.status(error.status || 400).json({
        success: false, message: error.message, code: error.code, params: error.params,
      });
    }
  },

  /**
   * POST /api/v1/overtime-requests/assign — MANAGER (own department) / HR /
   * ADMIN assign overtime to several employees. Partial success by design:
   * each employee is validated independently and reported in `created` or
   * `skipped`. Assigned requests are created pending — the approval queue
   * stays the only place overtime becomes real.
   */
  assign: asyncHandler(async (req, res) => {
    const { date: dateKey, plannedStart, plannedEnd, reason } = req.body ?? {};
    const employeeIds = Array.isArray(req.body?.employeeIds) ? req.body.employeeIds : [];
    if (!employeeIds.length) {
      throw new AppError("Select at least one employee.", "OT_ASSIGN_NO_EMPLOYEES", undefined, 400);
    }

    const deptId = req.user.role === "MANAGER" ? await getManagerDepartmentId(req) : null;
    const now = serverNow(req);

    const created = [];
    const skipped = [];

    for (const employeeId of employeeIds) {
      try {
        const employee = await EmployeeModel.findById(employeeId, "name email employeeId department status");
        if (!employee) {
          throw new AppError("Employee not found.", "OT_ASSIGN_EMPLOYEE_NOT_FOUND", undefined, 404);
        }
        if (deptId && String(employee.department) !== String(deptId)) {
          throw new AppError(
            "You can only assign overtime to employees in your own department.",
            "OT_ASSIGN_OUT_OF_DEPARTMENT",
            undefined,
            403,
          );
        }

        const payload = await buildRequestPayload({
          employee,
          dateKey,
          plannedStart,
          plannedEnd,
          reason,
          origin: "assigned",
          now,
          skipCutoff: true, // a management action; the cutoff is for employees back-filling
        });

        let request;
        try {
          request = await OvertimeRequestModel.create({ ...payload, requestedBy: req.user.id });
        } catch (err) {
          throw asDuplicateError(err, dateKey);
        }
        await assertCapsAfterCommit(request, dateKey);
        await request.populate("employee", "name email employeeId");
        created.push(toClientRequest(request));
      } catch (err) {
        skipped.push({
          employeeId: String(employeeId),
          code: err.code ?? "OT_ASSIGN_FAILED",
          params: err.params, // the client interpolates the translated message
          message: err.message,
        });
      }
    }

    if (created.length) {
      // Addressed for the same read-state reason as the apply path above.
      const hrTier = await UserModel.find(
        { role: { $in: ["HR", "ADMIN"] }, _id: { $ne: req.user.id } },
        "_id",
      );
      await emitNotificationEach(hrTier.map((u) => u._id), {
        title: "Overtime assigned",
        message: `${created.length} employee(s) were assigned overtime on ${dateKey} (${plannedStart}-${plannedEnd}).`,
        category: "overtime",
        link: "/attendance",
        linkLabel: "Review overtime",
        titleKey: "overtimeAssigned",
        messageKey: "overtimeAssigned",
        params: { count: created.length, date: dateKey, start: plannedStart, end: plannedEnd },
      });
    }

    // success:true even if everyone was skipped — success:false makes apiFetch
    // throw and the client would discard `skipped`, the only place the reasons live.
    res.status(created.length ? 201 : 200).json({ success: true, created, skipped });
  }, 400),

  /* GET /api/v1/overtime-requests — role-scoped by the shared handler. */
  list,

  /* PATCH /api/v1/overtime-requests/:id/review — MANAGER (own dept)/HR/ADMIN. */
  review,

  /**
   * GET /api/v1/overtime-requests/balance?year=&month=&employeeId= — employees
   * always get their own; a MANAGER may ask about their own department.
   */
  balance: asyncHandler(async (req, res) => {
    const now = serverNow(req);
    const todayKey = dateKeyInTz(now, OT_TIMEZONE);
    const year = Number(req.query.year) || Number(todayKey.slice(0, 4));
    const month = Number(req.query.month) || Number(todayKey.slice(5, 7));

    let employeeId = req.query.employeeId;
    if (req.user.role === "EMPLOYEE" || !employeeId) {
      const employee = await resolveRequestingEmployee(req);
      if (!employee) {
        return res.json({ success: true, data: await getOvertimeBalance(null, { year, month }) });
      }
      employeeId = employee._id;
    } else if (req.user.role === "MANAGER") {
      const deptId = await getManagerDepartmentId(req);
      const target = await EmployeeModel.findById(employeeId, "department");
      if (!target || String(target.department) !== String(deptId)) {
        return res.status(403).json({
          success: false,
          message: "You can only view overtime balances for your own department.",
          code: "OT_BALANCE_ACCESS_DENIED",
        });
      }
    }

    res.json({ success: true, data: await getOvertimeBalance(employeeId, { year, month }) });
  }, 500),

  /**
   * DELETE /api/v1/overtime-requests/:id — withdraw one's own pending request
   * before the cutoff. Deleted, not marked rejected: a withdrawal is not HR's
   * decision, and deleting frees the date for a corrected resubmission.
   */
  remove: asyncHandler(async (req, res) => {
    const request = await OvertimeRequestModel.findById(req.params.id);
    if (!request) {
      throw new AppError("Overtime request not found.", "OT_REQUEST_NOT_FOUND", undefined, 404);
    }

    const employee = await resolveRequestingEmployee(req);
    if (!employee || String(request.employee) !== String(employee._id)) {
      throw new AppError(
        "You can only cancel your own overtime requests.",
        "OT_CANCEL_NOT_OWNER",
        undefined,
        403,
      );
    }
    if (request.status !== "pending") {
      throw new AppError(
        "Only a pending overtime request can be cancelled.",
        "OT_CANCEL_NOT_PENDING",
        { status: request.status },
        409,
      );
    }

    const dateKey = dateOnly(request.date);
    if (isPastCutoff(serverNow(req), dateKey)) {
      throw new AppError(
        "Overtime requests can no longer be cancelled after the 13:00 cutoff.",
        "OT_CANCEL_PAST_CUTOFF",
        { date: dateKey },
        409,
      );
    }

    await OvertimeRequestModel.deleteOne({ _id: request._id });
    res.json({ success: true, message: "Overtime request cancelled." });
  }, 400),
};

export default overtimeRequestController;
