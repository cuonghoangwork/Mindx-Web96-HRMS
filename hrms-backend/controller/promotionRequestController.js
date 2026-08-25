import PromotionRequestModel from "../model/PromotionRequest.js";
import EmployeeModel from "../model/Employee.js";
import DepartmentModel from "../model/Department.js";
import UserModel from "../model/User.js";
import NotificationModel from "../model/Notification.js";
import { POSITION_LEVELS } from "../model/PositionLevel.js";
import { createReviewRequestController, assertNoPendingRequest } from "../utils/reviewQueue.js";
import { resolveDepartmentIdByName } from "../utils/refResolvers.js";
import { logAction } from "../utils/auditLog.js";
import { getManagerDepartmentId } from "../utils/managerScope.js";
import { hasCapability, CAPABILITY_DISABLED_MESSAGE } from "../utils/permissions.js";

const POPULATE = [
  ["employee", "name email employeeId"],
  ["requestedBy", "name email"],
];

function dateOnly(d) {
  return d ? new Date(d).toISOString().slice(0, 10) : null;
}

function changedFieldNames(doc) {
  return [
    doc.proposedDesignation ? "designation" : null,
    doc.proposedDepartment ? "department" : null,
    typeof doc.proposedAnnualSalary === "number" ? "salary" : null,
    doc.proposedPositionLevel ? "positionLevel" : null,
  ].filter(Boolean);
}

function toClientRequest(doc) {
  if (!doc) return doc;
  const o = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return {
    id: String(o._id),
    employeeId: o.employee ? String(o.employee._id ?? o.employee) : null,
    employeeName: o.employee?.name ?? null,
    employeeCode: o.employee?.employeeId ?? null,
    requestedBy: o.requestedBy ? String(o.requestedBy._id ?? o.requestedBy) : null,
    requestedByName: o.requestedBy?.name ?? null,
    current: {
      designation: o.currentDesignation ?? null,
      department: o.currentDepartmentName ?? null,
      salary: o.currentAnnualSalary ?? null,
      positionLevel: o.currentPositionLevel ?? null,
    },
    proposed: {
      designation: o.proposedDesignation ?? null,
      department: o.proposedDepartmentName ?? null,
      salary: o.proposedAnnualSalary ?? null,
      positionLevel: o.proposedPositionLevel ?? null,
    },
    systemGenerated: Boolean(o.systemGenerated),
    effectiveDate: dateOnly(o.effectiveDate),
    reason: o.reason ?? "",
    status: o.status,
    reviewNote: o.reviewNote ?? "",
    reviewedBy: o.reviewedBy ? String(o.reviewedBy._id ?? o.reviewedBy) : null,
    reviewedAt: o.reviewedAt ?? null,
    createdAt: o.createdAt,
  };
}

const { list, review: factoryReview } = createReviewRequestController({
  Model: PromotionRequestModel,
  resourceLabel: "promotion request",
  populate: POPULATE,
  toClient: toClientRequest,
  onApprove: async (request) => {
    const updates = {};
    if (request.proposedDesignation) updates.designation = request.proposedDesignation;
    if (request.proposedDepartment) updates.department = request.proposedDepartment;
    if (typeof request.proposedAnnualSalary === "number") {
      updates.annualSalary = request.proposedAnnualSalary;
    }
    if (request.proposedPositionLevel) {
      updates.positionLevel = request.proposedPositionLevel;
      // Reset the tenure clock — they just started at this level, so the
      // next eligibility check (task 2.4) should measure from now, not
      // from whenever they entered the level they're leaving.
      updates.levelStartDate = new Date();
    }
    if (!Object.keys(updates).length) return;
    await EmployeeModel.findByIdAndUpdate(request.employee._id ?? request.employee, updates, {
      runValidators: true,
    });
  },
  notifyEmployee: (decision, request) => {
    if (decision !== "approved") {
      return {
        title: "Promotion request rejected",
        message: `Your promotion request was not approved.${request.reviewNote ? ` Note: ${request.reviewNote}` : ""}`,
      };
    }
    const parts = [];
    if (request.proposedPositionLevel) parts.push(`new level: ${request.proposedPositionLevel}`);
    if (request.proposedDesignation) parts.push(`new title: ${request.proposedDesignation}`);
    return {
      title: "Promotion approved",
      message: `Your promotion has been approved${parts.length ? ` — ${parts.join(", ")}` : ""}. Your HR record has been updated.`,
    };
  },
  employeeLink: (request) => `/employees/${request.employee._id ?? request.employee}`,
  employeeLinkLabel: "View profile",
});

