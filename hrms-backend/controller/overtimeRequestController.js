/**
 * overtimeRequestController.js — Attendance Overtime, milestone M2.
 *
 * list/review come from the generic review-queue pattern
 * (utils/reviewQueue.js), same as leave/profile-edit/promotion/no-show.
 * Everything below that is bespoke, because *what* is being requested has
 * rules none of the others share: a timezone-aware application cutoff, a day
 * type that decides the pay multiplier, and three cumulative statutory caps.
 *
 * The validation order in buildRequestPayload() is deliberate and matches
 * HRMS_OVERTIME_PLAN.md §7.4 — cheap identity/date checks first, then the
 * two database lookups, then the arithmetic. It also means the error the
 * employee sees is the *first* thing wrong with their request rather than
 * whichever check happened to run first.
 */

import OvertimeRequestModel, { OT_LIVE_STATUSES } from "../model/OvertimeRequest.js";
import LeaveRequestModel from "../model/LeaveRequest.js";
import EmployeeModel from "../model/Employee.js";
import AttendanceModel from "../model/Attendance.js";
import { recomputeRecordOvertime } from "../utils/overtimeRecompute.js";
import {
  createReviewRequestController,
  resolveRequestingEmployee,
  assertNoPendingRequest,
} from "../utils/reviewQueue.js";
import { getManagerDepartmentId } from "../utils/managerScope.js";
import { notifyHR } from "./notificationController.js";
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

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function dateOnly(d) {
  return d ? new Date(d).toISOString().slice(0, 10) : null;
}

function toClientRequest(doc) {
  if (!doc) return doc;
  const o = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return {
    id: String(o._id),
    employeeId: o.employee ? String(o.employee._id ?? o.employee) : null,
    employeeName: o.employee?.name ?? null,
    employeeCode: o.employee?.employeeId ?? null,
    requestedBy: o.requestedBy ? String(o.requestedBy._id ?? o.requestedBy) : null,
    date: dateOnly(o.date),
    plannedStart: o.plannedStart,
    plannedEnd: o.plannedEnd,
    plannedMinutes: o.plannedMinutes,
    // Derived, never stored — see the plannedMinutes note in model/OvertimeRequest.js.
    plannedHours: minutesToHours(o.plannedMinutes ?? 0),
    origin: o.origin,
    dayType: o.dayType,
    reason: o.reason ?? "",
    appliedAt: o.appliedAt,
    status: o.status,
    reviewNote: o.reviewNote ?? "",
    reviewedBy: o.reviewedBy ? String(o.reviewedBy._id ?? o.reviewedBy) : null,
    reviewedAt: o.reviewedAt ?? null,
    createdAt: o.createdAt,
  };
}

