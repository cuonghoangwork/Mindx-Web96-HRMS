/**
 * managerScope.js — resolves the single department a MANAGER (or EMPLOYEE,
 * for their own read-only "My Department" page) account is scoped to, from
 * their linked Employee record (same User.employee lookup used throughout
 * the review-queue pattern, see utils/reviewQueue.js).
 *
 * MANAGER is department-scoped; ADMIN is unscoped. Every controller that
 * lets MANAGER read/write employee-linked data (employees, attendance,
 * leave/profile-edit/promotion/no-show reviews) calls this to get the
 * department to filter/validate against instead of hand-rolling the
 * User -> Employee -> department lookup per call site. EMPLOYEE only needs
 * this for departmentController.getDetail's own-department view check.
 */
import UserModel from "../model/User.js";
import EmployeeModel from "../model/Employee.js";

/**
 * Resolves the Employee record linked to a User document: prefers the
 * explicit User.employee link, falls back to an email match. The one place
 * this lookup's rule lives — getManagerDepartmentId (below),
 * reviewQueue.js's resolveRequestingEmployee, and startupMigrations.js's
 * stale-MANAGER fixup all call this instead of hand-rolling it.
 */
export async function resolveEmployeeForUser(user, projection) {
  if (!user) return null;
  return user.employee
    ? await EmployeeModel.findById(user.employee, projection)
    : await EmployeeModel.findOne({ email: user.email }, projection);
}

/**
 * Returns the ObjectId of the department a MANAGER/EMPLOYEE is scoped to,
 * or null for any other role (caller should only call this when
 * role === "MANAGER" or "EMPLOYEE"). Throws (403) if the account has no
 * linked Employee record or that record has no department — silently
 * falling through to "sees everything" or "sees nothing" would both be
 * surprising here.
 */
export async function getManagerDepartmentId(req) {
  if (req.user.role !== "MANAGER" && req.user.role !== "EMPLOYEE") return null;

  const user = await UserModel.findById(req.user.id);
  const employee = await resolveEmployeeForUser(user);

  if (!employee?.department) {
    const err = new Error(
      "Your account isn't linked to a department yet. Ask an admin to fix this.",
    );
    err.status = 403;
    throw err;
  }
  return employee.department;
}
