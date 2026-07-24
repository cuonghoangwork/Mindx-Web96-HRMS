import LeaveRequestModel, { PAID_LEAVE_DAYS_PER_YEAR } from "../model/LeaveRequest.js";
import UserModel from "../model/User.js";
import NotificationModel from "../model/Notification.js";
import AttendanceModel from "../model/Attendance.js";
import { createReviewRequestController, resolveRequestingEmployee } from "../utils/reviewQueue.js";
import { getRemainingPaidDays, countWorkingDays } from "../utils/leaveBalance.js";

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
  }),
});

const leaveRequestController = {
  /**
   * POST /api/v1/leave-requests
   * Employee applies for leave.
   *
   * - `type` (paid/unpaid) is computed here from the employee's remaining
   *   balance for the request's year — never trusted from the client.
   * - 9AM same-day rule: a request whose startDate is today is only
   *   accepted before 9:00 AM server time; after that, the employee can
   *   still apply, just not for today (they can pick a future date).
   */
  create: async (req, res) => {
    try {
      const employee = await resolveRequestingEmployee(req);
      if (!employee) {
        return res.status(404).json({ success: false, message: "No employee profile is linked to your account. Ask HR to link your profile." });
      }

      const { startDate, endDate, reason } = req.body;
      if (!startDate) throw new Error("startDate is required.");
      if (!endDate) throw new Error("endDate is required.");

      const start = new Date(startDate);
      const end = new Date(endDate);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        throw new Error("startDate/endDate must be valid dates.");
      }
      start.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);
      if (end < start) throw new Error("endDate cannot be before startDate.");

      const now = new Date();
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      if (start.getTime() === today.getTime() && now.getHours() >= 9) {
        return res.status(400).json({
          success: false,
          message: "Same-day leave must be requested before 9:00 AM. Please choose a future date.",
        });
      }

      const days = countWorkingDays(start, end);
      if (days <= 0) {
        throw new Error("The selected range contains no working days.");
      }

      const remaining = await getRemainingPaidDays(employee._id, start.getFullYear());
      const type = days <= remaining ? "paid" : "unpaid";

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
      await request.populate("employee", "name email employeeId");

      // Notify all HR/Admin users
      const hrUsers = await UserModel.find({ role: { $in: ["MANAGER", "ADMIN"] } }, "_id");
      await Promise.all(hrUsers.map((u) =>
        NotificationModel.create({
          user: u._id,
          category: "leave",
          title: "New leave request",
          message: `${employee.name} requested ${days} ${type} leave day${days === 1 ? "" : "s"} (${dateOnly(start)} → ${dateOnly(end)}).`,
          read: false,
        })
      ));

      res.status(201).json({ success: true, data: toClientRequest(request) });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
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
   */
  balance: async (req, res) => {
    try {
      const year = Number(req.query.year) || new Date().getFullYear();
      let employeeId = req.query.employeeId;

      if (req.user.role === "EMPLOYEE" || !employeeId) {
        const employee = await resolveRequestingEmployee(req);
        if (!employee) {
          return res.json({
            success: true,
            data: { year, total: PAID_LEAVE_DAYS_PER_YEAR, remaining: PAID_LEAVE_DAYS_PER_YEAR, used: 0 },
          });
        }
        employeeId = employee._id;
      }

      const remaining = await getRemainingPaidDays(employeeId, year);
      res.json({
        success: true,
        data: { year, total: PAID_LEAVE_DAYS_PER_YEAR, remaining, used: PAID_LEAVE_DAYS_PER_YEAR - remaining },
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
};

export default leaveRequestController;
