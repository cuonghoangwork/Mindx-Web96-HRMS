import ProfileEditRequestModel, { EDITABLE_FIELDS } from "../model/ProfileEditRequest.js";
import EmployeeModel from "../model/Employee.js";
import UserModel from "../model/User.js";
import { emitNotificationEach } from "../utils/notify.js";
import { createReviewRequestController, resolveRequestingEmployee, assertNoPendingRequest } from "../utils/reviewQueue.js";
import { departmentManagerUserIds } from "../utils/performanceScope.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { toPlainObject, reviewRequestBase } from "../utils/mappers.js";

/* ── client-shape field name → DB field name (mirrors mappers.js) ── */
const CLIENT_TO_DB = {
  name:    "name",
  phone:   "phone",
  address: "address",
  age:     "age",
  sex:     "gender",   // client calls it "sex", DB calls it "gender"
};

function toClientRequest(doc) {
  if (!doc) return doc;
  const o = toPlainObject(doc);
  return {
    ...reviewRequestBase(o),
    requestedBy: o.requestedBy ? String(o.requestedBy._id ?? o.requestedBy) : null,
    changes:     o.changes,
  };
}

/** list/review from the review-queue pattern (D6); only `create` is bespoke. */
const { list, review } = createReviewRequestController({
  Model: ProfileEditRequestModel,
  resourceLabel: "profile edit request",
  capability: "reviewProfileEdits",
  toClient: toClientRequest,
  onApprove: async (request) => {
    const updates = {};
    for (const [field, { to }] of Object.entries(request.changes)) {
      const dbField = CLIENT_TO_DB[field] ?? field;
      if (field === "age") updates[dbField] = Number(to) || undefined;
      else updates[dbField] = to;
    }
    await EmployeeModel.findByIdAndUpdate(request.employee._id ?? request.employee, updates);
  },
  notifyEmployee: (decision, request) => ({
    title: decision === "approved" ? "Profile update approved" : "Profile update rejected",
    message: decision === "approved"
      ? "Your profile edit request has been approved and your information has been updated."
      : `Your profile edit request was rejected.${request.reviewNote ? ` Note: ${request.reviewNote}` : ""}`,
    titleKey: decision === "approved" ? "profileUpdateApproved" : "profileUpdateRejected",
    messageKey: decision === "approved"
      ? "profileUpdateApproved"
      : (request.reviewNote ? "profileUpdateRejectedWithNote" : "profileUpdateRejected"),
    params: decision === "approved"
      ? undefined
      : (request.reviewNote ? { note: request.reviewNote } : undefined),
  }),
  employeeLink: (request) => `/employees/${request.employee._id ?? request.employee}`,
  employeeLinkLabel: "View profile",
});

const profileEditRequestController = {
  /** POST /api/v1/profile-edit-requests — an employee asks to change their own profile. */
  create: asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const employee = await resolveRequestingEmployee(req);

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "No employee profile is linked to your account. Ask HR to link your profile.",
        code: "EMPLOYEE_PROFILE_NOT_LINKED",
      });
    }

    const { changes } = req.body;
    if (!changes || typeof changes !== "object" || Object.keys(changes).length === 0) {
      return res.status(400).json({ success: false, message: "No changes were submitted.", code: "NO_CHANGES_SUBMITTED" });
    }

    const badFields = Object.keys(changes).filter((f) => !EDITABLE_FIELDS.includes(f));
    if (badFields.length) {
      return res.status(400).json({
        success: false,
        message: `The following fields cannot be self-edited: ${badFields.join(", ")}`,
        code: "FIELDS_NOT_SELF_EDITABLE",
        params: { fields: badFields.join(", ") },
      });
    }

    const diff = {};
    for (const field of Object.keys(changes)) {
      const dbField = CLIENT_TO_DB[field] ?? field;
      const currentValue = field === "sex" ? employee.gender : employee[dbField];
      const newValue = changes[field];
      if (String(currentValue ?? "") !== String(newValue ?? "")) {
        diff[field] = { from: currentValue ?? null, to: newValue };
      }
    }

    if (Object.keys(diff).length === 0) {
      return res.status(400).json({
        success: false,
        message: "The submitted values are the same as your current profile — nothing to change.",
        code: "PROFILE_EDIT_NO_ACTUAL_CHANGES",
      });
    }

    await assertNoPendingRequest(
      ProfileEditRequestModel,
      employee._id,
      "You already have a pending profile edit request. Wait for HR to review it before submitting another.",
      "PENDING_PROFILE_EDIT_REQUEST_EXISTS",
    );

    const request = await ProfileEditRequestModel.create({
      employee: employee._id,
      requestedBy: userId,
      changes: diff,
      status: "pending",
    });

    // Same reviewer set and addressing as a leave request (D8).
    const [hrTier, departmentManagers] = await Promise.all([
      UserModel.find({ role: { $in: ["HR", "ADMIN"] }, _id: { $ne: userId } }, "_id"),
      departmentManagerUserIds(employee.department, userId),
    ]);

    await emitNotificationEach([...hrTier.map((u) => u._id), ...departmentManagers], {
      category: "employee",
      title: "Profile edit request",
      message: `${employee.name} has submitted a request to update their profile.`,
      link: "/employees?tab=editRequests",
      linkLabel: "Review request",
      titleKey: "profileEditRequestSubmitted",
      messageKey: "profileEditRequestSubmitted",
      params: { employeeName: employee.name },
    });

    res.status(201).json({ success: true, data: toClientRequest(request) });
  }, 400),

  /* GET /api/v1/profile-edit-requests */
  list,

  /* PATCH /api/v1/profile-edit-requests/:id/review */
  review,
};

export default profileEditRequestController;
