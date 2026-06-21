/**
 * refResolvers.js — async lookups that the pure mappers.js can't do on its own.
 *
 * The frontend works with department/manager NAMES, not ObjectIds (e.g. AddEmployeeModal's
 * department <select> stores the name; AddDepartmentModal's manager field is free text,
 * not tied to any Employee record). These helpers bridge that to the ObjectId refs defined
 * in hrms_schema_docs.md, and are applied by the controller in addition to the field/enum
 * mapping in mappers.js.
 */

import DepartmentModel from "../model/Department.js";
import EmployeeModel from "../model/Employee.js";

/**
 * Resolves a department display name to its ObjectId.
 * Throws if no department with that name exists - departments are expected to be created
 * explicitly via the Departments page first, rather than auto-vivified from a typo.
 */
export async function resolveDepartmentIdByName(name) {
  if (!name) return null;
  const department = await DepartmentModel.findOne({ name });
  if (!department) {
    throw new Error(`Department "${name}" not found. Please create it first.`);
  }
  return department._id;
}

/**
 * Department.manager is documented as an ObjectId ref to Employee, but the frontend's
 * AddDepartmentModal collects the manager as a plain text field with no employee picker.
 * Best-effort link to a matching Employee by name (case-insensitive) for relational
 * integrity, but always also keep the literal text in `managerName` so the label is never
 * lost if no match is found (or the linked employee is later renamed/removed).
 */
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
