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
import { getManagerDepartmentId, resolveEmployeeForUser } from "./managerScope.js";
import { hasCapability, CAPABILITY_DISABLED_MESSAGE } from "./permissions.js";
import { AppError } from "./appError.js";

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
  return resolveEmployeeForUser(user);
}

/**
 * Rejects with a 409 if the employee already has a pending request in
 * `Model` — the shared "block a second submission until the first is
 * reviewed" rule every request-type's create() enforces.
 *
 * `scope` is an optional extra filter merged over the base query, for
 * request types whose "already has one" rule is narrower or wider than
 * "one pending per employee". Overtime is the first: its rule is one *live*
 * (pending or approved) request per employee per **date**, so it passes
 * `{ date, status: { $in: ["pending", "approved"] } }` — the date narrows the
 * scope, and the status key overrides the default. Extended rather than
 * forked because leave will eventually want the same per-range treatment.
 *
 * Note for callers with a uniqueness constraint that must hold under
 * concurrency: this is a pre-check for a clean error message, not a
 * guarantee. Two concurrent submissions can both pass it before either
 * commits. Overtime backs it with a partial unique index (see
 * model/OvertimeRequest.js); leave re-checks after committing.
 */
export async function assertNoPendingRequest(Model, employeeId, message, code, params, scope = {}) {
  const existing = await Model.findOne({ employee: employeeId, status: "pending", ...scope });
  if (existing) {
    const err = new AppError(message, code, params);
    err.status = 409;
    throw err;
  }
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
 * @param {(decision: 'approved'|'rejected', request: object) => {title: string, message: string, link?: string, linkLabel?: string}} [options.notifyEmployee] -
 *   optional override for the outcome notification copy; defaults to
 *   generic "<resourceLabel> approved/rejected" text.
 * @param {string|((request: object) => string)} [options.employeeLink] - where the
 *   outcome notification sends the employee, e.g. "/attendance" or a function
 *   of the (populated) request for a per-employee route like a profile page.
 *   Used whenever `notifyEmployee`'s return doesn't set its own `link` —
 *   most consumers send the employee to the same place on both approval and
 *   rejection, so this is one place to say that instead of repeating it in
 *   every branch of `notifyEmployee`. Omit if there's nowhere meaningful to
 *   send the employee.
 * @param {string} [options.employeeLinkLabel] - label for `employeeLink`,
 *   same override rule as above.
 * @param {string} [options.capability] - Solo Gaps Milestone 3: an optional
 *   RolePermission capability key (see utils/permissions.js). When set,
 *   MANAGER additionally needs this capability enabled to review — never
 *   affects HR/ADMIN, who already passed authorize() unconditionally.
 *   Needed because this one `review` function backs multiple resources
 *   (leave requests, profile-edit requests) that must be toggled
 *   independently — the capability key is supplied per call site instead
 *   of being hardcoded here.
 */
export function createReviewRequestController({
  Model,
  resourceLabel = "request",
  populate = [["employee", "name email employeeId"]],
  toClient,
  onApprove,
  notifyEmployee,
  employeeLink,
  employeeLinkLabel,
  capability,
}) {
  function applyPopulate(query) {
    for (const [path, select] of populate) query.populate(path, select);
    return query;
  }

  return {
    /**
     * GET /:resource — Admin sees every request (optionally filtered via
     * ?status=pending|approved|rejected|all); Manager sees only requests
     * for employees in their own department; Employees only ever see
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
        } else if (req.user.role === "MANAGER") {
          const deptId = await getManagerDepartmentId(req);
          const deptEmployees = await EmployeeModel.find({ department: deptId }, "_id");
          condition.employee = { $in: deptEmployees.map((e) => e._id) };
        }

        if (status && status !== "all") condition.status = status;

        const items = await applyPopulate(
          Model.find(condition).sort({ createdAt: -1 }),
        );

        res.json({ success: true, items: items.map(toClient) });
      } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.message, code: error.code, params: error.params });
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
          return res.status(400).json({ success: false, message: "decision must be 'approved' or 'rejected'.", code: "INVALID_REVIEW_DECISION" });
        }

        const request = await applyPopulate(Model.findById(req.params.id));
        if (!request) {
          return res.status(404).json({ success: false, message: "Request not found.", code: "REVIEW_REQUEST_NOT_FOUND" });
        }
        if (request.status !== "pending") {
          return res.status(409).json({ success: false, message: "This request has already been reviewed.", code: "REVIEW_REQUEST_ALREADY_REVIEWED" });
        }

        if (req.user.role === "MANAGER" && capability && !(await hasCapability("MANAGER", capability))) {
          return res.status(403).json({ success: false, message: CAPABILITY_DISABLED_MESSAGE, code: "CAPABILITY_DISABLED" });
        }

        if (req.user.role === "MANAGER") {
          const deptId = await getManagerDepartmentId(req);
          const employeeId = request.employee?._id ?? request.employee;
          const employeeDept = await EmployeeModel.findById(employeeId, "department");
          if (!employeeDept || String(employeeDept.department) !== String(deptId)) {
            return res.status(403).json({
              success: false,
              message: "You can only review requests for employees in your own department.",
              code: "MANAGER_REVIEW_OUT_OF_DEPARTMENT",
            });
          }
        }

        request.status = decision;
        request.reviewNote = reviewNote ?? "";
        request.reviewedBy = req.user.id;
        request.reviewedAt = new Date();

        // Run the approval side effect before persisting the status change —
        // if onApprove throws, the request must stay "pending" in the DB
        // rather than being committed as "approved" with the side effect
        // never having applied.
        if (decision === "approved" && typeof onApprove === "function") {
          await onApprove(request);
        }

        try {
          await request.save();
        } catch (saveError) {
          // onApprove has already committed its side effect by this point
          // (a separate document from `request`), so the reviewed status
          // must not be left stuck at "pending" — fall back to a targeted
          // update, which (unlike .save()) doesn't run full-document
          // validation and so can't be blocked by an unrelated stale field
          // elsewhere in the document.
          console.error(
            `[reviewQueue] request.save() failed after onApprove for ${Model.modelName} ${request._id}, falling back to a targeted update:`,
            saveError.message,
          );
          await Model.findByIdAndUpdate(request._id, {
            status: request.status,
            reviewNote: request.reviewNote,
            reviewedBy: request.reviewedBy,
            reviewedAt: request.reviewedAt,
          });
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
            const resolvedLink = typeof employeeLink === "function" ? employeeLink(request) : employeeLink;

            await NotificationModel.create({
              user: employeeUser._id,
              category: "employee",
              title: copy.title,
              message: copy.message,
              link: copy.link ?? resolvedLink ?? null,
              linkLabel: copy.linkLabel ?? employeeLinkLabel ?? null,
              read: false,
              titleKey: copy.titleKey ?? null,
              messageKey: copy.messageKey ?? null,
              params: copy.params ?? null,
            });
          }
        }

        res.json({ success: true, data: toClient(request) });
      } catch (error) {
        res.status(error.status || 400).json({ success: false, message: error.message, code: error.code, params: error.params });
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
