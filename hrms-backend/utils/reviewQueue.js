/**
 * reviewQueue.js — generic "employee submits something, HR/Admin reviews it"
 * pattern, generalized from the original ProfileEditRequest implementation
 * (task 0.2 in HRMS_IMPROVEMENT_TASKS.md).
 *
 * Every consumer of this pattern shares the exact same lifecycle:
 *   1. An employee submits a request tied to their own Employee record.
 *   2. It sits as "pending" until HR/Admin reviews it.
 *   3. On review, the status flips to "approved" | "rejected", a note may
 *      be attached, and the employee is notified of the outcome.
 *   4. Only on approval does anything else in the system change — and what
 *      changes is entirely specific to the request type (profile fields vs.
 *      leave balance/attendance vs., later, promotion/position fields).
 *
 * What's shared (this file):
 *   - `reviewRequestBaseFields()` — the Mongoose fields every request-type
 *     schema composes in (employee, requestedBy, status, reviewNote,
 *     reviewedBy, reviewedAt).
 *   - `resolveRequestingEmployee(req)` — looks up the Employee record for
 *     whoever is making the request.
 *   - `createReviewRequestController(options)` — builds the `list` and
 *     `review` Express handlers, which are byte-for-byte identical in
 *     shape across every consumer.
 *
 * What stays bespoke per request type (NOT here):
 *   - `create` — the validation and business rules for *what* is being
 *     requested differ completely (profile diff vs. leave balance/9AM rule
 *     vs. promotion eligibility), so each controller still owns its own.
 *   - The side effect that runs on approval (`onApprove` hook below) — e.g.
 *     writing employee field updates vs. crediting attendance records.
 *
 * Consumers: model/ProfileEditRequest.js + controller/profileEditRequestController.js,
 * model/LeaveRequest.js + controller/leaveRequestController.js. Future
 * PromotionReview / NoShowReview (HRMS_IMPROVEMENT_TASKS.md §2.5 / §4.7)
 * should compose the same way rather than hand-rolling list/review again.
 */

import mongoose from "mongoose";
import UserModel from "../model/User.js";
import EmployeeModel from "../model/Employee.js";
import NotificationModel from "../model/Notification.js";

export const REVIEW_STATUSES = ["pending", "approved", "rejected"];

/**
 * Shared Mongoose field set for any review-queue schema. Spread this into
 * a request-type's own schema definition alongside its type-specific
 * fields, e.g.:
 *
 *   const leaveRequestSchema = new mongoose.Schema({
 *     ...reviewRequestBaseFields(),
 *     startDate: { type: Date, required: true },
 *     ...
 *   }, { timestamps: true });
 */
export function reviewRequestBaseFields() {
  return {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true },
    // Optional (not required): a human-initiated request always sets this,
    // but a scheduled job auto-flagging something for review (e.g. task 2.4's
    // promotion-eligibility check, and eventually 4.7's no-show flagging)
    // has no user to attribute it to. Use systemGenerated to distinguish
    // "the system flagged this" from "a person proposed this" rather than
    // attributing automated flags to an arbitrary admin account.
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    systemGenerated: { type: Boolean, default: false },
    status: { type: String, enum: REVIEW_STATUSES, default: "pending" },
    // Optional note from HR/Admin when approving or rejecting
    reviewNote: { type: String, default: "" },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
  };
}

/**
 * Resolves the Employee record linked to the logged-in user making the
 * request: prefers the explicit User.employee link, falls back to an
 * email match (same fallback the original ProfileEditRequest controller
 * used, kept so behavior doesn't change for existing callers).
 */
export async function resolveRequestingEmployee(req) {
  const user = await UserModel.findById(req.user.id);
  if (!user) return null;
  const employee = user.employee
    ? await EmployeeModel.findById(user.employee)
    : await EmployeeModel.findOne({ email: user.email });
  return employee;
}

