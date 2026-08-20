import EmployeeModel from "../model/Employee.js";
import UserModel from "../model/User.js";
import { getManagerDepartmentId, resolveEmployeeForUser } from "./managerScope.js";
import { isWithinAppealWindow } from "./performanceCycles.js";

export function idOf(value) {
  if (!value) return null;
  if (typeof value === "object" && value._id) return String(value._id);
  return String(value);
}

export async function resolveActorEmployee(req, projection) {
  const user = await UserModel.findById(req.user.id);
  return resolveEmployeeForUser(user, projection);
}

export async function departmentManagerUserIds(departmentId, excludeUserId = null) {
  const scopedId = idOf(departmentId);
  if (!scopedId) return [];

  const members = await EmployeeModel.find({ department: scopedId }, "_id email");
  if (!members.length) return [];

  const memberIds = members.map((member) => member._id);
  const idSet = new Set(memberIds.map(String));
  const emailSet = new Set(members.map((member) => member.email).filter(Boolean));

  const candidates = await UserModel.find(
    {
      role: "MANAGER",
      $or: [{ employee: { $in: memberIds } }, { email: { $in: [...emailSet] } }],
    },
    "_id employee email",
  );

  return candidates
    .filter((user) => (user.employee ? idSet.has(String(user.employee)) : emailSet.has(user.email)))
    .filter((user) => !excludeUserId || String(user._id) !== String(excludeUserId))
    .map((user) => user._id);
}

export async function isOrphanManager(employee) {
  const departmentId = idOf(employee?.department);
  if (!departmentId) return true;

  const linkedUser = await UserModel.findOne(
    { $or: [{ employee: employee._id }, { email: employee.email }] },
    "_id",
  );
  const managers = await departmentManagerUserIds(departmentId, linkedUser?._id ?? null);
  return managers.length === 0;
}

export async function evaluateAccess(req, employee) {
  const role = req.user.role;
  const actor = await resolveActorEmployee(req, "_id department");

  const employeeId = idOf(employee?._id);
  const employeeDepartment = idOf(employee?.department);

  const isSelf = Boolean(actor && employeeId && idOf(actor._id) === employeeId);
  const isAdmin = role === "ADMIN";
  const isHR = role === "HR";
  const isDeptManager =
    role === "MANAGER" &&
    Boolean(employeeDepartment) &&
    idOf(actor?.department) === employeeDepartment;

  const isOrphan = isAdmin || isHR ? await isOrphanManager(employee) : false;

  return {
    role,
    actor,
    isSelf,
    isAdmin,
    isHR,
    isDeptManager,
    isOrphan,
    canView: isAdmin || isHR || isSelf || isDeptManager,
    canRateAsManager: !isSelf && (isAdmin || isDeptManager || (isHR && isOrphan)),
  };
}

export function assertCanViewReview(access) {
  if (!access.canView) {
    const err = new Error("You can only view your own performance review.");
    err.status = 403;
    throw err;
  }
}

export function assertIsSelf(access, action) {
  if (!access.isSelf) {
    const err = new Error(`Only the employee themselves can ${action}.`);
    err.status = 403;
    throw err;
  }
}

export function assertCanRateAsManager(access) {
  if (access.isSelf) {
    const err = new Error("You can't submit your own manager review.");
    err.status = 403;
    throw err;
  }
  if (!access.canRateAsManager) {
    const err = new Error(
      access.isHR
        ? "This employee has a department manager. Only their manager can submit the manager review."
        : "You can only submit manager reviews for employees in your own department.",
    );
    err.status = 403;
    throw err;
  }
}

export async function resolveRosterScope(req) {
  const role = req.user.role;

  if (role === "ADMIN" || role === "HR") {
    return { employeeCondition: { status: { $ne: "terminated" } }, scope: "all" };
  }

  if (role === "MANAGER") {
    const departmentId = await getManagerDepartmentId(req);
    return {
      employeeCondition: { department: departmentId, status: { $ne: "terminated" } },
      scope: "department",
    };
  }

  const actor = await resolveActorEmployee(req, "_id");
  if (!actor) return { employeeCondition: null, scope: "self" };
  return { employeeCondition: { _id: actor._id }, scope: "self" };
}

export function describePermissions(access, cycle, review, asOf = new Date()) {
  const open = cycle?.status === "Open";
  const hasAppeal = Boolean(review?.appeal);

  return {
    canEditSelf: Boolean(access.isSelf && open),
    canEditManager: Boolean(access.canRateAsManager && open),
    canEditCompetencySelf: Boolean(access.isSelf && open),
    canEditCompetencyManager: Boolean(access.canRateAsManager && open),
    canAddGoals: Boolean(access.isSelf && open),
    canAddPeerFeedback: Boolean(access.canView),
    canFileAppeal: Boolean(
      access.isSelf && !hasAppeal && isWithinAppealWindow(review?.managerSubmittedDate, asOf),
    ),
    canResolveAppeal: Boolean(
      (access.isAdmin || access.isHR) && review?.appeal?.status === "Pending",
    ),
  };
}
