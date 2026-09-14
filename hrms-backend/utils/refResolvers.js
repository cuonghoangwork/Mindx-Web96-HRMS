/**
 * The async lookups mappers.js cannot do: the frontend sends department and
 * manager NAMES, the schema stores ObjectId refs. Applied by the controller
 * after the pure field mapping.
 */

import DepartmentModel from "../model/Department.js";
import EmployeeModel from "../model/Employee.js";

/** Department name → ObjectId. Throws for an unknown name rather than auto-creating one from a typo. */
export async function resolveDepartmentIdByName(name) {
  if (!name) return null;
  const department = await DepartmentModel.findOne({ name });
  if (!department) {
    throw new Error(`Department "${name}" not found. Please create it first.`);
  }
  return department._id;
}

/** Best-effort link of a free-text manager name to an Employee; `managerName` always keeps the literal text. */
export async function resolveManagerRef(name) {
  if (!name) return { manager: null, managerName: null };
  const match = await EmployeeModel.findOne({
    name: new RegExp(`^${escapeRegExp(name)}$`, "i"),
  });
  return { manager: match ? match._id : null, managerName: name };
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
