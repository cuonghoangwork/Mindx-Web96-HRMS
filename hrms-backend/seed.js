// One-off seed script — populates MongoDB with enough demo data to run the
// HRMS frontend end-to-end.
//
// Usage:
//   cp .env.example .env.dev   (fill in CONNECT_STRING, AT_SECRETKEY, RT_SECRETKEY)
//   npm run seed:env
//
// Safe to re-run: skips anything that already exists by natural unique key.

import dotenv from "dotenv";
const env = process.env.NODE_ENV || "dev";
dotenv.config({ path: `.env.${env}` });

import bcrypt from "bcryptjs";
import { connectDB } from "./config/db.js";
import UserModel from "./model/User.js";
import EmployeeModel from "./model/Employee.js";
import DepartmentModel from "./model/Department.js";
import JobModel from "./model/Job.js";
import CandidateModel from "./model/Candidate.js";
import HolidayModel from "./model/Holiday.js";
import AttendanceModel from "./model/Attendance.js";
import NotificationModel from "./model/Notification.js";
import PositionLevelModel, { POSITION_LEVELS } from "./model/PositionLevel.js";
import { closeAttendanceDay } from "./jobs/closeAttendanceDay.js";
import { utcMidnight, hoursBetween } from "./utils/workday.js";

const SALT_ROUNDS = 10;

function hashPassword(plain) {
  const salt = bcrypt.genSaltSync(SALT_ROUNDS);
  return bcrypt.hashSync(plain, salt);
}

/* ── Admin account (ADMIN role — seed only) ──
 * Also gets a linked Employee record (same pattern as upsertHRUser/
 * upsertManagerUser below) so the sidebar's "My Profile" link — now shown
 * to every role — resolves to a real page instead of a dead link.
 */
async function upsertAdmin(deptByName) {
  const email = "admin@hrms.com";
  let user = await UserModel.findOne({ email });
  if (!user) {
    user = await UserModel.create({
      email,
      password: hashPassword("admin123"),
      name: "Admin User",
      role: "ADMIN",
    });
    console.log("✓ Created ADMIN user:", email, "/ admin123");
  } else {
    console.log("✓ Admin user already exists:", email);
  }

  let employee = user.employee
    ? await EmployeeModel.findById(user.employee)
    : await EmployeeModel.findOne({ email });
  if (!employee) {
    const dept = deptByName["Management"];
    // startDate backdated (and mirrored onto createdAt below) so this
    // account is included in every month of historical payroll —
    // buildPayslipRows (utils/payrollGeneration.js) selects payable
    // employees by createdAt, not startDate, so both need to agree.
    const startDate = new Date("2021-01-04");
    employee = await EmployeeModel.create({
      employeeId: "ADM001",
      name: "Admin User",
      email,
      department: dept ? dept._id : undefined,
      designation: "System Administrator",
      contractType: "full-time",
      status: "active",
      positionLevel: "Manager",
      annualSalary: 150000,
      userId: user._id,
      startDate,
      levelStartDate: startDate,
      createdAt: startDate,
    });
    console.log("✓ Created employee record for ADMIN user:", email, "(Management dept)");
  }

  if (!user.employee) {
    user.employee = employee._id;
    await user.save();
  }

  return user;
}

/* ── Demo HR account (company-wide, unscoped — see utils/managerScope.js
 * and HRMS_IMPROVEMENT_TASKS.md's HR/MANAGER role split) ──
 * Every "manager-tier" account needs a linked Employee record with a
 * department or it's locked out of manager-only actions — HR isn't
 * department-scoped, but the same User.employee -> Employee lookup still
 * resolves it, so it still needs the link.
 */
async function upsertHRUser(deptByName) {
  const email = "hr@hrms.com";
  let user = await UserModel.findOne({ email });
  if (!user) {
    user = await UserModel.create({
      email,
      password: hashPassword("hr123456"),
      name: "HR Manager",
      role: "HR",
    });
    console.log("✓ Created HR user:", email, "/ hr123456");
  } else {
    console.log("✓ HR user already exists:", email);
    if (user.role !== "HR") {
      user.role = "HR";
      await user.save();
      console.log("✓ Upgraded", email, "from MANAGER to HR (role split)");
    }
  }

  let employee = user.employee
    ? await EmployeeModel.findById(user.employee)
    : await EmployeeModel.findOne({ email });
  if (!employee) {
    const dept = deptByName["Management"];
    const startDate = new Date("2021-03-15");
    employee = await EmployeeModel.create({
      employeeId: "MGR001",
      name: "HR Manager",
      email,
      department: dept ? dept._id : undefined,
      designation: "HR Manager",
      contractType: "full-time",
      status: "active",
      positionLevel: "Manager",
      annualSalary: 130000,
      userId: user._id,
      startDate,
      levelStartDate: startDate,
      createdAt: startDate,
    });
    console.log("✓ Created employee record for HR user:", email, "(Management dept)");
  }

  if (!user.employee) {
    user.employee = employee._id;
    await user.save();
  }

  return user;
}

/* ── Demo MANAGER account — department-scoped line manager. Real backend
 * scoping (utils/managerScope.js) means this account only ever sees/acts
 * on Engineering, unlike the HR account above.
 */
