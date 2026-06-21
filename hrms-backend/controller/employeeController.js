import EmployeeModel from "../model/Employee.js";
import DepartmentModel from "../model/Department.js";
import { employeeToClient, employeeFromClient } from "../utils/mappers.js";
import { resolveDepartmentIdByName } from "../utils/refResolvers.js";
import { uploadBufferToCloudinary, isCloudinaryConfigured } from "../utils/cloudinary.js";

const employeeController = {
  getAll: async (req, res) => {
    try {
      const {
        pageSize = 10,
        pageNumber = 1,
        search,
        department, // comma-separated department NAMES, matching the frontend's filters.department
        status, // client-shaped label, e.g. "Active"
        type, // client-shaped label, e.g. "Full-time"
        sortBy = "name",
        sortDir = 1,
      } = req.query;

      const condition = {};
      if (search) condition.name = { $regex: search, $options: "i" };

      if (department) {
        const names = department
          .split(",")
          .map((d) => d.trim())
          .filter(Boolean);
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

      // sortBy may arrive as a client-shaped field name; translate to the DB field to sort on.
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
      res.json({ success: true, data: employeeToClient(employee) });
    } catch (error) {
      res.status(404).json({ success: false, message: error.message });
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

      const employee = await EmployeeModel.create(data);
      await employee.populate("department", "name");
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
      res.json({ success: true, message: "Employee deleted." });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  },

  // Multer (middleware/upload.js, memoryStorage) puts the file on req.file as a buffer.
  // Uploads it to Cloudinary and AWAITS the result before responding - fixing the race
  // condition in the course's lesson9 example (see WEB96_BACKEND_REFERENCE.md §10 and
  // utils/cloudinary.js), where the response was sent before secure_url was available.
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
