import LeaveRequestModel, { LEAVE_TYPES, LEAVE_TYPE_LABELS, LEAVE_TYPE_ALLOWANCES } from "../model/LeaveRequest.js";
import UserModel from "../model/User.js";
import { emitNotificationEach } from "../utils/notify.js";
import AttendanceModel from "../model/Attendance.js";
import EmployeeModel from "../model/Employee.js";
import { createReviewRequestController, resolveRequestingEmployee, assertNoPendingRequest } from "../utils/reviewQueue.js";
import { getRemainingDays, getAllBalances, countWorkingDays } from "../utils/leaveBalance.js";
import { getManagerDepartmentId } from "../utils/managerScope.js";
import { departmentManagerUserIds } from "../utils/performanceScope.js";
import { AppError } from "../utils/appError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { toPlainObject, reviewRequestBase, dateOnly } from "../utils/mappers.js";

function toClientRequest(doc) {
  if (!doc) return doc;
  const o = toPlainObject(doc);
  return {
    ...reviewRequestBase(o),
    requestedBy: o.requestedBy ? String(o.requestedBy._id ?? o.requestedBy) : null,
    startDate: dateOnly(o.startDate),
    endDate: dateOnly(o.endDate),
    days: o.days,
    type: o.type,
    reason: o.reason ?? "",
    appliedAt: o.appliedAt,
  };
}

/** list/review from the review-queue pattern (D6); onApprove writes an "on-leave" attendance row per working day. */
const { list, review } = createReviewRequestController({
  Model: LeaveRequestModel,
  resourceLabel: "leave request",
  capability: "approveLeaveRequests",
  toClient: toClientRequest,
  onApprove: async (request) => {
    const employeeId = request.employee._id ?? request.employee;
    const cur = new Date(request.startDate);
    const last = new Date(request.endDate);
    cur.setHours(0, 0, 0, 0);
    last.setHours(0, 0, 0, 0);
    while (cur <= last) {
      const dow = cur.getDay();
      if (dow !== 0 && dow !== 6) {
        const date = new Date(cur);
        await AttendanceModel.findOneAndUpdate(
          { employee: employeeId, date },
          { status: "on-leave", checkIn: null, checkOut: null },
          { upsert: true, setDefaultsOnInsert: true },
        );
      }
      cur.setDate(cur.getDate() + 1);
    }
  },
  notifyEmployee: (decision, request) => ({
    title: decision === "approved" ? "Leave request approved" : "Leave request rejected",
    message: decision === "approved"
      ? `Your ${request.type} leave from ${dateOnly(request.startDate)} to ${dateOnly(request.endDate)} has been approved.`
      : `Your leave request was rejected.${request.reviewNote ? ` Note: ${request.reviewNote}` : ""}`,
    titleKey: decision === "approved" ? "leaveApproved" : "leaveRejected",
    messageKey: decision === "approved"
      ? "leaveApproved"
      : (request.reviewNote ? "leaveRejectedWithNote" : "leaveRejected"),
    params: decision === "approved"
      ? { leaveType: request.type, startDate: request.startDate, endDate: request.endDate }
      : (request.reviewNote ? { note: request.reviewNote } : undefined),
  }),
  employeeLink: "/dashboard",
  employeeLinkLabel: "View leave balance",
  notifyCategory: "leave",
});