async function upsertManagerUser(deptByName) {
  const email = "manager@hrms.com";
  let user = await UserModel.findOne({ email });
  if (!user) {
    user = await UserModel.create({
      email,
      password: hashPassword("manager123"),
      name: "Team Manager",
      role: "MANAGER",
    });
    console.log("✓ Created MANAGER user:", email, "/ manager123");
  } else {
    console.log("✓ MANAGER user already exists:", email);
  }

  let employee = user.employee
    ? await EmployeeModel.findById(user.employee)
    : await EmployeeModel.findOne({ email });
  if (!employee) {
    const dept = deptByName["Engineering"];
    const startDate = new Date("2022-02-01");
    employee = await EmployeeModel.create({
      employeeId: "MGR002",
      name: "Team Manager",
      email,
      department: dept ? dept._id : undefined,
      designation: "Engineering Manager",
      contractType: "full-time",
      status: "active",
      positionLevel: "Manager",
      annualSalary: 120000,
      userId: user._id,
      startDate,
      levelStartDate: startDate,
      createdAt: startDate,
    });
    console.log("✓ Created employee record for MANAGER user:", email, "(Engineering dept)");
  }

  if (!user.employee) {
    user.employee = employee._id;
    await user.save();
  }

  return user;
}

/* ── Departments ── */
async function seedDepartments() {
  const defs = [
    { name: "Engineering",  managerName: "John Smith",   budget: 500000 },
    { name: "Design",       managerName: "Sarah Lee",    budget: 200000 },
    { name: "Marketing",    managerName: "Mike Johnson", budget: 150000 },
    { name: "Finance",      managerName: "Lisa Brown",   budget: 100000 },
    { name: "Sales",        managerName: "Tom Wilson",   budget: 300000 },
    { name: "IT",           managerName: "David Chen",   budget: 400000 },
    { name: "Management",   managerName: "Robert Kim",   budget: 600000 },
  ];
  const byName = {};
  for (const def of defs) {
    let dept = await DepartmentModel.findOne({ name: def.name });
    if (!dept) {
      dept = await DepartmentModel.create(def);
      console.log("✓ Created department:", def.name);
    }
    byName[def.name] = dept;
  }
  return byName;
}

