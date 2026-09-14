/**
 * The review-queue pattern (DECISIONS.md D6): an employee submits, it sits
 * pending, HR/Admin (or a scoped MANAGER) approves or rejects, and only an
 * approval changes anything else — via the per-type `onApprove` hook.
 * `list` and `review` are generated here; `create` stays bespoke because the
 * rules for *what* is requested differ per type.
 */

import mongoose from "mongoose";
import UserModel from "../model/User.js";
import EmployeeModel from "../model/Employee.js";
import { emitNotification } from "./notify.js";
import { getManagerDepartmentId, resolveEmployeeForUser } from "./managerScope.js";
import { hasCapability, CAPABILITY_DISABLED_MESSAGE } from "./permissions.js";
import { AppError } from "./appError.js";

export const REVIEW_STATUSES = ["pending", "approved", "rejected"];

/** Spread into a request-type schema alongside its own fields. */
export function reviewRequestBaseFields() {
  return {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true },
    // null + systemGenerated:true = a scheduled job flagged this; there is no user to attribute it to.
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    systemGenerated: { type: Boolean, default: false },
    status: { type: String, enum: REVIEW_STATUSES, default: "pending" },
    reviewNote: { type: String, default: "" },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
  };
}

/** The Employee record of the logged-in user — the User.employee link, falling back to an email match. */
export async function resolveRequestingEmployee(req) {
  const user = await UserModel.findById(req.user.id);
  return resolveEmployeeForUser(user);
}

/**
 * 409 if the employee already has a pending request in `Model`. `scope` is
 * merged over the base query for narrower rules (overtime: one live request
 * per date). A pre-check for a clean message, not a concurrency guarantee —
 * overtime backs it with a unique index, leave re-checks after committing.
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
 * Builds `{ list, review }` for a review-queue resource.
 *
 * @param {import('mongoose').Model} options.Model  schema must include reviewRequestBaseFields()
 * @param {string} [options.resourceLabel]  used in the default outcome copy, e.g. "leave request"
 * @param {Array<[string, string]>} [options.populate]  populate() calls before mapping
 * @param {(doc: object) => object} options.toClient
 * @param {(request: object) => Promise<void>} [options.onApprove]  side effect, run before the status is saved
 * @param {(decision, request) => {title, message, link?, linkLabel?, titleKey?, messageKey?, params?}} [options.notifyEmployee]  outcome copy override
 * @param {string|((request) => string)} [options.employeeLink]  where the outcome notice sends the employee, unless the copy sets its own
 * @param {string} [options.employeeLinkLabel]
 * @param {(items: object[]) => Promise<object[]>} [options.enrichItems]  one batched pass over the mapped list — never a query per item
 * @param {string} [options.capability]  RolePermission key a MANAGER additionally needs to review; never affects HR/ADMIN
 * @param {string} [options.notifyCategory]  category of the outcome notice — decides whether it may leave the app (D7)
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
  enrichItems,
  notifyCategory = "employee",
}) {
  function applyPopulate(query) {
    for (const [path, select] of populate) query.populate(path, select);
    return query;
  }

  return {
    /** GET /:resource?status= — HR/Admin see all, MANAGER their department, EMPLOYEE only their own. */
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

        const mapped = items.map(toClient);
        res.json({
          success: true,
          items: typeof enrichItems === "function" ? await enrichItems(mapped) : mapped,
        });
      } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.message, code: error.code, params: error.params });
      }
    },

    /** PATCH /:resource/:id/review — body { decision: "approved"|"rejected", reviewNote? } */
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

        // Side effect first: if it throws, the request stays pending rather
        // than approved-with-no-effect.
        if (decision === "approved" && typeof onApprove === "function") {
          await onApprove(request);
        }

        try {
          await request.save();
        } catch (saveError) {
          // onApprove has already committed, so the status must not stay
          // pending — a targeted update skips the full-document validation
          // that blocked save().
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

        // Best-effort: a missing linked User must not fail the review.
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

            await emitNotification({
              user: employeeUser._id,
              category: notifyCategory,
              title: copy.title,
              message: copy.message,
              link: copy.link ?? resolvedLink,
              linkLabel: copy.linkLabel ?? employeeLinkLabel,
              titleKey: copy.titleKey,
              messageKey: copy.messageKey,
              params: copy.params,
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