const leaveRequestController = {
  /**
   * POST /api/v1/leave-requests — rules in DECISIONS.md D3. A request over a
   * capped type's balance is rejected, not downgraded to unpaid; same-day
   * leave is accepted only before 09:00 (host clock — see D3).
   */
  create: asyncHandler(async (req, res) => {
    const employee = await resolveRequestingEmployee(req);
    if (!employee) {
      return res.status(404).json({ success: false, message: "No employee profile is linked to your account. Ask HR to link your profile.", code: "EMPLOYEE_PROFILE_NOT_LINKED" });
    }

    const { startDate, endDate, reason, type } = req.body;
    if (!startDate) throw new AppError("startDate is required.", "START_DATE_REQUIRED");
    if (!endDate) throw new AppError("endDate is required.", "END_DATE_REQUIRED");
    if (!LEAVE_TYPES.includes(type)) {
      throw new AppError(`type must be one of: ${LEAVE_TYPES.join(", ")}.`, "INVALID_LEAVE_TYPE", { types: LEAVE_TYPES.join(", ") });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new AppError("startDate/endDate must be valid dates.", "INVALID_LEAVE_DATES");
    }
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    if (end < start) throw new AppError("endDate cannot be before startDate.", "END_DATE_BEFORE_START_DATE");

    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    if (start.getTime() === today.getTime() && now.getHours() >= 9) {
      return res.status(400).json({
        success: false,
        message: "Same-day leave must be requested before 9:00 AM. Please choose a future date.",
        code: "SAME_DAY_LEAVE_CUTOFF",
      });
    }

    const days = countWorkingDays(start, end);
    if (days <= 0) {
      throw new AppError("The selected range contains no working days.", "NO_WORKING_DAYS_IN_RANGE");
    }

    await assertNoPendingRequest(
      LeaveRequestModel,
      employee._id,
      "You already have a pending leave request. Wait for it to be reviewed before submitting another.",
      "PENDING_LEAVE_REQUEST_EXISTS",
    );

    if (type !== "unpaid") {
      const remaining = await getRemainingDays(employee._id, start.getFullYear(), type);
      if (days > remaining) {
        throw new AppError(
          `Not enough ${LEAVE_TYPE_LABELS[type]} balance: ${remaining} day${remaining === 1 ? "" : "s"} remaining, ${days} requested. Choose fewer days or apply as Unpaid.`,
          "INSUFFICIENT_LEAVE_BALANCE",
          { type, remaining, days },
        );
      }
    }

    const request = await LeaveRequestModel.create({
      employee: employee._id,
      requestedBy: req.user.id,
      startDate: start,
      endDate: end,
      days,
      type,
      reason: reason ?? "",
      appliedAt: now,
    });

    // Post-commit re-check of the one-pending rule: an earlier _id wins the race.
    const earlierPending = await LeaveRequestModel.findOne({
      employee: employee._id,
      status: "pending",
      _id: { $ne: request._id },
    }).sort({ _id: 1 });
    if (earlierPending) {
      await LeaveRequestModel.deleteOne({ _id: request._id });
      return res.status(409).json({
        success: false,
        message: "You already have a pending leave request. Wait for it to be reviewed before submitting another.",
        code: "PENDING_LEAVE_REQUEST_EXISTS",
      });
    }

    // Post-commit re-check of the balance cap: recompute in _id order (the
    // same order for both racers) and roll back if this one crossed the line.
    if (type !== "unpaid") {
      const year = start.getFullYear();
      const yearStart = new Date(Date.UTC(year, 0, 1));
      const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
      const committed = await LeaveRequestModel.find({
        employee: employee._id,
        type,
        status: { $in: ["pending", "approved"] },
        startDate: { $gte: yearStart, $lte: yearEnd },
      }).sort({ _id: 1 });
      const allowance = LEAVE_TYPE_ALLOWANCES[type];
      let cumulative = 0;
      for (const r of committed) {
        cumulative += r.days;
        if (String(r._id) === String(request._id)) {
          if (cumulative > allowance) {
            await LeaveRequestModel.deleteOne({ _id: request._id });
            throw new AppError(
              `Not enough ${LEAVE_TYPE_LABELS[type]} balance: a concurrent request already used it. Choose fewer days or apply as Unpaid.`,
              "INSUFFICIENT_LEAVE_BALANCE_CONCURRENT",
              { type },
            );
          }
          break;
        }
      }
    }

    await request.populate("employee", "name email employeeId");

    // Addressed notices, not a broadcast (D8): a department manager is never in
    // the "hr" audience, and broadcast read state is shared. The manager half
    // is the requester's own department only; the caller is excluded.
    const [hrTier, departmentManagers] = await Promise.all([
      UserModel.find({ role: { $in: ["HR", "ADMIN"] }, _id: { $ne: req.user.id } }, "_id"),
      departmentManagerUserIds(employee.department, req.user.id),
    ]);

    await emitNotificationEach([...hrTier.map((u) => u._id), ...departmentManagers], {
      category: "leave",
      title: "New leave request",
      message: `${employee.name} requested ${days} ${type} leave day${days === 1 ? "" : "s"} (${dateOnly(start)} → ${dateOnly(end)}).`,
      link: "/holidays",
      linkLabel: "Review request",
      titleKey: "leaveRequestSubmitted",
      messageKey: "leaveRequestSubmitted",
      params: { employeeName: employee.name, days, leaveType: type, startDate: start, endDate: end },
    });

    res.status(201).json({ success: true, data: toClientRequest(request) });
  }, 400),

  /* GET /api/v1/leave-requests — HR/Admin see all (optional ?status=), Employee sees own. */
  list,

  /* PATCH /api/v1/leave-requests/:id/review — HR/Admin approve/reject. */
  review,

  /**
   * GET /api/v1/leave-requests/balance?year=&employeeId= — employees always
   * get their own. Returns per-type `balances` plus a flattened Annual/PTO
   * shortcut for callers that only need the one number.
   */
  balance: asyncHandler(async (req, res) => {
    const year = Number(req.query.year) || new Date().getFullYear();
    let employeeId = req.query.employeeId;

    if (req.user.role === "EMPLOYEE" || !employeeId) {
      const employee = await resolveRequestingEmployee(req);
      if (!employee) {
        const balances = LEAVE_TYPES.map((type) => ({
          type,
          label: LEAVE_TYPE_LABELS[type],
          accrued: LEAVE_TYPE_ALLOWANCES[type] ?? null,
          used: 0,
          remaining: LEAVE_TYPE_ALLOWANCES[type] ?? null,
        }));
        return res.json({ success: true, data: { year, balances } });
      }
      employeeId = employee._id;
    } else if (req.user.role === "MANAGER") {
      const deptId = await getManagerDepartmentId(req);
      const target = await EmployeeModel.findById(employeeId, "department");
      if (!target || String(target.department) !== String(deptId)) {
        return res.status(403).json({
          success: false,
          message: "You can only view leave balances for your own department.",
          code: "LEAVE_BALANCE_ACCESS_DENIED",
        });
      }
    }

    const balances = await getAllBalances(employeeId, year);
    const annual = balances.find((b) => b.type === "annual");
    res.json({
      success: true,
      data: {
        year,
        balances,
        total: annual?.accrued ?? 0,
        used: annual?.used ?? 0,
        remaining: annual?.remaining ?? 0,
      },
    });
  }, 500),

  /** GET /api/v1/leave-requests/balances?year= — every visible employee's per-type balance in one request (MANAGER: own department). */
  balances: asyncHandler(async (req, res) => {
    const year = Number(req.query.year) || new Date().getFullYear();
    const condition = { status: { $ne: "terminated" } };
    if (req.user.role === "MANAGER") {
      condition.department = await getManagerDepartmentId(req);
    }
    const employees = await EmployeeModel.find(condition, "name employeeId department")
      .populate("department", "name");
    const items = await Promise.all(employees.map(async (e) => ({
      employeeId: String(e._id),
      name: e.name,
      employeeCode: e.employeeId,
      department: e.department?.name ?? null,
      balances: await getAllBalances(e._id, year),
    })));
    res.json({ success: true, data: { year, items } });
  }, 500),
};

export default leaveRequestController;