/* ── Employees — each gets a linked User account (EMPLOYEE role) ── */
async function seedEmployees(deptByName) {
  const defs = [
    { employeeId: "EMP001", name: "John Doe",      email: "john.doe@hrms.com",      department: "Engineering",  designation: "Software Engineer",  contractType: "full-time", status: "active",    age: 28, gender: "male",   address: "123 Main St, New York, NY",        annualSalary: 85000 },
    { employeeId: "EMP002", name: "Jane Smith",    email: "jane.smith@hrms.com",    department: "Design",       designation: "UI Designer",        contractType: "full-time", status: "active",    age: 32, gender: "female", address: "456 Oak Ave, Los Angeles, CA",     annualSalary: 75000 },
    { employeeId: "EMP003", name: "Bob Johnson",   email: "bob.johnson@hrms.com",   department: "Marketing",    designation: "Marketing Manager",  contractType: "full-time", status: "on-leave",  age: 45, gender: "male",   address: "789 Pine Rd, Chicago, IL",         annualSalary: 95000 },
    { employeeId: "EMP004", name: "Alice Brown",   email: "alice.brown@hrms.com",   department: "Finance",      designation: "HR Specialist",      contractType: "part-time", status: "active",    age: 29, gender: "female", address: "321 Elm St, Houston, TX",          annualSalary: 45000 },
    { employeeId: "EMP005", name: "Mike Wilson",   email: "mike.wilson@hrms.com",   department: "Sales",        designation: "Sales Manager",      contractType: "contract",  status: "active",    age: 38, gender: "male",   address: "654 Maple Dr, Phoenix, AZ",        annualSalary: 80000 },
    { employeeId: "EMP006", name: "Sarah Lee",     email: "sarah.lee@hrms.com",     department: "IT",           designation: "DevOps Engineer",    contractType: "part-time", status: "active",    age: 26, gender: "female", address: "987 Cedar Ln, Seattle, WA",        annualSalary: 55000 },
    { employeeId: "EMP007", name: "Tom Davis",     email: "tom.davis@hrms.com",     department: "Management",   designation: "Product Manager",    contractType: "full-time", status: "active",    age: 42, gender: "male",   address: "147 Birch Blvd, Boston, MA",       annualSalary: 110000 },
    { employeeId: "EMP008", name: "Lisa Chen",     email: "lisa.chen@hrms.com",     department: "Design",       designation: "UX Designer",        contractType: "contract",  status: "on-leave",  age: 31, gender: "female", address: "258 Spruce Way, San Francisco, CA", annualSalary: 90000 },

    // ── Extended roster (Sample Data plan, Phase 1) — 26 more employees so
    // every department has a real team instead of ~1 person, OrgChart has
    // something to actually chart, and 12 months of payroll/attendance
    // history has a believable headcount to run against. startDate doubles
    // as levelStartDate (via Employee.js's pre("validate") default) and is
    // mirrored onto createdAt below, since buildPayslipRows
    // (utils/payrollGeneration.js) selects payable employees by createdAt,
    // not startDate.
    //
    // Two entries are deliberately tenured past their ELIGIBILITY_THRESHOLD_MONTHS
    // (utils/positionLadder.js) so a later `checkPromotionEligibility` run
    // has real, non-fabricated candidates to auto-flag: EMP010 (Full-time
    // since 2021-12, threshold 48mo) and EMP013 (Intern since 2025-11,
    // threshold 2mo). Everyone else is kept safely under their threshold on
    // purpose, so the promotion queue doesn't fill up with noise.

    // Engineering (+6 — manager already covered by MGR002)
    { employeeId: "EMP009", name: "Nguyen Van Hai",   email: "hai.nguyen@hrms.com",   department: "Engineering", designation: "Senior Software Engineer", contractType: "full-time", status: "active", age: 33, gender: "male",   address: "12 Tran Duy Hung, Hanoi",             annualSalary: 98000,  positionLevel: "Senior",    startDate: new Date("2022-06-01") },
    { employeeId: "EMP010", name: "Rachel Kim",       email: "rachel.kim@hrms.com",   department: "Engineering", designation: "Software Engineer",        contractType: "full-time", status: "active", age: 34, gender: "female", address: "45 W 3rd St, Austin, TX",             annualSalary: 82000,  positionLevel: "Full-time", startDate: new Date("2021-12-01") }, // deliberately promotion-eligible
    { employeeId: "EMP011", name: "Daniel Cruz",      email: "daniel.cruz@hrms.com",  department: "Engineering", designation: "Frontend Engineer",        contractType: "full-time", status: "active", age: 27, gender: "male",   address: "88 5th Ave, Portland, OR",            annualSalary: 76000,  positionLevel: "Full-time", startDate: new Date("2024-09-01") },
    { employeeId: "EMP012", name: "Pham Thi Mai",     email: "mai.pham@hrms.com",     department: "Engineering", designation: "QA Engineer",              contractType: "full-time", status: "active", age: 26, gender: "female", address: "9 Nguyen Trai, Ho Chi Minh City",     annualSalary: 68000,  positionLevel: "Full-time", startDate: new Date("2025-02-01") },
    { employeeId: "EMP013", name: "Ethan Brooks",     email: "ethan.brooks@hrms.com", department: "Engineering", designation: "Software Engineer Intern", contractType: "intern",    status: "active", age: 22, gender: "male",   address: "210 Elm St, Denver, CO",              annualSalary: 24000,  positionLevel: "Intern",    startDate: new Date("2025-11-01") }, // deliberately promotion-eligible
    { employeeId: "EMP014", name: "Olivia Turner",    email: "olivia.turner@hrms.com",department: "Engineering", designation: "Senior Backend Engineer",  contractType: "full-time", status: "active", age: 35, gender: "female", address: "301 Bay St, San Diego, CA",           annualSalary: 102000, positionLevel: "Senior",    startDate: new Date("2023-04-01") },

    // Design (+3, incl. the department's Manager-tier lead)
    { employeeId: "EMP015", name: "Tran Thi Linh",    email: "linh.tran@hrms.com",    department: "Design",      designation: "Design Lead",              contractType: "full-time", status: "active", age: 36, gender: "female", address: "22 Xuan Thuy, Hanoi",                 annualSalary: 125000, positionLevel: "Manager",   startDate: new Date("2022-01-15") },
    { employeeId: "EMP016", name: "Marcus Webb",      email: "marcus.webb@hrms.com",  department: "Design",      designation: "Senior Product Designer",  contractType: "full-time", status: "active", age: 30, gender: "male",   address: "77 King St, Toronto, ON",             annualSalary: 96000,  positionLevel: "Senior",    startDate: new Date("2023-08-01") },
    { employeeId: "EMP017", name: "Grace Nolan",      email: "grace.nolan@hrms.com",  department: "Design",      designation: "Graphic Designer",         contractType: "full-time", status: "active", age: 25, gender: "female", address: "63 Union St, Nashville, TN",          annualSalary: 61000,  positionLevel: "Full-time", startDate: new Date("2025-10-01") },

    // Marketing (+4 — manager is EMP003, bumped below)
    { employeeId: "EMP018", name: "Le Quoc Bao",      email: "bao.le@hrms.com",       department: "Marketing",   designation: "Content Marketing Specialist", contractType: "full-time", status: "active",   age: 28, gender: "male",   address: "5 Le Loi, Da Nang",                annualSalary: 58000,  positionLevel: "Full-time", startDate: new Date("2024-03-01") },
    { employeeId: "EMP019", name: "Chloe Adams",      email: "chloe.adams@hrms.com",  department: "Marketing",   designation: "SEO Specialist",               contractType: "full-time", status: "on-leave", age: 29, gender: "female", address: "14 Fremont Ave, Seattle, WA",      annualSalary: 60000,  positionLevel: "Full-time", startDate: new Date("2025-01-15") },
    { employeeId: "EMP020", name: "Noah Fischer",     email: "noah.fischer@hrms.com", department: "Marketing",   designation: "Marketing Intern",             contractType: "intern",    status: "active",   age: 21, gender: "male",   address: "19 Baker St, Austin, TX",          annualSalary: 22000,  positionLevel: "Intern",    startDate: new Date("2026-07-15") },
    { employeeId: "EMP021", name: "Vo Thi Ngoc",      email: "ngoc.vo@hrms.com",      department: "Marketing",   designation: "Senior Marketing Executive",   contractType: "full-time", status: "active",   age: 34, gender: "female", address: "31 Hai Ba Trung, Hanoi",           annualSalary: 91000,  positionLevel: "Senior",    startDate: new Date("2022-09-01") },

    // Finance (+4, incl. the department's Manager-tier lead)
    { employeeId: "EMP022", name: "Harold Jennings",  email: "harold.jennings@hrms.com", department: "Finance", designation: "Finance Manager",       contractType: "full-time", status: "active", age: 44, gender: "male",   address: "8 Court St, Brooklyn, NY",             annualSalary: 128000, positionLevel: "Manager",   startDate: new Date("2021-05-01") },
    { employeeId: "EMP023", name: "Dang Thi Thu",     email: "thu.dang@hrms.com",        department: "Finance", designation: "Accountant",            contractType: "full-time", status: "active", age: 27, gender: "female", address: "40 Pasteur, Ho Chi Minh City",         annualSalary: 54000,  positionLevel: "Full-time", startDate: new Date("2024-06-01") },
    { employeeId: "EMP024", name: "Ian Sutherland",   email: "ian.sutherland@hrms.com",  department: "Finance", designation: "Payroll Specialist",    contractType: "full-time", status: "active", age: 31, gender: "male",   address: "16 Highland Ave, Dallas, TX",          annualSalary: 57000,  positionLevel: "Full-time", startDate: new Date("2025-09-01") },
    { employeeId: "EMP025", name: "Sofia Reyes",      email: "sofia.reyes@hrms.com",     department: "Finance", designation: "Financial Analyst",     contractType: "full-time", status: "active", age: 29, gender: "female", address: "22 Market St, San Francisco, CA",      annualSalary: 88000,  positionLevel: "Senior",    startDate: new Date("2023-11-01") },

    // Sales (+4 — manager is EMP005, bumped below)
    { employeeId: "EMP026", name: "Bui Van Thanh",    email: "thanh.bui@hrms.com",    department: "Sales",       designation: "Sales Executive",          contractType: "full-time", status: "active", age: 27, gender: "male",   address: "3 Vo Van Tan, Ho Chi Minh City",     annualSalary: 56000,  positionLevel: "Full-time", startDate: new Date("2024-02-01") },
    { employeeId: "EMP027", name: "Megan Price",      email: "megan.price@hrms.com",  department: "Sales",       designation: "Account Executive",        contractType: "full-time", status: "active", age: 30, gender: "female", address: "56 Peachtree St, Atlanta, GA",       annualSalary: 62000,  positionLevel: "Full-time", startDate: new Date("2025-05-01") },
    { employeeId: "EMP028", name: "Tyler Brooks",     email: "tyler.brooks@hrms.com", department: "Sales",       designation: "Sales Development Rep",    contractType: "intern",    status: "active", age: 23, gender: "male",   address: "9 Canal St, New Orleans, LA",        annualSalary: 23000,  positionLevel: "Intern",    startDate: new Date("2026-08-01") },
    { employeeId: "EMP029", name: "Hoang Thi Yen",    email: "yen.hoang@hrms.com",    department: "Sales",       designation: "Senior Sales Executive",   contractType: "full-time", status: "active", age: 33, gender: "female", address: "27 Ly Thuong Kiet, Hanoi",           annualSalary: 93000,  positionLevel: "Senior",    startDate: new Date("2022-11-01") },

    // IT (+4, incl. the department's Manager-tier lead)
    { employeeId: "EMP030", name: "Trevor Hayes",     email: "trevor.hayes@hrms.com", department: "IT",          designation: "IT Manager",               contractType: "full-time", status: "active",     age: 40, gender: "male",   address: "71 Congress Ave, Austin, TX",        annualSalary: 122000, positionLevel: "Manager",   startDate: new Date("2021-09-01") },
    { employeeId: "EMP031", name: "Do Minh Tuan",     email: "tuan.do@hrms.com",      department: "IT",          designation: "Network Administrator",    contractType: "full-time", status: "active",     age: 29, gender: "male",   address: "18 Cau Giay, Hanoi",                 annualSalary: 63000,  positionLevel: "Full-time", startDate: new Date("2024-07-01") },
    { employeeId: "EMP032", name: "Priya Nair",       email: "priya.nair@hrms.com",   department: "IT",          designation: "IT Support Specialist",    contractType: "full-time", status: "on-leave",   age: 26, gender: "female", address: "132 Elm Ave, San Jose, CA",          annualSalary: 52000,  positionLevel: "Full-time", startDate: new Date("2025-12-01") },
    { employeeId: "EMP033", name: "Connor Blake",     email: "connor.blake@hrms.com", department: "IT",          designation: "Senior Systems Engineer",  contractType: "full-time", status: "terminated", age: 37, gender: "male",   address: "205 Broad St, Richmond, VA",         annualSalary: 99000,  positionLevel: "Senior",    startDate: new Date("2023-02-01") },

    // Management (+1)
    { employeeId: "EMP034", name: "Jennifer Ross",    email: "jennifer.ross@hrms.com", department: "Management", designation: "Executive Assistant", contractType: "full-time", status: "active", age: 30, gender: "female", address: "50 State St, Boston, MA", annualSalary: 58000, positionLevel: "Full-time", startDate: new Date("2023-06-01") },
  ];

  const created = [];
  for (const def of defs) {
    let emp = await EmployeeModel.findOne({ employeeId: def.employeeId });

    // Ensure a linked User account exists for each employee
    let userAcc = await UserModel.findOne({ email: def.email });
    if (!userAcc) {
      // Derive a simple demo password from the employee ID
      userAcc = await UserModel.create({
        email: def.email,
        password: hashPassword(`${def.employeeId.toLowerCase()}pass`),
        name: def.name,
        role: "EMPLOYEE",
      });
      console.log(`✓ Created EMPLOYEE user: ${def.email} / ${def.employeeId.toLowerCase()}pass`);
    }

    if (!emp) {
      const dept = deptByName[def.department];
      emp = await EmployeeModel.create({
        ...def,
        department: dept ? dept._id : undefined,
        userId: userAcc._id,
        // Mirror startDate onto createdAt (undefined for the original 8,
        // where it's a no-op) — see the extended-roster comment above for
        // why this matters for historical payroll generation.
        createdAt: def.startDate,
      });
      console.log("✓ Created employee:", def.employeeId, def.name);
    }

    // Link user → employee if not already set
    if (!userAcc.employee) {
      userAcc.employee = emp._id;
      await userAcc.save();
    }

    created.push(emp);
  }
  return created;
}