const promotionRequestController = {
  create: async (req, res) => {
    try {
      const { employeeId, designation, department, salary, positionLevel, effectiveDate, reason } = req.body;

      if (positionLevel !== undefined && positionLevel !== "" && !POSITION_LEVELS.includes(positionLevel)) {
        return res.status(400).json({
          success: false,
          message: `positionLevel must be one of: ${POSITION_LEVELS.join(", ")}.`,
        });
      }

      const employee = await EmployeeModel.findById(employeeId).populate("department", "name");
      if (!employee) {
        return res.status(404).json({ success: false, message: "Employee not found." });
      }

      // MANAGER can only propose promotions for employees in their own
      // department, and can't use a promotion to move someone to another one.
      if (req.user.role === "MANAGER") {
        if (!(await hasCapability("MANAGER", "proposePromotions"))) {
          return res.status(403).json({ success: false, message: CAPABILITY_DISABLED_MESSAGE });
        }
        const deptId = await getManagerDepartmentId(req);
        const empDeptId = employee.department?._id ?? employee.department;
        if (!empDeptId || String(empDeptId) !== String(deptId)) {
          return res.status(403).json({
            success: false,
            message: "You can only propose promotions for employees in your own department.",
          });
        }
        if (department && String(department) !== String(employee.department?.name ?? "")) {
          return res.status(403).json({
            success: false,
            message: "You cannot propose moving an employee to a different department.",
          });
        }
      }

      await assertNoPendingRequest(
        PromotionRequestModel,
        employee._id,
        `${employee.name} already has a pending promotion proposal. It must be reviewed before another is submitted.`,
      );

      const currentDepartmentName = employee.department?.name ?? null;

      const doc = {
        employee: employee._id,
        requestedBy: req.user.id,
        status: "pending",
        currentDesignation: employee.designation ?? null,
        currentDepartmentName,
        currentAnnualSalary: employee.annualSalary ?? 0,
        currentPositionLevel: employee.positionLevel ?? null,
        proposedDesignation: null,
        proposedDepartment: null,
        proposedDepartmentName: null,
        proposedAnnualSalary: null,
        proposedPositionLevel: null,
        effectiveDate: effectiveDate ? new Date(effectiveDate) : null,
        reason: reason ?? "",
        appliedAt: new Date(),
      };

      if (designation && String(designation).trim() !== String(employee.designation ?? "")) {
        doc.proposedDesignation = String(designation).trim();
      }
      if (department && String(department) !== String(currentDepartmentName ?? "")) {
        doc.proposedDepartment = await resolveDepartmentIdByName(department);
        doc.proposedDepartmentName = department;
      }
      if (
        salary !== undefined &&
        salary !== "" &&
        Number(salary) !== Number(employee.annualSalary ?? 0)
      ) {
        doc.proposedAnnualSalary = Number(salary);
      }
      if (positionLevel && positionLevel !== employee.positionLevel) {
        doc.proposedPositionLevel = positionLevel;
      }

      if (!changedFieldNames(doc).length) {
        return res.status(400).json({
          success: false,
          message:
            "The proposal matches the employee's current designation, department and salary — nothing to change.",
        });
      }

      const request = await PromotionRequestModel.create(doc);
      await request.populate(POPULATE.map(([path, select]) => ({ path, select })));

      const admins = await UserModel.find({ role: "ADMIN" }, "_id");
      await Promise.all(
        admins.map((u) =>
          NotificationModel.create({
            user: u._id,
            category: "employee",
            title: "Promotion proposal awaiting review",
            message: `A promotion was proposed for ${employee.name} (${employee.employeeId}).`,
            link: "/employees",
            linkLabel: "Review promotion queue",
            read: false,
          }),
        ),
      );

      await logAction(req, {
        action: "created",
        resource: "promotion",
        resourceId: request._id,
        label: `${employee.name} (${employee.employeeId}) — promotion proposed`,
        changes: { fields: { from: null, to: changedFieldNames(doc).join(", ") } },
      });

      res.status(201).json({ success: true, data: toClientRequest(request) });
    } catch (error) {
      res.status(error.status || 400).json({ success: false, message: error.message });
    }
  },

  list,

  review: async (req, res) => {
    try {
      const request = await PromotionRequestModel.findById(req.params.id);
      if (!request) {
        return res.status(404).json({ success: false, message: "Promotion request not found." });
      }

      if (String(request.requestedBy) === String(req.user.id)) {
        return res.status(403).json({
          success: false,
          message:
            "You cannot review a promotion proposal you created yourself. Ask another Administrator to review it.",
        });
      }

      if (request.status !== "pending") {
        return res
          .status(409)
          .json({ success: false, message: "This request has already been reviewed." });
      }

      if (req.body?.decision === "approved") {
        const employee = await EmployeeModel.findById(request.employee);
        if (!employee) {
          return res
            .status(409)
            .json({ success: false, message: "The employee for this proposal no longer exists." });
        }
        if (request.proposedDepartment) {
          const dept = await DepartmentModel.findById(request.proposedDepartment);
          if (!dept) {
            return res.status(409).json({
              success: false,
              message: `Department "${request.proposedDepartmentName}" no longer exists. Recreate it or reject this proposal.`,
            });
          }
        }
      }

      await factoryReview(req, res);

      const after = await PromotionRequestModel.findById(req.params.id).populate(
        "employee",
        "name employeeId",
      );
      if (
        after &&
        after.status !== "pending" &&
        String(after.reviewedBy) === String(req.user.id)
      ) {
        await logAction(req, {
          action: "status_changed",
          resource: "promotion",
          resourceId: after._id,
          label: `${after.employee?.name ?? "Employee"} (${after.employee?.employeeId ?? "—"}) — promotion ${after.status}`,
          changes: { fields: { from: null, to: changedFieldNames(after).join(", ") } },
        });
      }
    } catch (error) {
      if (!res.headersSent) {
        res.status(400).json({ success: false, message: error.message });
      }
    }
  },
};

export default promotionRequestController;