/**
 * Steps 2-10 of §7.4's validation, shared by create() (one employee) and
 * assign() (many). Throws an AppError with a specific code on the first
 * failure; returns the document payload on success.
 *
 * Step 1 (resolving *which* employee) is the caller's job, because it
 * differs: create() always uses the requester's own record, assign() takes
 * a list and checks departmental scope.
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
  // 2. A valid, non-past date. Compared as date *keys* in the scheduler's
  //    timezone — never via getHours()/getDate(), which read the container's
  //    clock (UTC on Render) and would shift the boundary by 7 hours.
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

  // 3. The 13:00 cutoff on the overtime date itself. Skipped for HR/Admin
  //    and for assignments — the rule exists to stop employees from
  //    retroactively claiming a shift, not to stop management scheduling one.
  if (!skipCutoff && isPastCutoff(now, dateKey)) {
    throw new AppError(
      "Overtime applications close at 13:00 on the overtime date.",
      "OT_APPLICATION_PAST_CUTOFF",
      { date: dateKey },
      409,
    );
  }

  // 4. One live request per employee per date. Backed by a partial unique
  //    index (model/OvertimeRequest.js) — this pre-check only exists to turn
  //    a duplicate-key error into a readable message.
  await assertNoPendingRequest(
    OvertimeRequestModel,
    employee._id,
    "There is already an overtime request for this date.",
    "OT_DUPLICATE_FOR_DATE",
    { date: dateKey },
    { date, status: { $in: OT_LIVE_STATUSES } },
  );

  // 5. Not a day the employee is already on approved leave.
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

  // 6. Day type decides both the multiplier and the daily cap. Snapshotted
  //    onto the request so a Holiday row added later cannot silently
  //    reprice an already-approved shift.
  const dayType = resolveDayType(dateKey, { isHoliday: await isHolidayOn(date) });

  // 7. Span must not cross midnight — splitDayNight throws OT_CROSSES_MIDNIGHT
  //    rather than letting hoursBetween's Math.max(0, ...) quietly return 0.
  const { dayMinutes, nightMinutes } = splitDayNight(plannedStart, plannedEnd);
  const plannedMinutes = dayMinutes + nightMinutes;

  // 7b. On a working day, overtime cannot start before the normal shift ends.
  //     Without this a request for 17:00-20:00 is accepted as 3h (it clears the
  //     4h cap) but only ever pays 2h, because utils/overtimeRecompute.js
  //     correctly clamps the credited span to the 18:00 boundary. The clamp is
  //     right; accepting a request it will silently shorten is not. Rest days
  //     and holidays have no normal shift, so the rule does not apply to them.
  if (dayType === "normal" && parseHHMM(plannedStart) < parseHHMM(OT_WORKDAY_START)) {
    throw new AppError(
      `Overtime on a working day cannot start before ${OT_WORKDAY_START}.`,
      "OT_STARTS_BEFORE_WINDOW",
      { start: OT_WORKDAY_START },
      400,
    );
  }

  // 8. Daily cap — 4h of overtime on a working day, 12h of total work on a
  //    rest day or public holiday (where the whole span is overtime).
  const dailyCapHours = dailyCapHoursFor(dayType);
  if (plannedMinutes > dailyCapHours * 60) {
    throw new AppError(
      `Overtime on this day is capped at ${dailyCapHours} hours.`,
      "OT_EXCEEDS_DAILY_CAP",
      { cap: dailyCapHours, requested: minutesToHours(plannedMinutes), dayType },
      409,
    );
  }

  // 9/10. Cumulative caps. Pending requests count too — otherwise an
  //       employee could queue several individually-legal requests that are
  //       collectively over the ceiling.
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
 * The caps checks above read committed state *before* this request commits,
 * so two concurrent submissions for different dates in the same month can
 * both pass. Re-verify once committed: walk every live request in the window
 * in _id order (deterministic, and identical for both racers once both have
 * landed) and roll this one back if it is the row that crossed the line.
 *
 * Exactly the pattern leaveRequestController.create uses for its balance
 * cap, and for the same reason. The per-date duplicate rule needs no
 * equivalent — a partial unique index settles that one atomically.
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
 * list/review from the shared pattern; onApprove is the overtime-specific side
 * effect (M3).
 *
 * Approval writes the derived hours onto that day's attendance record. It is
 * safe to run late — the day after the close job already wrote the record — and
 * safe to run twice, because applyOvertimeToRecord derives every field from
 * scratch rather than incrementing.
 *
 * The late case is the one that matters: with nothing approved at close time
 * the record was shut at 18:00 and `checkOut` no longer shows when the
 * employee left. `rawCheckOut` does, so an approval tomorrow still credits
 * the hours actually clocked and marks them `otEvidence: "clocked"`. When
 * there is no clock evidence it falls back to the planned span and marks it
 * `"planned"`, which is what the queue shows a warning against.
 */
