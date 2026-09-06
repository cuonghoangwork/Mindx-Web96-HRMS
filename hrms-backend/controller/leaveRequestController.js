import LeaveRequestModel, { LEAVE_TYPES, LEAVE_TYPE_LABELS, LEAVE_TYPE_ALLOWANCES } from "../model/LeaveRequest.js";
import UserModel from "../model/User.js";
import { emitNotificationEach } from "../utils/notify.js";
import AttendanceModel from "../model/Attendance.js";
import EmployeeModel from "../model/Employee.js";
import { createReviewRequestController, resolveRequestingEmployee, assertNoPendingRequest } from "../utils/reviewQueue.js";
import { getRemainingDays, getAllBalances, countWorkingDays } from "../utils/leaveBalance.js";
import { getManagerDepartmentId } from "../utils/managerScope.js";
import { AppError } from "../utils/appError.js";

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
    requestedBy: o.requestedBy ? String(o.requestedBy._id ?? o.requestedBy) : null,
    startDate: dateOnly(o.startDate),
    endDate: dateOnly(o.endDate),
    days: o.days,
    type: o.type,
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
 * list/review reused from the generic review-queue pattern (utils/reviewQueue.js,
 * task 0.2) — same shape as ProfileEditRequest's. Only the approval side effect
 * and notification copy are leave-specific:
 *   - onApprove marks each working day of the range "on-leave" on the
 *     employee's Attendance record, so Attendance.jsx reflects it without a
 *     separate sync step.
 */
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
  // A decision on your own leave is the clearest case for reaching a phone
  // (utils/notifyPolicy.js). It only qualifies if it is filed under "leave".
  notifyCategory: "leave",
});

const leaveRequestController = {
  /**
   * POST /api/v1/leave-requests
   * Employee applies for leave.
   *
   * - `type` is chosen by the employee (annual/sick/parental/bereavement/
   *   unpaid) and validated here against LEAVE_TYPES and, for capped types,
   *   against their remaining balance for the request's year — a request
   *   that would exceed the remaining balance for a capped type is
   *   rejected rather than silently downgraded to unpaid, since the
   *   employee explicitly picked the type. "unpaid" has no cap.
   * - 9AM same-day rule: a request whose startDate is today is only
   *   accepted before 9:00 AM server time; after that, the employee can
   *   still apply, just not for today (they can pick a future date).
   */
  create: async (req, res) => {
    try {
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

      // Block if there's already a pending request for this employee — same
      // rule profileEditRequestController.js and promotionRequestController.js
      // apply for their own request types.
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

      // The pending-request pre-check above has the same race: two
      // concurrent submissions can both pass it before either commits. Re-
      // verify now that this request is committed — if another pending
      // request for this employee has an earlier _id, this one lost the
      // race and must be rolled back (mirrors the balance-cap re-check
      // below, which closes the identical race for the balance check).
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

      // The pre-check above (getRemainingDays) reads committed state before
      // this write, so two concurrent requests for the same employee/type
      // can both pass it before either commits. Re-verify now that this
      // request is committed: recompute usage across every committed
      // request of this type/year in insertion order (_id order, which is
      // deterministic and identical for both racing requests once both have
      // committed) and roll this one back if it's the one that pushed the
      // type over its cap.
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

      // Addressed one-per-reviewer rather than an "hr" broadcast: MANAGER is
      // department-scoped and a broadcast carries no department. Who belongs in
      // this set is this call site's decision, not the spine's — see the header
      // of utils/notify.js.
      const reviewers = await UserModel.find({ role: { $in: ["MANAGER", "HR", "ADMIN"] } }, "_id");
      await emitNotificationEach(reviewers.map((u) => u._id), {
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
    } catch (error) {
      res.status(error.status || 400).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },

  /* GET /api/v1/leave-requests — HR/Admin see all (optional ?status=), Employee sees own. */
  list,

  /* PATCH /api/v1/leave-requests/:id/review — HR/Admin approve/reject. */
  review,

  /**
   * GET /api/v1/leave-requests/balance?year=&employeeId=
   * Employees always get their own balance regardless of query params.
   * HR/Admin can pass ?employeeId= to check someone else's; omitting it
   * falls back to their own (rarely meaningful for non-employees, but
   * keeps the endpoint safe to call without params).
   *
   * Returns a per-type breakdown (`balances`), one row per LEAVE_TYPES
   * entry, plus a flattened `annual`/`total`/`remaining`/`used` for
   * backwards-compatible callers that only care about the Annual/PTO pool
   * (e.g. the self-service dashboard's "PTO Days Remaining" stat).
   */
  balance: async (req, res) => {
    try {
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
          // Flattened Annual/PTO shortcut — kept for callers (dashboard stat
          // card) that only need the one number, not the full breakdown.
          total: annual?.accrued ?? 0,
          used: annual?.used ?? 0,
          remaining: annual?.remaining ?? 0,
        },
      });
    } catch (error) {
      res.status(error.status || 500).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },

  /**
   * GET /api/v1/leave-requests/balances?year= — MANAGER/HR/ADMIN only.
   * One getAllBalances() row per employee they can see (MANAGER scoped to
   * their own department, same rule as list/review). Exists so callers
   * like the Holidays "Leave balances" panel can get every employee's
   * authoritative per-type balance in one request instead of re-deriving
   * it client-side from raw leave requests (which misses the late
   * half-day annual deduction and duplicates LEAVE_TYPE_ALLOWANCES).
   */
  balances: async (req, res) => {
    try {
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
    } catch (error) {
      res.status(error.status || 500).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },
};

export default leaveRequestController;