/**
 * Bob Johnson (EMP003, Marketing) and Mike Wilson (EMP005, Sales) were
 * seeded pre-Position-Ladder with designations that already say "Manager"
 * but no positionLevel to match (they default to "Full-time"). This backs
 * that up to reality so they're valid Manager-tier candidates for
 * linkDepartmentManagers() below, without touching anything else about
 * either record. Idempotent — a no-op once already applied.
 */
async function backfillMarketingAndSalesManagers() {
  const fixes = [
    { employeeId: "EMP003", startDate: new Date("2019-04-01") },
    { employeeId: "EMP005", startDate: new Date("2018-10-01") },
  ];
  for (const fix of fixes) {
    const emp = await EmployeeModel.findOne({ employeeId: fix.employeeId });
    if (!emp) continue;
    if (emp.positionLevel === "Manager" && emp.levelStartDate) continue;
    emp.positionLevel = "Manager";
    emp.levelStartDate = fix.startDate;
    if (!emp.startDate) emp.startDate = fix.startDate;
    await emp.save({ validateBeforeSave: false });
    await EmployeeModel.updateOne(
      { _id: emp._id, createdAt: { $gt: fix.startDate } },
      { $set: { createdAt: fix.startDate } },
      { timestamps: false },
    );
    console.log("✓ Backfilled positionLevel=Manager for", fix.employeeId, emp.name);
  }
}