const { list, review } = createReviewRequestController({
  Model: OvertimeRequestModel,
  resourceLabel: "overtime request",
  capability: "approveOvertimeRequests",
  toClient: toClientRequest,
  /**
   * The queue's warning triangle needs otEvidence, which lives on Attendance,
   * not on the request — the request records what was *asked for*, the
   * attendance record what actually happened. Without this the flag silently
   * renders nothing, because the field is simply not in the payload.
   *
   * One query for the whole page rather than one per row: the pairs are
   * {employee, date} and Attendance is indexed on exactly that.
   */
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
    const record = await AttendanceModel.findOne({ employee: employeeId, date: request.date });
    // No attendance row yet — approved ahead of the day, or the employee never
    // clocked in. Nothing to derive; the close job applies it at day's end.
    if (!record) return;

    // Pass the request explicitly: reviewQueue sets status = "approved" on this
    // in-memory document before calling us, and it has not been saved yet.
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
   * POST /api/v1/overtime-requests — apply for overtime.
   *
   * EMPLOYEE always applies for themselves; an employeeId in the body is
   * ignored rather than rejected, matching attendanceController.checkIn's
   * "override whatever was sent" rule. HR/Admin bypass the 13:00 cutoff so
   * they can still record same-day overtime; use /assign for someone else.
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

      await notifyHR({
        title: "New overtime request",
        message: `${employee.name} requested overtime on ${dateKey} (${payload.plannedStart}-${payload.plannedEnd}).`,
        category: "employee",
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
      });

      res.status(201).json({ success: true, data: toClientRequest(request) });
    } catch (error) {
      res.status(error.status || 400).json({
        success: false, message: error.message, code: error.code, params: error.params,
      });
    }
  },

  /**
   * POST /api/v1/overtime-requests/assign — MANAGER (own department) / HR /
   * ADMIN assign overtime to several employees at once.
   *
   * Partial success is the point: one employee being over their monthly cap
   * must not silently discard the other nine assignments. Each employee is
   * validated independently and reported in `created` or `skipped`, so the
   * caller can show exactly who was left out and why.
   *
   * Assigned requests are created *pending*, not pre-approved: the approval
   * queue stays the single place overtime becomes real, and the
   * approveOvertimeRequests capability keeps meaning what it says.
   */
  assign: async (req, res) => {
    try {
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
          const employee = await EmployeeModel.findById(employeeId, "name email employeeId department");
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
            // Assignment is a management action — the cutoff exists to stop
            // employees back-filling their own shifts, not to stop a manager
            // scheduling one.
            skipCutoff: true,
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
            // params travels with the code so the client can interpolate the
            // translated message ("...the {{cap}}-hour monthly cap") rather
            // than rendering the placeholder.
            params: err.params,
            message: err.message,
          });
        }
      }

      if (created.length) {
        await notifyHR({
          title: "Overtime assigned",
          message: `${created.length} employee(s) were assigned overtime on ${dateKey} (${plannedStart}-${plannedEnd}).`,
          category: "employee",
          link: "/attendance",
          linkLabel: "Review overtime",
          titleKey: "overtimeAssigned",
          messageKey: "overtimeAssigned",
          params: { count: created.length, date: dateKey, start: plannedStart, end: plannedEnd },
        });
      }

      // Always a success when the batch itself was well-formed, even if every
      // employee was skipped. The per-employee outcomes are DATA, not errors:
      // success:false makes apiFetch throw, and the client then discards
      // `skipped` — the only place the reasons live, and the whole point of
      // the partial-success contract. A genuinely bad request (nothing
      // selected, bad span, wrong role) still throws above and returns 4xx.
      // 201 when something was created, 200 when the answer is just a report.
      res.status(created.length ? 201 : 200).json({ success: true, created, skipped });
    } catch (error) {
      res.status(error.status || 400).json({
        success: false, message: error.message, code: error.code, params: error.params,
      });
    }
  },

  /* GET /api/v1/overtime-requests — role-scoped by the shared handler. */
  list,

  /* PATCH /api/v1/overtime-requests/:id/review — MANAGER (own dept)/HR/ADMIN. */
  review,

  /**
   * GET /api/v1/overtime-requests/balance?year=&month=&employeeId=
   *
   * Employees always get their own totals regardless of query params; a
   * MANAGER may pass ?employeeId= for someone in their own department. Same
   * scoping rule as leaveRequestController.balance.
   */
  balance: async (req, res) => {
    try {
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
    } catch (error) {
      res.status(error.status || 500).json({
        success: false, message: error.message, code: error.code, params: error.params,
      });
    }
  },

  /**
   * DELETE /api/v1/overtime-requests/:id — an employee withdraws their own
   * still-pending request, before the cutoff.
   *
   * Deleted rather than marked "rejected": a rejection is a decision someone
   * made about the request, and conflating the two would put the employee's
   * own withdrawals in HR's rejected list. Deleting also frees the date for
   * a corrected resubmission, which the partial unique index would otherwise
   * still block.
   */
  remove: async (req, res) => {
    try {
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
    } catch (error) {
      res.status(error.status || 400).json({
        success: false, message: error.message, code: error.code, params: error.params,
      });
    }
  },
};

export default overtimeRequestController;
