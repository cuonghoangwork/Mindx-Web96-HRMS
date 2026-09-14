import EmployeeModel from "../model/Employee.js";
import UserModel from "../model/User.js";
import DepartmentModel from "../model/Department.js";
import { employeeToClient, employeeFromClient } from "../utils/mappers.js";
import { resolveDepartmentIdByName } from "../utils/refResolvers.js";
import {
  uploadBufferToCloudinary,
  isCloudinaryConfigured,
  destroyCloudinaryAsset,
} from "../utils/cloudinary.js";
import { notifyHR } from "../utils/notify.js";
import { logAction } from "../utils/auditLog.js";
import bcrypt from "bcryptjs";
import {
  generateTempPassword,
  resolveAccountEmail,
  assertCanAssignRole,
} from "../utils/credentials.js";
import { getManagerDepartmentId } from "../utils/managerScope.js";
import { AppError } from "../utils/appError.js";
import { actorNotifyKeys } from "../utils/notifyActor.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const SALT_ROUNDS = 10;
const DOCUMENT_TYPES = ["offer_letter", "id_scan", "other"];

const employeeController = {
  getAll: asyncHandler(async (req, res) => {
    const {
      pageSize = 10,
      pageNumber = 1,
      search,
      department,
      status,
      type,
      sortBy = "name",
      sortDir = 1,
    } = req.query;

    const condition = {};
    if (search) condition.name = { $regex: search, $options: "i" };

    if (department) {
      const names = department.split(",").map((d) => d.trim()).filter(Boolean);
      if (names.length) {
        const depts = await DepartmentModel.find({ name: { $in: names } }, "_id");
        condition.department = { $in: depts.map((d) => d._id) };
      }
    }

    // The directory read is company-wide for every role (even EMPLOYEE);
    // MANAGER's department scoping applies to writes, not to this read.
    if (status && status !== "all") {
      const mapped = employeeFromClient({ status });
      if (mapped.status) condition.status = mapped.status;
    }
    if (type && type !== "all") {
      const mapped = employeeFromClient({ type });
      if (mapped.contractType) condition.contractType = mapped.contractType;
    }

    const SORT_FIELD_MAP = { type: "contractType", sex: "gender", salary: "annualSalary" };
    const dbSortField = SORT_FIELD_MAP[sortBy] || sortBy;

    const totalItems = await EmployeeModel.countDocuments(condition);
    const totalPages = Math.ceil(totalItems / pageSize);
    const skip = (pageNumber - 1) * pageSize;

    const docs = await EmployeeModel.find(condition)
      .populate("department", "name")
      .sort({ [dbSortField]: Number(sortDir) })
      .skip(skip)
      .limit(Number(pageSize));

    res.json({
      success: true,
      totalItems,
      totalPages,
      currentPage: +pageNumber,
      items: docs.map(employeeToClient),
    });
  }, 500),

  getDetail: asyncHandler(async (req, res) => {
    const employee = await EmployeeModel.findById(req.params.id).populate("department", "name");
    if (!employee) throw new AppError("Employee not found.", "EMPLOYEE_NOT_FOUND");

    if (req.user.role === "EMPLOYEE") {
      const myEmp = await EmployeeModel.findOne({ userId: req.user.id });
      if (!myEmp || String(myEmp._id) !== String(employee._id)) {
        return res.status(403).json({ success: false, message: "Access denied.", code: "ACCESS_DENIED" });
      }
    }


    res.json({ success: true, data: employeeToClient(employee) });
  }, 404),

  // GET /api/v1/employees/me
  getMyProfile: asyncHandler(async (req, res) => {
    const user = await UserModel.findById(req.user.id);
    if (!user) throw new AppError("User not found.", "USER_NOT_FOUND");

    let employee = null;
    if (user.employee) {
      employee = await EmployeeModel.findById(user.employee).populate("department", "name");
    }
    if (!employee) {
      employee = await EmployeeModel.findOne({ email: user.email }).populate("department", "name");
      if (employee && !employee.userId) {
        employee.userId = user._id;
        await employee.save();
      }
    }

    if (!employee) {
      return res.json({ success: true, data: null, message: "No employee profile linked to this account." });
    }

    res.json({ success: true, data: employeeToClient(employee) });
  }, 500),

  create: async (req, res) => {
    let createdUserId = null;
    try {
      const { employeeId, name, email, createAccount, accountRole = "EMPLOYEE" } = req.body;
      if (!employeeId) throw new AppError("employeeId is required.", "EMPLOYEE_ID_REQUIRED");
      if (!name) throw new AppError("name is required.", "NAME_REQUIRED");

      const wantsAccount = createAccount === true || createAccount === "true";
      if (!wantsAccount && !email) throw new AppError("email is required.", "EMAIL_REQUIRED");

      if (wantsAccount) assertCanAssignRole(req.user.role, accountRole);

      const accountEmail = resolveAccountEmail(employeeId, email);

      const employeeClash = await EmployeeModel.findOne({ email: accountEmail });
      if (employeeClash) {
        return res.status(409).json({
          success: false,
          message: `An employee already uses the email ${accountEmail}.`,
          code: "EMPLOYEE_EMAIL_EXISTS",
          params: { email: accountEmail },
        });
      }

      const data = employeeFromClient(req.body);
      data.email = accountEmail;
      if (req.body.department) {
        data.department = await resolveDepartmentIdByName(req.body.department);
      }

      let existingUser = await UserModel.findOne({ email: accountEmail });
      let account = null;

      if (existingUser) {
        account = { email: accountEmail, role: existingUser.role, linked: true };
      } else if (wantsAccount) {
        const tempPassword = generateTempPassword();
        const salt = bcrypt.genSaltSync(SALT_ROUNDS);
        existingUser = await UserModel.create({
          email: accountEmail,
          password: bcrypt.hashSync(tempPassword, salt),
          name,
          role: accountRole,
          mustChangePassword: true,
        });
        createdUserId = existingUser._id;
        account = {
          email: accountEmail,
          role: accountRole,
          tempPassword,
          mustChangePassword: true,
        };
      }

      if (existingUser) data.userId = existingUser._id;

      const employee = await EmployeeModel.create(data);
      await employee.populate("department", "name");

      if (existingUser && !existingUser.employee) {
        existingUser.employee = employee._id;
        await existingUser.save();
      }

      await logAction(req, {
        action: "created",
        resource: "employee",
        resourceId: employee._id,
        label: `${employee.name} (${employee.employeeId})`,
      });

      if (createdUserId) {
        await logAction(req, {
          action: "created",
          resource: "user",
          resourceId: createdUserId,
          label: `${accountEmail} (${accountRole})`,
        });
      }

      notifyHR({
        title: "New employee added",
        message: createdUserId
          ? `${employee.name} (${employee.employeeId}) was added with a ${accountRole} login account.`
          : `${employee.name} (${employee.employeeId}) was added.`,
        category: "employee",
        link: `/employees/${employee._id}`,
        linkLabel: "View profile",
        titleKey: "employeeAdded",
        messageKey: createdUserId ? "employeeAddedWithAccount" : "employeeAdded",
        params: createdUserId
          ? { employeeName: employee.name, employeeId: employee.employeeId, accountRole }
          : { employeeName: employee.name, employeeId: employee.employeeId },
      });

      res.status(201).json({ success: true, data: employeeToClient(employee), account });
    } catch (error) {
      if (createdUserId) {
        await UserModel.findByIdAndDelete(createdUserId).catch(() => {});
      }
      res.status(error.status || 400).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },

  update: asyncHandler(async (req, res) => {
    const data = employeeFromClient(req.body);
    if (req.body.department !== undefined) {
      data.department = req.body.department
        ? await resolveDepartmentIdByName(req.body.department)
        : null;
    }

    // MANAGER: own department only, and cannot move someone out of it.
    if (req.user.role === "MANAGER") {
      const deptId = await getManagerDepartmentId(req);
      const existing = await EmployeeModel.findById(req.params.id, "department");
      if (!existing) throw new AppError("Employee not found.", "EMPLOYEE_NOT_FOUND");
      if (String(existing.department) !== String(deptId)) {
        return res.status(403).json({
          success: false,
          message: "You can only update employees in your own department.",
          code: "MANAGER_UPDATE_OUT_OF_DEPARTMENT",
        });
      }
      if (data.department !== undefined && data.department !== null && String(data.department) !== String(deptId)) {
        return res.status(403).json({
          success: false,
          message: "You cannot move an employee to a different department.",
          code: "CANNOT_MOVE_DEPARTMENT",
        });
      }
    }

    const employee = await EmployeeModel.findByIdAndUpdate(req.params.id, data, {
      new: true,
      runValidators: true,
    }).populate("department", "name");
    if (!employee) throw new AppError("Employee not found.", "EMPLOYEE_NOT_FOUND");
    res.json({ success: true, data: employeeToClient(employee) });
  }, 400),

  remove: asyncHandler(async (req, res) => {
    const employee = await EmployeeModel.findByIdAndDelete(req.params.id);
    if (!employee) throw new AppError("Employee not found.", "EMPLOYEE_NOT_FOUND");

    if (employee.userId) {
      await UserModel.findByIdAndUpdate(employee.userId, { employee: null });
    }

    notifyHR({
      title: "Employee removed",
      message: `${employee.name} (${employee.employeeId}) was removed by ${req.user?.name ?? "a team member"}.`,
      category: "employee",
      ...actorNotifyKeys(req, "employeeRemoved", { employeeName: employee.name, employeeId: employee.employeeId }),
    });

    res.json({ success: true, message: "Employee deleted." });
  }, 400),

  uploadAvatar: asyncHandler(async (req, res) => {
    if (!isCloudinaryConfigured()) {
      throw new AppError(
        "Image uploads are not configured on this server (missing CLOUD_NAME/API_KEY/API_SECRET).",
        "IMAGE_UPLOAD_NOT_CONFIGURED",
      );
    }
    if (!req.file) throw new AppError("No image file was uploaded.", "NO_IMAGE_FILE");

    const employee = await EmployeeModel.findById(req.params.id);
    if (!employee) throw new AppError("Employee not found.", "EMPLOYEE_NOT_FOUND");

    if (req.user.role === "EMPLOYEE") {
      if (!employee.userId || String(employee.userId) !== String(req.user.id)) {
        return res.status(403).json({
          success: false,
          message: "You can only update your own avatar.",
          code: "AVATAR_ACCESS_DENIED",
        });
      }
    }

    if (req.user.role === "MANAGER") {
      const deptId = await getManagerDepartmentId(req);
      if (!employee.department || String(employee.department) !== String(deptId)) {
        return res.status(403).json({
          success: false,
          message: "You can only update avatars for employees in your own department.",
          code: "MANAGER_AVATAR_OUT_OF_DEPARTMENT",
        });
      }
    }

    const result = await uploadBufferToCloudinary(req.file.buffer, {
      folder: "hrms/avatars",
      public_id: `employee_${employee._id}`,
      overwrite: true,
      resource_type: "image",
    });

    employee.avatar = result.secure_url;
    await employee.save();
    await employee.populate("department", "name");

    res.json({ success: true, data: employeeToClient(employee) });
  }, 400),

  // Contract PDF — HR/Admin-only (router), unlike the self-serve avatar.
  uploadContract: asyncHandler(async (req, res) => {
    if (!isCloudinaryConfigured()) {
      throw new AppError(
        "Document uploads are not configured on this server (missing CLOUD_NAME/API_KEY/API_SECRET).",
        "DOCUMENT_UPLOAD_NOT_CONFIGURED",
      );
    }
    if (!req.file) throw new AppError("No contract file was uploaded.", "NO_CONTRACT_FILE");

    const employee = await EmployeeModel.findById(req.params.id);
    if (!employee) throw new AppError("Employee not found.", "EMPLOYEE_NOT_FOUND");

    if (req.user.role === "MANAGER") {
      const deptId = await getManagerDepartmentId(req);
      if (!employee.department || String(employee.department) !== String(deptId)) {
        return res.status(403).json({
          success: false,
          message: "You can only manage contracts for employees in your own department.",
          code: "MANAGER_CONTRACT_OUT_OF_DEPARTMENT",
        });
      }
    }

    const result = await uploadBufferToCloudinary(req.file.buffer, {
      folder: "hrms/contracts",
      public_id: `employee_${employee._id}_contract`,
      overwrite: true,
      resource_type: "raw",
      format: "pdf",
    });

    employee.contractUrl = result.secure_url;
    employee.contractUploadedAt = new Date();
    await employee.save();
    await employee.populate("department", "name");

    await logAction(req, {
      action: "updated",
      resource: "employee",
      resourceId: employee._id,
      label: `${employee.name} (${employee.employeeId}) — contract uploaded`,
    });

    res.json({ success: true, data: employeeToClient(employee) });
  }, 400),

  // Multi-document upload: each file gets its own Cloudinary asset; label/type apply to the whole batch.
  uploadDocuments: asyncHandler(async (req, res) => {
    if (!isCloudinaryConfigured()) {
      throw new AppError(
        "Document uploads are not configured on this server (missing CLOUD_NAME/API_KEY/API_SECRET).",
        "DOCUMENT_UPLOAD_NOT_CONFIGURED",
      );
    }
    if (!req.files?.length) throw new AppError("No document files were uploaded.", "NO_DOCUMENT_FILES");

    const employee = await EmployeeModel.findById(req.params.id);
    if (!employee) throw new AppError("Employee not found.", "EMPLOYEE_NOT_FOUND");

    if (req.user.role === "MANAGER") {
      const deptId = await getManagerDepartmentId(req);
      if (!employee.department || String(employee.department) !== String(deptId)) {
        return res.status(403).json({
          success: false,
          message: "You can only manage documents for employees in your own department.",
          code: "MANAGER_DOCUMENTS_OUT_OF_DEPARTMENT",
        });
      }
    }

    const label = typeof req.body.label === "string" ? req.body.label.trim() : "";
    const type = DOCUMENT_TYPES.includes(req.body.type) ? req.body.type : "other";

    for (let i = 0; i < req.files.length; i += 1) {
      const file = req.files[i];
      const result = await uploadBufferToCloudinary(file.buffer, {
        folder: "hrms/documents",
        public_id: `employee_${employee._id}_doc_${Date.now()}_${i}`,
        resource_type: "raw",
        format: "pdf",
      });
      employee.documents.push({
        url: result.secure_url,
        publicId: result.public_id,
        label,
        type,
        uploadedAt: new Date(),
        uploadedBy: req.user.id,
      });
    }

    await employee.save();
    await employee.populate("department", "name");

    await logAction(req, {
      action: "updated",
      resource: "employee",
      resourceId: employee._id,
      label: `${employee.name} (${employee.employeeId}) — ${req.files.length} document(s) uploaded`,
    });

    res.json({ success: true, data: employeeToClient(employee) });
  }, 400),

  // Best-effort Cloudinary cleanup: an orphaned asset is not worth failing the delete over.
  removeDocument: asyncHandler(async (req, res) => {
    const employee = await EmployeeModel.findById(req.params.id);
    if (!employee) throw new AppError("Employee not found.", "EMPLOYEE_NOT_FOUND");

    if (req.user.role === "MANAGER") {
      const deptId = await getManagerDepartmentId(req);
      if (!employee.department || String(employee.department) !== String(deptId)) {
        return res.status(403).json({
          success: false,
          message: "You can only manage documents for employees in your own department.",
          code: "MANAGER_DOCUMENTS_OUT_OF_DEPARTMENT",
        });
      }
    }

    const doc = employee.documents.id(req.params.docId);
    if (!doc) return res.status(404).json({ success: false, message: "Document not found.", code: "DOCUMENT_NOT_FOUND" });

    const publicId = doc.publicId;
    doc.deleteOne();
    await employee.save();
    await employee.populate("department", "name");

    try {
      await destroyCloudinaryAsset(publicId);
    } catch (err) {
      console.error("[uploadDocuments] Failed to delete Cloudinary asset:", err.message);
    }

    await logAction(req, {
      action: "deleted",
      resource: "employee",
      resourceId: employee._id,
      label: `${employee.name} (${employee.employeeId}) — document removed`,
    });

    res.json({ success: true, data: employeeToClient(employee) });
  }, 400),
};

export default employeeController;
