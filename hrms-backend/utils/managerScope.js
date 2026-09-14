/**
 * The single department a MANAGER (or EMPLOYEE, for their own "My Department"
 * view) is scoped to, from their linked Employee record (DECISIONS.md D12).
 * Every controller that scopes by department calls this rather than
 * hand-rolling the User -> Employee -> department lookup.
 */
import UserModel from "../model/User.js";
import EmployeeModel from "../model/Employee.js";

/** The User.employee link, falling back to an email match. The one place this rule lives. */
export async function resolveEmployeeForUser(user, projection) {
  if (!user) return null;
  return user.employee
    ? await EmployeeModel.findById(user.employee, projection)
    : await EmployeeModel.findOne({ email: user.email }, projection);
}

/**
 * Department ObjectId for a MANAGER/EMPLOYEE, null for other roles. Throws
 * 403 when there is no linked Employee or department — falling through to
 * "sees everything" or "sees nothing" would both be surprising.
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