/**
 * Builds the shared `{ list, review }` Express handlers for a review-queue
 * resource. `create` is intentionally NOT generated here — see file header.
 *
 * @param {object} options
 * @param {import('mongoose').Model} options.Model - the resource's Mongoose model;
 *   its schema must include reviewRequestBaseFields().
 * @param {string} [options.resourceLabel] - human-readable name used in the
 *   default employee-facing notification copy, e.g. "leave request".
 * @param {Array<[string, string]>} [options.populate] - populate() calls to
 *   run before mapping to client shape, e.g. [["employee", "name email"]].
 * @param {(doc: object) => object} options.toClient - maps a populated
 *   Mongoose doc to the client-facing JSON shape.
 * @param {(request: object) => Promise<void>} [options.onApprove] - optional
 *   async side effect run once status flips to "approved" (e.g. apply
 *   profile field changes, credit a leave balance to attendance records).
 *   Runs before the employee is notified.
 * @param {(decision: 'approved'|'rejected', request: object) => {title: string, message: string}} [options.notifyEmployee] -
 *   optional override for the outcome notification copy; defaults to
 *   generic "<resourceLabel> approved/rejected" text.
 */
export function createReviewRequestController({
  Model,
  resourceLabel = "request",
  populate = [["employee", "name email employeeId"]],
  toClient,
  onApprove,
  notifyEmployee,
}) {
  function applyPopulate(query) {
    for (const [path, select] of populate) query.populate(path, select);
    return query;
  }

  return {
    /**
     * GET /:resource — HR/Admin see every request (optionally filtered via
     * ?status=pending|approved|rejected|all); Employees only ever see
     * their own, regardless of query params.
     */
    list: async (req, res) => {
      try {
        const { status } = req.query;
        const condition = {};

        if (req.user.role === "EMPLOYEE") {
          const employee = await resolveRequestingEmployee(req);
          if (!employee) return res.json({ success: true, items: [] });
          condition.employee = employee._id;
        }

        if (status && status !== "all") condition.status = status;

        const items = await applyPopulate(
          Model.find(condition).sort({ createdAt: -1 }),
        );

        res.json({ success: true, items: items.map(toClient) });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    },

    /**
     * PATCH /:resource/:id/review — HR/Admin approves or rejects a
     * still-pending request. Body: { decision: "approved"|"rejected", reviewNote? }
     */
    review: async (req, res) => {
      try {
        const { decision, reviewNote } = req.body;
        if (!["approved", "rejected"].includes(decision)) {
          return res.status(400).json({ success: false, message: "decision must be 'approved' or 'rejected'." });
        }

        const request = await applyPopulate(Model.findById(req.params.id));
        if (!request) {
          return res.status(404).json({ success: false, message: "Request not found." });
        }
        if (request.status !== "pending") {
          return res.status(409).json({ success: false, message: "This request has already been reviewed." });
        }

        request.status = decision;
        request.reviewNote = reviewNote ?? "";
        request.reviewedBy = req.user.id;
        request.reviewedAt = new Date();
        await request.save();

        if (decision === "approved" && typeof onApprove === "function") {
          await onApprove(request);
        }

        // Notify the employee of the outcome (best-effort — a missing linked
        // User account shouldn't fail the review itself).
        const employeeDoc = request.employee?._id
          ? request.employee
          : await EmployeeModel.findById(request.employee);

        if (employeeDoc) {
          const employeeUser = await UserModel.findOne({
            $or: [{ employee: employeeDoc._id }, { email: employeeDoc.email }],
          });
          if (employeeUser) {
            const copy = typeof notifyEmployee === "function"
              ? notifyEmployee(decision, request)
              : defaultNotificationCopy(decision, resourceLabel, request.reviewNote);

            await NotificationModel.create({
              user: employeeUser._id,
              category: "employee",
              title: copy.title,
              message: copy.message,
              read: false,
            });
          }
        }

        res.json({ success: true, data: toClient(request) });
      } catch (error) {
        res.status(400).json({ success: false, message: error.message });
      }
    },
  };
}

function defaultNotificationCopy(decision, resourceLabel, reviewNote) {
  const label = capitalize(resourceLabel);
  return decision === "approved"
    ? { title: `${label} approved`, message: `Your ${resourceLabel} has been approved.` }
    : {
        title: `${label} rejected`,
        message: `Your ${resourceLabel} was rejected.${reviewNote ? ` Note: ${reviewNote}` : ""}`,
      };
}

function capitalize(str = "") {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
