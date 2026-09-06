import { seedAdminAndLogin, seedUserAndLogin } from "./testHelpers.js";

export const CYCLE_KEY_PATTERN = /^\d{4}-h[12]$/;

async function makeDepartment(name) {
  const { default: DepartmentModel } = await import("../model/Department.js");
  return DepartmentModel.create({ name });
}

async function makeEmployee({ employeeId, name, email, department, status = "active" }) {
  const { default: EmployeeModel } = await import("../model/Employee.js");
  return EmployeeModel.create({
    employeeId,
    name,
    email,
    department: department?._id ?? department ?? null,
    status,
    contractType: "full-time",
    annualSalary: 60000,
  });
}

async function linkUser(app, { email, name, role, employee }) {
  const { default: EmployeeModel } = await import("../model/Employee.js");
  const seeded = await seedUserAndLogin(app, {
    email,
    name,
    role,
    employee: employee?._id ?? null,
  });
  if (employee) {
    await EmployeeModel.updateOne({ _id: employee._id }, { $set: { userId: seeded.user._id } });
  }
  return seeded;
}

export async function seedPerformanceOrg(app) {
  const engineering = await makeDepartment("Engineering");
  const design = await makeDepartment("Design");
  const management = await makeDepartment("Management");

  const managerEmployee = await makeEmployee({
    employeeId: "EMP101",
    name: "Eng Manager",
    email: "mgr@t.test",
    department: engineering,
  });
  const devEmployee = await makeEmployee({
    employeeId: "EMP102",
    name: "Dev One",
    email: "dev@t.test",
    department: engineering,
  });
  const designerEmployee = await makeEmployee({
    employeeId: "EMP103",
    name: "Designer One",
    email: "designer@t.test",
    department: design,
  });
  const hrEmployee = await makeEmployee({
    employeeId: "EMP104",
    name: "HR Person",
    email: "hr@t.test",
    department: management,
  });

  const admin = await seedAdminAndLogin(app);
  const manager = await linkUser(app, {
    email: "mgr@t.test",
    name: "Eng Manager",
    role: "MANAGER",
    employee: managerEmployee,
  });
  const dev = await linkUser(app, {
    email: "dev@t.test",
    name: "Dev One",
    role: "EMPLOYEE",
    employee: devEmployee,
  });
  const designer = await linkUser(app, {
    email: "designer@t.test",
    name: "Designer One",
    role: "EMPLOYEE",
    employee: designerEmployee,
  });
  const hr = await linkUser(app, {
    email: "hr@t.test",
    name: "HR Person",
    role: "HR",
    employee: hrEmployee,
  });

  return {
    departments: { engineering, design, management },
    employees: {
      manager: managerEmployee,
      dev: devEmployee,
      designer: designerEmployee,
      hr: hrEmployee,
    },
    tokens: {
      admin: admin.token,
      manager: manager.token,
      dev: dev.token,
      designer: designer.token,
      hr: hr.token,
    },
    users: { admin, manager, dev, designer, hr },
  };
}

/**
 * A MANAGER in a department the base org has none for.
 *
 * Every reviewer-fan-out test needs one: without a second department's
 * manager there is nobody the notice must NOT reach, and a test that only
 * checks who WAS notified passes just as happily when everyone was.
 */
export async function seedDepartmentManager(
  app,
  department,
  { employeeId = "EMP301", name = "Second Manager", email = "secondmgr@t.test" } = {},
) {
  const employee = await makeEmployee({ employeeId, name, email, department });
  return linkUser(app, { email, name, role: "MANAGER", employee });
}

export function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

export async function currentCycleKey() {
  const { halfOf, standardCycleKey } = await import("../utils/performanceCycles.js");
  const { year, half } = halfOf(new Date());
  return standardCycleKey(year, half);
}

export async function closedCycleKey() {
  const { halfOf, previousHalf, standardCycleKey } = await import("../utils/performanceCycles.js");
  const previous = previousHalf(halfOf(new Date()));
  return standardCycleKey(previous.year, previous.half);
}
