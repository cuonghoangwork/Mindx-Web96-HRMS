import DepartmentModel from "../model/Department.js";
import EmployeeModel from "../model/Employee.js";
import { departmentToClient, departmentFromClient } from "../utils/mappers.js";
import { resolveManagerRef } from "../utils/refResolvers.js";

const departmentController = {
  getAll: async (req, res) => {
    try {
      const departments = await DepartmentModel.find().populate("manager", "name");

      // Mirrors the frontend's getEmployeeCountByDepartment / getTotalSalaryByDepartment
      // selectors - computed live rather than stored as a redundant counter.
      const items = await Promise.all(
        departments.map(async (dept) => {
          const employeeCount = await EmployeeModel.countDocuments({ department: dept._id });
          const salaryAgg = await EmployeeModel.aggregate([
            { $match: { department: dept._id } },
            { $group: { _id: null, total: { $sum: "$annualSalary" } } },
          ]);
          const totalSalary = salaryAgg[0]?.total || 0;
          return departmentToClient({ ...dept.toObject(), employeeCount, totalSalary });
        }),
      );

      res.json({ success: true, items });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  getDetail: async (req, res) => {
    try {
      const department = await DepartmentModel.findById(req.params.id).populate("manager", "name");
      if (!department) throw new Error("Department not found.");

      const employeeDocs = await EmployeeModel.find({ department: department._id }).populate(
        "department",
        "name",
      );

      const employeeCount = employeeDocs.length;
      const totalSalary = employeeDocs.reduce((sum, e) => sum + (e.annualSalary || 0), 0);

      res.json({
        success: true,
        data: departmentToClient({ ...department.toObject(), employeeCount, totalSalary }),
        // The frontend's ViewDepartment.jsx renders employees via the Employee shape directly.
        employees: employeeDocs.map((e) => ({
          id: String(e._id),
          name: e.name,
          employeeId: e.employeeId,
          designation: e.designation,
          status:
            { active: "Active", "on-leave": "On Leave", terminated: "Terminated" }[e.status] ??
            e.status,
        })),
      });
    } catch (error) {
      res.status(404).json({ success: false, message: error.message });
    }
  },

  create: async (req, res) => {
    try {
      const { name } = req.body;
      if (!name) throw new Error("Department name is required.");

      const exists = await DepartmentModel.findOne({ name });
      if (exists) throw new Error("A department with this name already exists.");

      const data = departmentFromClient(req.body);
      if (req.body.manager !== undefined) {
        Object.assign(data, await resolveManagerRef(req.body.manager));
      }

      const department = await DepartmentModel.create(data);
      await department.populate("manager", "name");
      res.status(201).json({ success: true, data: departmentToClient(department) });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  },

  update: async (req, res) => {
    try {
      const data = departmentFromClient(req.body);
      if (req.body.manager !== undefined) {
        Object.assign(data, await resolveManagerRef(req.body.manager));
      }

      const department = await DepartmentModel.findByIdAndUpdate(req.params.id, data, {
        new: true,
        runValidators: true,
      }).populate("manager", "name");
      if (!department) throw new Error("Department not found.");
      res.json({ success: true, data: departmentToClient(department) });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  },

  remove: async (req, res) => {
    try {
      const department = await DepartmentModel.findByIdAndDelete(req.params.id);
      if (!department) throw new Error("Department not found.");
      res.json({ success: true, message: "Department deleted." });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  },
};

export default departmentController;