/**
 * Links each Department's `manager` field to a real Employee (fixes a real
 * gap: seedDepartments() only ever set the free-text managerName, so
 * OrgChart.jsx's DepartmentCluster — which resolves the manager via
 * department.managerId — rendered every department with no manager found).
 * Also syncs managerName to the linked employee's real name so the two
 * fields don't drift apart. Safe to re-run.
 */
async function linkDepartmentManagers(deptByName) {
  const managerByDept = {
    Engineering: "MGR002",
    Design: "EMP015",
    Marketing: "EMP003",
    Finance: "EMP022",
    Sales: "EMP005",
    IT: "EMP030",
    Management: "MGR001",
  };
  for (const [deptName, employeeId] of Object.entries(managerByDept)) {
    const dept = deptByName[deptName];
    const manager = await EmployeeModel.findOne({ employeeId });
    if (!dept || !manager) continue;
    if (dept.manager && idsEqual(dept.manager, manager._id) && dept.managerName === manager.name) {
      continue;
    }
    dept.manager = manager._id;
    dept.managerName = manager.name;
    await dept.save();
    console.log(`✓ Linked ${deptName} → manager: ${manager.name} (${employeeId})`);
  }
}

function idsEqual(a, b) {
  return String(a) === String(b);
}

/* ── Jobs ── */
async function seedJobs(deptByName) {
  const defs = [
    { title: "Senior Software Engineer", department: "Engineering", location: "Remote",            type: "full-time", status: "open"   },
    { title: "UI/UX Designer",           department: "Design",      location: "New York",          type: "full-time", status: "open"   },
    { title: "Product Manager",          department: "Management",  location: "San Francisco",     type: "full-time", status: "filled" },
    { title: "DevOps Engineer",          department: "IT",          location: "Remote",            type: "contract",  status: "open"   },
    { title: "Marketing Intern",         department: "Marketing",   location: "Hanoi",             type: "intern",    status: "open"   },
    { title: "Sales Associate",          department: "Sales",       location: "Ho Chi Minh City",  type: "full-time", status: "closed" },
  ];
  const created = [];
  for (const def of defs) {
    let job = await JobModel.findOne({ title: def.title });
    if (!job) {
      const dept = deptByName[def.department];
      job = await JobModel.create({ ...def, department: dept ? dept._id : undefined });
      console.log("✓ Created job:", def.title);
    }
    created.push(job);
  }
  return created;
}

/* ── Candidates ── */
async function seedCandidates(jobs) {
  const byTitle = Object.fromEntries(jobs.map((j) => [j.title, j]));
  const defs = [
    { name: "Mike Wilson",  jobTitle: "Senior Software Engineer", stage: "interview", rating: 4.5, email: "mike.wilson.cand@example.com", phone: "+84 90 123 4567", notes: "Strong backend experience." },
    { name: "Sarah Lee",    jobTitle: "UI/UX Designer",           stage: "screening", rating: 4.0, email: "sarah.lee.cand@example.com",   phone: "+84 91 234 5678", notes: "Great portfolio."           },
    { name: "Tom Brown",    jobTitle: "DevOps Engineer",          stage: "offer",     rating: 4.8, email: "tom.brown@example.com",        phone: "+84 92 345 6789", notes: "Offer extended."            },
    { name: "Emily Davis",  jobTitle: "Senior Software Engineer", stage: "applied",   rating: 3.8, email: "emily.davis@example.com",      phone: "+84 93 456 7890", notes: ""                           },
    { name: "James Nguyen", jobTitle: "Marketing Intern",         stage: "hired",     rating: 4.2, email: "james.nguyen@example.com",     phone: "+84 94 567 8901", notes: "Starts soon."              },
  ];
  for (const def of defs) {
    const job = byTitle[def.jobTitle];
    if (!job) continue;
    const exists = await CandidateModel.findOne({ email: def.email });
    if (!exists) {
      await CandidateModel.create({ ...def, job: job._id, resumeUrl: "#" });
      console.log("✓ Created candidate:", def.name);
    }
  }
}

