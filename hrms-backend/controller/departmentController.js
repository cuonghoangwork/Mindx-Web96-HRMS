import DepartmentModel from "../model/Department.js";
import EmployeeModel from "../model/Employee.js";
import { departmentToClient, departmentFromClient } from "../utils/mappers.js";
import { resolveManagerRef } from "../utils/refResolvers.js";
import { logAction, diffChanges } from "../utils/auditLog.js";
import { notifyHR } from "./notificationController.js";
import { getManagerDepartmentId } from "../utils/managerScope.js";
import { AppError } from "../utils/appError.js";
import { actorNotifyKeys } from "../utils/notifyActor.js";

const departmentController = {
  getAll: async (req, res) => {
    try {
      const departments = await DepartmentModel.find().populate("manager", "name");
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
      res.status(500).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },

  // Reachable by MANAGER and EMPLOYEE via the "My Department" redirect
  // (frontend routes MyDepartmentRedirect.jsx resolves their own department
  // id then lands here) — so unlike getAll (unrestricted read, matches
  // Holidays/Jobs/Candidates' existing "company-wide read visibility"
  // pattern), this one enforces real own-department-only scoping for both.
  getDetail: async (req, res) => {
    try {
      const department = await DepartmentModel.findById(req.params.id).populate("manager", "name");
      if (!department) throw new AppError("Department not found.", "DEPARTMENT_NOT_FOUND");

      if (req.user.role === "MANAGER" || req.user.role === "EMPLOYEE") {
        const deptId = await getManagerDepartmentId(req);
        if (String(department._id) !== String(deptId)) {
          return res.status(403).json({ success: false, message: "Access denied.", code: "ACCESS_DENIED" });
        }
      }

      const employeeDocs = await EmployeeModel.find({ department: department._id }).populate("department", "name");
      const employeeCount = employeeDocs.length;
      const totalSalary = employeeDocs.reduce((sum, e) => sum + (e.annualSalary || 0), 0);
      res.json({
        success: true,
        data: departmentToClient({ ...department.toObject(), employeeCount, totalSalary }),
        employees: employeeDocs.map((e) => ({
          id: String(e._id),
          name: e.name,
          employeeId: e.employeeId,
          designation: e.designation,
          status: { active: "Active", "on-leave": "On Leave", terminated: "Terminated" }[e.status] ?? e.status,
        })),
      });
    } catch (error) {
      res.status(404).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },

  create: async (req, res) => {
    try {
      const { name } = req.body;
      if (!name) throw new AppError("Department name is required.", "DEPARTMENT_NAME_REQUIRED");
      const exists = await DepartmentModel.findOne({ name });
      if (exists) throw new AppError("A department with this name already exists.", "DEPARTMENT_NAME_EXISTS");
      const data = departmentFromClient(req.body);
      if (req.body.manager !== undefined) {
        Object.assign(data, await resolveManagerRef(req.body.manager));
      }
      const department = await DepartmentModel.create(data);
      await department.populate("manager", "name");

      await logAction(req, {
        action:     "created",
        resource:   "department",
        resourceId: department._id,
        label:      department.name,
      });

      notifyHR({
        title: "New department created",
        message: `${department.name} was added by ${req.user?.name ?? "a team member"}.`,
        category: "employee",
        link: `/departments/${department._id}`,
        linkLabel: "View department",
        ...actorNotifyKeys(req, "departmentCreated", { departmentName: department.name }),
      });

      res.status(201).json({ success: true, data: departmentToClient(department) });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },

  update: async (req, res) => {
    try {
      const before = await DepartmentModel.findById(req.params.id).populate("manager", "name");
      const beforeClient = before ? departmentToClient({ ...before.toObject(), employeeCount: 0, totalSalary: 0 }) : null;

      const data = departmentFromClient(req.body);
      if (req.body.manager !== undefined) {
        Object.assign(data, await resolveManagerRef(req.body.manager));
      }
      const department = await DepartmentModel.findByIdAndUpdate(req.params.id, data, {
        new: true, runValidators: true,
      }).populate("manager", "name");
      if (!department) throw new AppError("Department not found.", "DEPARTMENT_NOT_FOUND");

      const afterClient = departmentToClient({ ...department.toObject(), employeeCount: 0, totalSalary: 0 });
      const action = req.body.budget !== undefined && beforeClient?.budget !== req.body.budget
        ? "budget_updated"
        : "updated";

      await logAction(req, {
        action,
        resource:   "department",
        resourceId: department._id,
        label:      department.name,
        changes:    diffChanges(beforeClient, afterClient),
      });

      res.json({ success: true, data: departmentToClient(department) });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },

  remove: async (req, res) => {
    try {
      const department = await DepartmentModel.findByIdAndDelete(req.params.id);
      if (!department) throw new AppError("Department not found.", "DEPARTMENT_NOT_FOUND");

      await logAction(req, {
        action:     "deleted",
        resource:   "department",
        resourceId: req.params.id,
        label:      department.name,
      });

      notifyHR({
        title: "Department removed",
        message: `${department.name} was removed by ${req.user?.name ?? "a team member"}.`,
        category: "employee",
        ...actorNotifyKeys(req, "departmentRemoved", { departmentName: department.name }),
      });

      res.json({ success: true, message: "Department deleted." });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },
};

export default departmentController;
