import EmployeeModel from "../model/Employee.js";
import UserModel from "../model/User.js";
import DepartmentModel from "../model/Department.js";
import { employeeToClient, employeeFromClient } from "../utils/mappers.js";
import { resolveDepartmentIdByName } from "../utils/refResolvers.js";
import { uploadBufferToCloudinary, isCloudinaryConfigured } from "../utils/cloudinary.js";
import { notifyHR } from "./notificationController.js";

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
    try {
      const { employeeId, name, email } = req.body;
      if (!employeeId) throw new Error("employeeId is required.");
      if (!name) throw new Error("name is required.");
      if (!email) throw new Error("email is required.");

      const data = employeeFromClient(req.body);
      if (req.body.department) {
        data.department = await resolveDepartmentIdByName(req.body.department);
      }

      // If a User account with the same email already exists, link them
      const existingUser = await UserModel.findOne({ email: email.toLowerCase() });
      if (existingUser) data.userId = existingUser._id;

      const employee = await EmployeeModel.create(data);
      await employee.populate("department", "name");

      // Also update the user record to point to this employee
      if (existingUser && !existingUser.employee) {
        existingUser.employee = employee._id;
        await existingUser.save();
      }

      notifyHR({
        title: "New employee added",
        message: `${employee.name} (${employee.employeeId}) was added by ${req.user.name}.`,
        category: "employee",
        link: `/employees/${employee._id}`,
        linkLabel: "View profile",
      });

      res.status(201).json({ success: true, data: employeeToClient(employee) });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
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
};

export default employeeController;