/* ── Holidays ── */
async function seedHolidays() {
  const defs = [
    { name: "New Year's Day",                  date: "2026-01-01", type: "public"   },
    { name: "Tet Holiday (Lunar New Year)",    date: "2026-02-17", type: "public"   },
    { name: "Hung Kings' Temple Festival",     date: "2026-04-26", type: "public"   },
    { name: "Reunification Day",               date: "2026-04-30", type: "public"   },
    { name: "International Labor Day",         date: "2026-05-01", type: "public"   },
    { name: "Company Anniversary",             date: "2026-06-15", type: "company"  },
    { name: "National Day",                    date: "2026-09-02", type: "public"   },
    { name: "Year-End Wellness Day",           date: "2026-12-24", type: "optional" },
  ];
  for (const def of defs) {
    const date = new Date(def.date);
    const exists = await HolidayModel.findOne({ name: def.name, date });
    if (!exists) {
      await HolidayModel.create({ ...def, date });
      console.log("✓ Created holiday:", def.name);
    }
  }
}

/* ── Attendance history (Sample Data plan, Phase 2) ──────────────────────
 * Replaces the old single stale day with a real trailing-12-month window,
 * built two different ways depending on how recent the day is:
 *
 *   - Older business days: inserted directly with a plausible
 *     present/late/on-leave/no-show mix. Running the real end-of-day
 *     closer for ~230 individual days would be a lot of slow, sequential
 *     writes for no extra realism this far back — nobody is going to open
 *     a payroll deduction from 9 months ago and check whether it was
 *     computed by the live job or backfilled.
 *   - The most recent RECENT_SLICE_BUSINESS_DAYS: seeded as check-ins only
 *     (open, no checkOut — exactly what a real day looks like mid-close),
 *     then actually closed via the real closeAttendanceDay() job
 *     (jobs/closeAttendanceDay.js) so late-flagging, no-show detection,
 *     and the auto NoShowReview flag are real business logic, not
 *     hand-faked. One deliberately-new hire (EMP028) is left uncovered
 *     often enough to cross the real 5-no-show threshold.
 *   - "Today" is left as in-progress check-ins with no checkOut and is
 *     never closed — ENABLE_SCHEDULER=false on Render's free tier means
 *     nothing auto-closes it in production either, so this matches what a
 *     freshly-deployed instance would actually look like.
 *
 * All dates are handled in UTC calendar terms throughout (matching
 * utils/workday.js's utcMidnight/utcDateKey convention that the real job
 * already stores dates in) so bulk-inserted and job-closed records are
 * byte-consistent with each other.
 */

const RECENT_SLICE_BUSINESS_DAYS = 20; // ~4 weeks, closed via the real job
const ON_LEAVE_STREAK_EMPLOYEE_IDS = new Set(["EMP008", "EMP019", "EMP032"]); // currently Employee.status "on-leave"
const ON_LEAVE_STREAK_BIZ_DAYS = 12; // how far back their leave streak runs
const TERMINATED_CUTOFF_KEY = "2026-07-01"; // EMP033 (terminated) has no attendance from here on
const CHRONIC_NO_SHOW_EMPLOYEE_ID = "EMP028"; // very new hire — deliberately crosses the real no-show threshold

function pad2(n) {
  return String(n).padStart(2, "0");
}
function toDateKeyUtc(d) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}
function isWeekendUtc(d) {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}
function addUtcDays(d, days) {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}
function randomHHMM(minMinutes, maxMinutes) {
  const total = Math.floor(minMinutes + Math.random() * (maxMinutes - minMinutes));
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}
const checkInOnTime = () => randomHHMM(8 * 60 + 40, 9 * 60 + 12); // 08:40–09:12, under WORKDAY_LATE_AFTER's 09:15 default
const checkInLate = () => randomHHMM(9 * 60 + 20, 9 * 60 + 55); // 09:20–09:55, past it
const checkOutNormal = () => randomHHMM(17 * 60 + 25, 18 * 60 + 20); // 17:25–18:20

// Same "insert, tolerate duplicate-key errors" pattern jobs/closeAttendanceDay.js's
// markNoShow() already uses — makes bulk seeding idempotent on re-run without a
// slow per-record existence check first.
async function insertAttendanceTolerantly(docs) {
  if (!docs.length) return 0;
  try {
    const res = await AttendanceModel.insertMany(docs, { ordered: false });
    return res.length;
  } catch (err) {
    const isDuplicateOnly =
      err?.code === 11000 ||
      (Array.isArray(err?.writeErrors) &&
        err.writeErrors.length > 0 &&
        err.writeErrors.every((w) => (w?.err?.code ?? w?.code) === 11000));
    if (!isDuplicateOnly) throw err;
    return err.result?.insertedCount ?? err.insertedDocs?.length ?? 0;
  }
}

// Mirrors seedHolidays()'s 2026 dates that fall in this window, so bulk
// attendance and the Holiday collection agree with each other.
const SEEDED_2026_HOLIDAYS = new Set([
  "2026-01-01",
  "2026-02-17",
  "2026-04-26",
  "2026-04-30",
  "2026-05-01",
  "2026-06-15",
]);

function collectBusinessDayKeys(startUtc, endUtcInclusive) {
  const keys = [];
  for (let d = new Date(startUtc); d <= endUtcInclusive; d = addUtcDays(d, 1)) {
    if (isWeekendUtc(d)) continue;
    if (SEEDED_2026_HOLIDAYS.has(toDateKeyUtc(d))) continue;
    keys.push(toDateKeyUtc(d));
  }
  return keys;
}

