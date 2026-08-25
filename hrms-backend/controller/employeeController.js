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
import { notifyHR } from "./notificationController.js";
import { logAction } from "../utils/auditLog.js";
import bcrypt from "bcryptjs";
import {
  generateTempPassword,
  resolveAccountEmail,
  assertCanAssignRole,
} from "../utils/credentials.js";
import { getManagerDepartmentId } from "../utils/managerScope.js";

const SALT_ROUNDS = 10;
const DOCUMENT_TYPES = ["offer_letter", "id_scan", "other"];

const employeeController = {
  getAll: async (req, res) => {
    try {
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

      // Deliberately NOT department-scoped for MANAGER: the roster/directory
      // read has always been company-wide for every authenticated role (see
      // the router comment — even plain EMPLOYEE sees all names/departments
      // "for display"). Scoping this would make MANAGER's read visibility
      // *more* restrictive than EMPLOYEE's, which is backwards. Real
      // least-privilege for MANAGER lives on the write side (create is
      // HR/ADMIN-only; update/avatar/contract/promote check
      // getManagerDepartmentId — see those handlers below) and on the
      // separate department-scoped views (attendance, payroll, "My
      // Department" via departmentController.getDetail).
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
    } catch (error) {
      res.status(500).json({ success: false, message: "Error getting employees", error: error.message });
    }
  },

  getDetail: async (req, res) => {
    try {
      const employee = await EmployeeModel.findById(req.params.id).populate("department", "name");
      if (!employee) throw new Error("Employee not found.");

      // EMPLOYEE role users can only view their own profile
      if (req.user.role === "EMPLOYEE") {
        const myEmp = await EmployeeModel.findOne({ userId: req.user.id });
        if (!myEmp || String(myEmp._id) !== String(employee._id)) {
          return res.status(403).json({ success: false, message: "Access denied." });
        }
      }

      // MANAGER can view any employee's basic profile (directory read is
      // company-wide, see getAll above) — write actions (update/avatar/
      // contract/promote) still enforce department scoping on their own.

      res.json({ success: true, data: employeeToClient(employee) });
    } catch (error) {
      res.status(404).json({ success: false, message: error.message });
    }
  },

  // GET /api/v1/employees/me — returns the employee profile for the logged-in user
  getMyProfile: async (req, res) => {
    try {
      const user = await UserModel.findById(req.user.id);
      if (!user) throw new Error("User not found.");

      let employee = null;
      if (user.employee) {
        employee = await EmployeeModel.findById(user.employee).populate("department", "name");
      }
      if (!employee) {
        // Fallback: match by email
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
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  create: async (req, res) => {
    let createdUserId = null;
    try {
      const { employeeId, name, email, createAccount, accountRole = "EMPLOYEE" } = req.body;
      if (!employeeId) throw new Error("employeeId is required.");
      if (!name) throw new Error("name is required.");

      const wantsAccount = createAccount === true || createAccount === "true";
      if (!wantsAccount && !email) throw new Error("email is required.");

      if (wantsAccount) assertCanAssignRole(req.user.role, accountRole);

      const accountEmail = resolveAccountEmail(employeeId, email);

      const employeeClash = await EmployeeModel.findOne({ email: accountEmail });
      if (employeeClash) {
        return res.status(409).json({
          success: false,
          message: `An employee already uses the email ${accountEmail}.`,
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
      });

      res.status(201).json({ success: true, data: employeeToClient(employee), account });
    } catch (error) {
      if (createdUserId) {
        await UserModel.findByIdAndDelete(createdUserId).catch(() => {});
      }
      res.status(error.status || 400).json({ success: false, message: error.message });
    }
  },

  update: async (req, res) => {
    try {
      const data = employeeFromClient(req.body);
      if (req.body.department !== undefined) {
        data.department = req.body.department
          ? await resolveDepartmentIdByName(req.body.department)
          : null;
      }

      // MANAGER can only update employees currently in their own department,
      // and can't use this endpoint to move someone into a different one.
      if (req.user.role === "MANAGER") {
        const deptId = await getManagerDepartmentId(req);
        const existing = await EmployeeModel.findById(req.params.id, "department");
        if (!existing) throw new Error("Employee not found.");
        if (String(existing.department) !== String(deptId)) {
          return res.status(403).json({
            success: false,
            message: "You can only update employees in your own department.",
          });
        }
        if (data.department !== undefined && data.department !== null && String(data.department) !== String(deptId)) {
          return res.status(403).json({
            success: false,
            message: "You cannot move an employee to a different department.",
          });
        }
      }

      const employee = await EmployeeModel.findByIdAndUpdate(req.params.id, data, {
        new: true,
        runValidators: true,
      }).populate("department", "name");
      if (!employee) throw new Error("Employee not found.");
      res.json({ success: true, data: employeeToClient(employee) });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  },

  remove: async (req, res) => {
    try {
      const employee = await EmployeeModel.findByIdAndDelete(req.params.id);
      if (!employee) throw new Error("Employee not found.");

      // Unlink the user account if one was linked
      if (employee.userId) {
        await UserModel.findByIdAndUpdate(employee.userId, { employee: null });
      }

      notifyHR({
        title: "Employee removed",
        message: `${employee.name} (${employee.employeeId}) was removed by ${req.user.name}.`,
        category: "employee",
      });

      res.json({ success: true, message: "Employee deleted." });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  },

  uploadAvatar: async (req, res) => {
    try {
      if (!isCloudinaryConfigured()) {
        throw new Error(
          "Image uploads are not configured on this server (missing CLOUD_NAME/API_KEY/API_SECRET).",
        );
      }
      if (!req.file) throw new Error("No image file was uploaded.");

      const employee = await EmployeeModel.findById(req.params.id);
      if (!employee) throw new Error("Employee not found.");

      // EMPLOYEE role can only upload their own avatar
      if (req.user.role === "EMPLOYEE") {
        if (!employee.userId || String(employee.userId) !== String(req.user.id)) {
          return res.status(403).json({ success: false, message: "You can only update your own avatar." });
        }
      }

      // MANAGER can only manage avatars for their own department
      if (req.user.role === "MANAGER") {
        const deptId = await getManagerDepartmentId(req);
        if (!employee.department || String(employee.department) !== String(deptId)) {
          return res.status(403).json({
            success: false,
            message: "You can only update avatars for employees in your own department.",
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
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  },

  // Task 1.4 — contract PDF upload. Unlike avatars, HR/Admin-only (see
  // router/employeeRouter.js's authorize() on this route) — a contract is
  // an official HR document, not something an employee self-serves.
  // Employees view it read-only via employeeToClient's contractUrl
  // (already returned by GET /employees/me and GET /employees/:id).
  uploadContract: async (req, res) => {
    try {
      if (!isCloudinaryConfigured()) {
        throw new Error(
          "Document uploads are not configured on this server (missing CLOUD_NAME/API_KEY/API_SECRET).",
        );
      }
      if (!req.file) throw new Error("No contract file was uploaded.");

      const employee = await EmployeeModel.findById(req.params.id);
      if (!employee) throw new Error("Employee not found.");

      // MANAGER can only manage contracts for their own department
      if (req.user.role === "MANAGER") {
        const deptId = await getManagerDepartmentId(req);
        if (!employee.department || String(employee.department) !== String(deptId)) {
          return res.status(403).json({
            success: false,
            message: "You can only manage contracts for employees in your own department.",
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
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  },

  // Solo Gaps Milestone 1 — arbitrary multi-document upload. Additive
  // alongside uploadContract above, not a replacement: each document gets
  // its own Cloudinary asset (unique public_id) since, unlike a contract,
  // there's no single "current" document to overwrite. label/type apply to
  // the whole batch (one upload action, up to 5 files at once).
  uploadDocuments: async (req, res) => {
    try {
      if (!isCloudinaryConfigured()) {
        throw new Error(
          "Document uploads are not configured on this server (missing CLOUD_NAME/API_KEY/API_SECRET).",
        );
      }
      if (!req.files?.length) throw new Error("No document files were uploaded.");

      const employee = await EmployeeModel.findById(req.params.id);
      if (!employee) throw new Error("Employee not found.");

      // MANAGER can only manage documents for their own department
      if (req.user.role === "MANAGER") {
        const deptId = await getManagerDepartmentId(req);
        if (!employee.department || String(employee.department) !== String(deptId)) {
          return res.status(403).json({
            success: false,
            message: "You can only manage documents for employees in your own department.",
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
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  },

  // Solo Gaps Milestone 1 — deletes one document from the array. Best-effort
  // Cloudinary cleanup: a failure there logs but doesn't block the user's
  // delete, matching logAction's fire-and-forget philosophy — an orphaned
  // Cloudinary asset is a minor leak, not worth failing the request over.
  removeDocument: async (req, res) => {
    try {
      const employee = await EmployeeModel.findById(req.params.id);
      if (!employee) throw new Error("Employee not found.");

      // MANAGER can only manage documents for their own department
      if (req.user.role === "MANAGER") {
        const deptId = await getManagerDepartmentId(req);
        if (!employee.department || String(employee.department) !== String(deptId)) {
          return res.status(403).json({
            success: false,
            message: "You can only manage documents for employees in your own department.",
          });
        }
      }

      const doc = employee.documents.id(req.params.docId);
      if (!doc) return res.status(404).json({ success: false, message: "Document not found." });

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
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  },
};

export default employeeController;
