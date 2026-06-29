import ProfileEditRequestModel, { EDITABLE_FIELDS } from "../model/ProfileEditRequest.js";
import EmployeeModel from "../model/Employee.js";
import UserModel from "../model/User.js";
import NotificationModel from "../model/Notification.js";
import { employeeToClient, employeeFromClient } from "../utils/mappers.js";

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
  const o = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return {
    id:          String(o._id),
    employeeId:  o.employee  ? String(o.employee._id  ?? o.employee)  : null,
    employeeName: o.employee?.name ?? null,
    requestedBy: o.requestedBy ? String(o.requestedBy._id ?? o.requestedBy) : null,
    changes:     o.changes,
    status:      o.status,
    reviewNote:  o.reviewNote ?? "",
    reviewedBy:  o.reviewedBy ? String(o.reviewedBy._id ?? o.reviewedBy) : null,
    reviewedAt:  o.reviewedAt ?? null,
    createdAt:   o.createdAt,
  };
}

const profileEditRequestController = {
  /* ────────────────────────────────────────────
     POST /api/v1/profile-edit-requests
     Employee submits a request to update their profile.
  ──────────────────────────────────────────── */
  create: async (req, res) => {
    try {
      const userId = req.user.id;

      // Resolve the employee record linked to this user
      const user = await UserModel.findById(userId);
      let employee = user?.employee
        ? await EmployeeModel.findById(user.employee)
        : await EmployeeModel.findOne({ email: user?.email });

      if (!employee) {
        return res.status(404).json({ success: false, message: "No employee profile is linked to your account. Ask HR to link your profile." });
      }

      const { changes } = req.body;
      if (!changes || typeof changes !== "object" || Object.keys(changes).length === 0) {
        return res.status(400).json({ success: false, message: "No changes were submitted." });
      }

      // Validate only allowed fields
      const badFields = Object.keys(changes).filter((f) => !EDITABLE_FIELDS.includes(f));
      if (badFields.length) {
        return res.status(400).json({ success: false, message: `The following fields cannot be self-edited: ${badFields.join(", ")}` });
      }

      // Build a diff: { fieldName: { from: current, to: requested } }
      const diff = {};
      for (const field of Object.keys(changes)) {
        const dbField = CLIENT_TO_DB[field] ?? field;
        const currentValue = field === "sex" ? employee.gender : employee[dbField];
        const newValue = changes[field];
        // Skip fields that haven't actually changed
        if (String(currentValue ?? "") !== String(newValue ?? "")) {
          diff[field] = { from: currentValue ?? null, to: newValue };
        }
      }

      if (Object.keys(diff).length === 0) {
        return res.status(400).json({ success: false, message: "The submitted values are the same as your current profile — nothing to change." });
      }

      // Block if there's already a pending request for this employee
      const existing = await ProfileEditRequestModel.findOne({ employee: employee._id, status: "pending" });
      if (existing) {
        return res.status(409).json({ success: false, message: "You already have a pending profile edit request. Wait for HR to review it before submitting another." });
      }

      const request = await ProfileEditRequestModel.create({
        employee: employee._id,
        requestedBy: userId,
        changes: diff,
        status: "pending",
      });

      // Notify all HR/Admin users
      const hrUsers = await UserModel.find({ role: { $in: ["MANAGER", "ADMIN"] } }, "_id");
      await Promise.all(hrUsers.map((u) =>
        NotificationModel.create({
          user: u._id,
          category: "employee",
          title: "Profile edit request",
          message: `${employee.name} has submitted a request to update their profile.`,
          read: false,
        })
      ));

      res.status(201).json({ success: true, data: toClientRequest(request) });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  },

  /* ────────────────────────────────────────────
     GET /api/v1/profile-edit-requests
     HR/Admin gets all requests.
     Employee gets only their own.
  ──────────────────────────────────────────── */
  list: async (req, res) => {
    try {
      const { status } = req.query;
      const condition = {};

      if (req.user.role === "EMPLOYEE") {
        // Employees only see their own requests
        const user = await UserModel.findById(req.user.id);
        const employee = user?.employee
          ? await EmployeeModel.findById(user.employee)
          : await EmployeeModel.findOne({ email: user?.email });
        if (employee) condition.employee = employee._id;
        else return res.json({ success: true, items: [] });
      }

      if (status && status !== "all") condition.status = status;

      const items = await ProfileEditRequestModel
        .find(condition)
        .populate("employee", "name email employeeId")
        .sort({ createdAt: -1 });

      res.json({ success: true, items: items.map(toClientRequest) });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  /* ────────────────────────────────────────────
     PATCH /api/v1/profile-edit-requests/:id/review
     HR/Admin approves or rejects a request.
  ──────────────────────────────────────────── */
  review: async (req, res) => {
    try {
      const { decision, reviewNote } = req.body;
      if (!["approved", "rejected"].includes(decision)) {
        return res.status(400).json({ success: false, message: "decision must be 'approved' or 'rejected'." });
      }

      const request = await ProfileEditRequestModel
        .findById(req.params.id)
        .populate("employee", "name email");

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

      if (decision === "approved") {
        // Apply the changes to the employee record
        const updates = {};
        for (const [field, { to }] of Object.entries(request.changes)) {
          const dbField = CLIENT_TO_DB[field] ?? field;
          if (field === "age") updates[dbField] = Number(to) || undefined;
          else updates[dbField] = to;
        }
        await EmployeeModel.findByIdAndUpdate(request.employee._id, updates);
      }

      // Notify the employee of the outcome
      const employeeUser = await UserModel.findOne({
        $or: [{ employee: request.employee._id }, { email: request.employee.email }],
      });
      if (employeeUser) {
        await NotificationModel.create({
          user: employeeUser._id,
          category: "employee",
          title: decision === "approved" ? "Profile update approved" : "Profile update rejected",
          message: decision === "approved"
            ? "Your profile edit request has been approved and your information has been updated."
            : `Your profile edit request was rejected.${reviewNote ? ` Note: ${reviewNote}` : ""}`,
          read: false,
        });
      }

      res.json({ success: true, data: toClientRequest(request) });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  },
};

export default profileEditRequestController;