async function seedBulkAttendance(employees, bulkDateKeys) {
  const onLeaveStreakStart = bulkDateKeys.length - ON_LEAVE_STREAK_BIZ_DAYS;
  const docs = [];

  bulkDateKeys.forEach((dateKey, idx) => {
    const date = utcMidnight(dateKey);
    const isOnLeaveStreakDay = idx >= onLeaveStreakStart;

    for (const emp of employees) {
      if (emp.createdAt && date < emp.createdAt) continue; // not hired yet
      if (emp.employeeId === "EMP033" && dateKey >= TERMINATED_CUTOFF_KEY) continue; // left the company
      if (emp.employeeId === CHRONIC_NO_SHOW_EMPLOYEE_ID) continue; // their whole history lives in the recent slice

      if (ON_LEAVE_STREAK_EMPLOYEE_IDS.has(emp.employeeId) && isOnLeaveStreakDay) {
        docs.push({ employee: emp._id, date, checkIn: null, checkOut: null, hours: 0, status: "on-leave" });
        continue;
      }

      // no-show is deliberately rare here (unlike the recent-slice phase
      // below): bulk days never run the real closeAttendanceDay job, so an
      // employee who racked up 5+ of these by chance alone would never
      // trigger a real NoShowReview flag — a silent inconsistency if
      // anyone dug into their attendance history. Kept low enough
      // (~1 expected per employee over the whole bulk window) that only
      // the deliberate EMP028 case (handled via the real job, below)
      // realistically crosses the threshold.
      const roll = Math.random();
      if (roll < 0.03) {
        docs.push({ employee: emp._id, date, checkIn: null, checkOut: null, hours: 0, status: "on-leave" });
      } else if (roll < 0.035) {
        docs.push({ employee: emp._id, date, checkIn: null, checkOut: null, hours: 0, status: "no-show" });
      } else if (roll < 0.115) {
        const checkIn = checkInLate();
        const checkOut = checkOutNormal();
        docs.push({
          employee: emp._id,
          date,
          checkIn,
          checkOut,
          hours: hoursBetween(checkIn, checkOut),
          status: "late",
          lateHalfDayType: Math.random() < 0.85 ? "annual" : "unpaid",
        });
      } else {
        const checkIn = checkInOnTime();
        const checkOut = checkOutNormal();
        docs.push({
          employee: emp._id,
          date,
          checkIn,
          checkOut,
          hours: hoursBetween(checkIn, checkOut),
          status: "present",
        });
      }
    }
  });

  const BATCH = 2000;
  let inserted = 0;
  for (let i = 0; i < docs.length; i += BATCH) {
    inserted += await insertAttendanceTolerantly(docs.slice(i, i + BATCH));
  }
  console.log(
    `✓ Bulk-seeded ${inserted} attendance records across ${bulkDateKeys.length} business days` +
      (docs.length - inserted > 0 ? ` (${docs.length - inserted} already existed)` : ""),
  );
}

async function seedRecentAttendanceViaRealJob(employees, recentDateKeys) {
  let chronicNoShows = 0;

  for (const dateKey of recentDateKeys) {
    const date = utcMidnight(dateKey);
    const preSeedDocs = [];

    for (const emp of employees) {
      if (emp.createdAt && date < emp.createdAt) continue;
      if (emp.employeeId === "EMP033" && dateKey >= TERMINATED_CUTOFF_KEY) continue;

      if (ON_LEAVE_STREAK_EMPLOYEE_IDS.has(emp.employeeId)) {
        preSeedDocs.push({ employee: emp._id, date, checkIn: null, checkOut: null, hours: 0, status: "on-leave" });
        continue;
      }

      if (emp.employeeId === CHRONIC_NO_SHOW_EMPLOYEE_ID && chronicNoShows < 6) {
        chronicNoShows += 1;
        continue; // no attendance record at all — the real markNoShow() below will catch it
      }

      if (Math.random() < 0.03) continue; // an ordinary occasional no-show, rotates across everyone else

      // Left open (no checkOut) — closeAttendanceDay()'s autoCheckOut() step
      // fills that in below, exactly as it would in production.
      const checkIn = Math.random() < 0.10 ? checkInLate() : checkInOnTime();
      preSeedDocs.push({ employee: emp._id, date, checkIn, checkOut: null, hours: 0, status: "present" });
    }

    await insertAttendanceTolerantly(preSeedDocs);

    // The real job — late-flagging, no-show detection, and the 5-no-show
    // NoShowReview auto-flag all run for real here, in chronological order
    // (required: flagRepeatedNoShows checks an all-time cumulative count,
    // so it must fire on the actual day the 5th no-show happens).
    const result = await closeAttendanceDay({ dateKey });
    console.log(`✓ Closed ${dateKey} via the real job:`, JSON.stringify(result));
  }
}

async function seedTodayInProgress(employees, now) {
  const dateKey = toDateKeyUtc(now);
  const date = utcMidnight(dateKey);
  const docs = [];

  for (const emp of employees) {
    if (emp.createdAt && date < emp.createdAt) continue;
    if (emp.employeeId === "EMP033" && dateKey >= TERMINATED_CUTOFF_KEY) continue;
    if (emp.employeeId === CHRONIC_NO_SHOW_EMPLOYEE_ID) continue; // stays consistent with their pattern

    if (ON_LEAVE_STREAK_EMPLOYEE_IDS.has(emp.employeeId)) {
      docs.push({ employee: emp._id, date, checkIn: null, checkOut: null, hours: 0, status: "on-leave" });
      continue;
    }
    if (Math.random() < 0.08) continue; // hasn't checked in yet today

    const checkIn = Math.random() < 0.08 ? checkInLate() : checkInOnTime();
    docs.push({ employee: emp._id, date, checkIn, checkOut: null, hours: 0, status: "present" });
  }

  const inserted = await insertAttendanceTolerantly(docs);
  console.log(
    `✓ Seeded ${inserted} in-progress check-ins for today (${dateKey}) — left open, since ` +
      "ENABLE_SCHEDULER=false in production means nothing auto-closes today's attendance.",
  );
}

async function seedAttendanceHistory(employees) {
  const now = new Date();
  const todayUtc = utcMidnight(toDateKeyUtc(now));
  const yesterdayUtc = addUtcDays(todayUtc, -1);
  const windowStartUtc = addUtcDays(todayUtc, -365);

  const allDateKeys = collectBusinessDayKeys(windowStartUtc, yesterdayUtc);
  const recentDateKeys = allDateKeys.slice(-RECENT_SLICE_BUSINESS_DAYS);
  const bulkDateKeys = allDateKeys.slice(0, -RECENT_SLICE_BUSINESS_DAYS);

  console.log(
    `Attendance window: ${toDateKeyUtc(windowStartUtc)} → ${toDateKeyUtc(yesterdayUtc)} ` +
      `(${allDateKeys.length} business days: ${bulkDateKeys.length} bulk-seeded, ` +
      `${recentDateKeys.length} closed via the real job)`,
  );

  await seedBulkAttendance(employees, bulkDateKeys);
  await seedRecentAttendanceViaRealJob(employees, recentDateKeys);
  await seedTodayInProgress(employees, now);
}

/* ── Position Ladder (tasks 0.3 / 2.1 / 2.2) ── */
async function seedPositionLevels() {
  // level -> order, baseSalary (USD, same scale as seedEmployees' annualSalary
  // above). HR can adjust baseSalary later via PATCH /position-levels/:level;
  // order and level are structural and aren't meant to change at runtime.
  const defs = [
    { level: "Intern", order: 0, baseSalary: 20000 },
    { level: "Full-time", order: 1, baseSalary: 60000 },
    { level: "Senior", order: 2, baseSalary: 90000 },
    { level: "Manager", order: 3, baseSalary: 130000 },
  ];
  const definedLevels = defs.map((d) => d.level);
  const missing = POSITION_LEVELS.filter((l) => !definedLevels.includes(l));
  if (missing.length) {
    throw new Error(`seedPositionLevels is missing seed data for: ${missing.join(", ")}`);
  }
  for (const def of defs) {
    const exists = await PositionLevelModel.findOne({ level: def.level });
    if (!exists) {
      await PositionLevelModel.create(def);
      console.log("✓ Created position level:", def.level, `($${def.baseSalary})`);
    }
  }
}

/**
 * One-time backfill for employees created before positionLevel/levelStartDate
 * existed on the schema. New employees get these defaulted automatically by
 * Employee.js's pre("validate") hook, but that hook only fires on document
 * creation — it can't retroactively fill in already-existing documents.
 * Safe to re-run: only touches documents where the field is still unset.
 */
async function backfillEmployeePositionLadder() {
  const missingLevel = await EmployeeModel.updateMany(
    { positionLevel: { $exists: false } },
    { $set: { positionLevel: "Full-time" } },
  );
  if (missingLevel.modifiedCount > 0) {
    console.log(`✓ Backfilled positionLevel on ${missingLevel.modifiedCount} existing employee(s)`);
  }

  // levelStartDate: prefer the employee's own startDate (best available proxy
  // for "when they entered their current level") over "now", since defaulting
  // to now would reset every existing employee's promotion-eligibility clock
  // to zero and delay real promotions that should already be due.
  const employeesMissingDate = await EmployeeModel.find({
    $or: [{ levelStartDate: { $exists: false } }, { levelStartDate: null }],
  });
  let backfilledDates = 0;
  for (const emp of employeesMissingDate) {
    emp.levelStartDate = emp.startDate || emp.createdAt || new Date();
    await emp.save({ validateBeforeSave: false });
    backfilledDates += 1;
  }
  if (backfilledDates > 0) {
    console.log(`✓ Backfilled levelStartDate on ${backfilledDates} existing employee(s)`);
  }
}

/* ── Notifications ── */
async function seedNotifications() {
  const defs = [
    { category: "leave",   title: "New leave request",    message: "John Doe requested 3 days off"                        },
    { category: "hiring",  title: "Interview scheduled",  message: "Candidate interview for Design role"                  },
    { category: "payroll", title: "Payroll processed",    message: "May payroll has been processed"                       },
    { category: "employee",title: "New employee added",   message: "Sarah Smith has joined the team"                      },
    { category: "holiday", title: "Upcoming holiday",     message: "Company Anniversary is coming up on Jun 15"          },
    { category: "system",  title: "System maintenance",   message: "Scheduled maintenance this weekend"                   },
  ];
  for (const def of defs) {
    const exists = await NotificationModel.findOne({ title: def.title, user: null });
    if (!exists) {
      await NotificationModel.create({ ...def, user: null });
      console.log("✓ Created notification:", def.title);
    }
  }
}

/* ── Main ── */
async function main() {
  await connectDB();

  const deptByName = await seedDepartments();
  await upsertAdmin(deptByName);
  await upsertHRUser(deptByName);
  await upsertManagerUser(deptByName);
  const employees  = await seedEmployees(deptByName);
  const jobs       = await seedJobs(deptByName);

  await seedPositionLevels();
  await backfillEmployeePositionLadder();
  await backfillMarketingAndSalesManagers();
  await linkDepartmentManagers(deptByName);

  await seedCandidates(jobs);
  await seedHolidays();
  await seedAttendanceHistory(employees);
  await seedNotifications();

  console.log("\n✅ Seed complete.");
  console.log("   Admin    → admin@hrms.com    / admin123");
  console.log("   HR       → hr@hrms.com       / hr123456   (company-wide)");
  console.log("   Manager  → manager@hrms.com  / manager123 (Engineering dept only)");
  console.log("   Employees → <firstname>.<lastname>@hrms.com / emp001pass … (37 seeded employees, EMP001–EMP034 + ADM001/MGR001/MGR002)\n");

  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
