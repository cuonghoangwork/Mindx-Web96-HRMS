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
import LeaveRequestModel from "./model/LeaveRequest.js";
import PayrollPeriodModel from "./model/PayrollPeriod.js";
import PayslipModel from "./model/Payslip.js";
import { closeAttendanceDay } from "./jobs/closeAttendanceDay.js";
import { generateMonthlyPayrollDraft } from "./jobs/generateMonthlyPayrollDraft.js";
import { runMonthlyPayroll } from "./jobs/runMonthlyPayroll.js";
import { checkPromotionEligibility } from "./jobs/checkPromotionEligibility.js";
import PromotionRequestModel from "./model/PromotionRequest.js";
import ProfileEditRequestModel from "./model/ProfileEditRequest.js";
import PerformanceCycleModel from "./model/PerformanceCycle.js";
import PerformanceReviewModel from "./model/PerformanceReview.js";
import { ensureStandardCycles } from "./utils/performanceCycles.js";
import { utcMidnight, hoursBetween } from "./utils/workday.js";
import { countWorkingDays } from "./utils/leaveBalance.js";
import { logAction } from "./utils/auditLog.js";

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
    // ── Sample Data plan, Phase 8 — more candidates per open pipeline so
    // the Jobs/Candidates pages show a real funnel instead of one name per role.
    { name: "Daniel Park",  jobTitle: "Senior Software Engineer", stage: "applied",   rating: 3.5, email: "daniel.park@example.com",      phone: "+84 90 111 2233", notes: ""                                     },
    { name: "Priya Sharma", jobTitle: "Senior Software Engineer", stage: "screening", rating: 4.1, email: "priya.sharma@example.com",     phone: "+84 91 222 3344", notes: "Solid systems design background."   },
    { name: "Kevin Tran",   jobTitle: "Senior Software Engineer", stage: "rejected",  rating: 2.5, email: "kevin.tran@example.com",       phone: "+84 92 333 4455", notes: "Didn't pass the technical screen."   },
    { name: "Isabella Cruz",jobTitle: "UI/UX Designer",           stage: "applied",   rating: 3.6, email: "isabella.cruz@example.com",    phone: "+84 93 444 5566", notes: ""                                     },
    { name: "Minh Nguyen",  jobTitle: "UI/UX Designer",           stage: "interview", rating: 4.3, email: "minh.nguyen.cand@example.com", phone: "+84 94 555 6677", notes: "Strong case study walkthrough."      },
    { name: "Oliver Bennett",jobTitle: "UI/UX Designer",          stage: "rejected",  rating: 2.8, email: "oliver.bennett@example.com",   phone: "+84 95 666 7788", notes: "Portfolio didn't fit our product style." },
    { name: "Rachel Adams", jobTitle: "DevOps Engineer",          stage: "applied",   rating: 3.4, email: "rachel.adams@example.com",     phone: "+84 96 777 8899", notes: ""                                     },
    { name: "Duc Pham",     jobTitle: "DevOps Engineer",          stage: "screening", rating: 3.9, email: "duc.pham@example.com",         phone: "+84 97 888 9900", notes: "Good Kubernetes experience."         },
    { name: "Sophie Turner",jobTitle: "Marketing Intern",         stage: "applied",   rating: 3.2, email: "sophie.turner@example.com",    phone: "+84 98 999 0011", notes: ""                                     },
    { name: "Anh Le",       jobTitle: "Marketing Intern",         stage: "rejected",  rating: 2.6, email: "anh.le.cand@example.com",      phone: "+84 99 000 1122", notes: "Went with a candidate with more relevant coursework." },
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

/* ── Leave requests (Sample Data plan, Phase 3) ──────────────────────────
 * A spread of historical (already-reviewed) requests, one ongoing approved
 * parental-leave block per currently-on-leave employee (explains the
 * attendance streak Phase 2 already seeded for them), and a handful of
 * fresh pending requests so the approval queue isn't empty on first login.
 *
 * Approved requests replicate leaveRequestController.js's onApprove hook
 * exactly (upsert matching Attendance "on-leave" records for each weekday
 * in range) — reusing that effect means Attendance and Leave Requests
 * agree with each other for every employee seeded here, closing the gap
 * Phase 2 left for its randomly-seeded on-leave days.
 */

function nextWeekdayOnOrAfter(date) {
  let d = new Date(date);
  while (isWeekendUtc(d)) d = addUtcDays(d, 1);
  return d;
}

function endDateForWorkingDays(startDate, workingDays) {
  let cur = new Date(startDate);
  let count = 0;
  let last = new Date(startDate);
  while (count < workingDays) {
    if (!isWeekendUtc(cur)) {
      count += 1;
      last = new Date(cur);
    }
    if (count < workingDays) cur = addUtcDays(cur, 1);
  }
  return last;
}

// Mirrors leaveRequestController.js's onApprove hook exactly (same upsert,
// same weekday-only loop) so approved requests seeded here actually show
// up as "on-leave" on the Attendance page too, not just on Leave Requests.
async function syncApprovedLeaveToAttendance(employeeId, startDate, endDate) {
  let cur = new Date(startDate);
  const last = new Date(endDate);
  while (cur <= last) {
    if (!isWeekendUtc(cur)) {
      const date = new Date(cur);
      await AttendanceModel.findOneAndUpdate(
        { employee: employeeId, date },
        { status: "on-leave", checkIn: null, checkOut: null },
        { upsert: true, setDefaultsOnInsert: true },
      );
    }
    cur = addUtcDays(cur, 1);
  }
}

// Fixed literal dates — idempotent on re-run by construction (same
// employee/type/startDate every time).
const HISTORICAL_LEAVE_REQUESTS = [
  { employeeId: "EMP002", type: "annual",      startKey: "2025-11-10", workingDays: 3, status: "approved", reason: "Family trip to visit parents" },
  { employeeId: "EMP003", type: "sick",        startKey: "2026-03-02", workingDays: 2, status: "approved", reason: "Recovering from flu" },
  { employeeId: "EMP004", type: "unpaid",      startKey: "2025-12-15", workingDays: 2, status: "approved", reason: "Personal errands" },
  { employeeId: "EMP006", type: "annual",      startKey: "2026-01-20", workingDays: 2, status: "approved", reason: "Long weekend trip" },
  { employeeId: "EMP006", type: "sick",        startKey: "2026-05-11", workingDays: 1, status: "approved", reason: "Down with a cold" },
  { employeeId: "EMP009", type: "annual",      startKey: "2025-10-13", workingDays: 4, status: "approved", reason: "Family vacation" },
  { employeeId: "EMP010", type: "sick",        startKey: "2026-02-09", workingDays: 2, status: "approved", reason: "Medical appointment recovery" },
  { employeeId: "EMP010", type: "annual",      startKey: "2026-06-08", workingDays: 3, status: "approved", reason: "Summer trip" },
  { employeeId: "EMP012", type: "bereavement", startKey: "2025-09-22", workingDays: 2, status: "approved", reason: "Family bereavement" },
  { employeeId: "EMP013", type: "sick",        startKey: "2026-04-06", workingDays: 1, status: "approved", reason: "Feeling unwell" },
  { employeeId: "EMP014", type: "annual",      startKey: "2026-03-16", workingDays: 3, status: "approved", reason: "Personal travel" },
  { employeeId: "EMP014", type: "unpaid",      startKey: "2026-07-06", workingDays: 2, status: "rejected", reason: "Personal time off request", reviewNote: "Critical sprint deadline during this window — please choose alternate dates." },
  { employeeId: "EMP015", type: "annual",      startKey: "2025-12-01", workingDays: 2, status: "approved", reason: "Personal time off" },
  { employeeId: "EMP016", type: "sick",        startKey: "2026-01-27", workingDays: 3, status: "approved", reason: "Recovering from illness" },
  { employeeId: "EMP018", type: "annual",      startKey: "2026-05-18", workingDays: 2, status: "rejected", reason: "Family trip", reviewNote: "Campaign launch week — please resubmit for after May 25." },
  { employeeId: "EMP022", type: "annual",      startKey: "2025-11-24", workingDays: 3, status: "approved", reason: "Family gathering" },
  { employeeId: "EMP024", type: "sick",        startKey: "2026-02-23", workingDays: 1, status: "approved", reason: "Medical checkup" },
  { employeeId: "EMP025", type: "unpaid",      startKey: "2026-04-20", workingDays: 2, status: "approved", reason: "Personal matters" },
  { employeeId: "EMP025", type: "annual",      startKey: "2026-07-13", workingDays: 3, status: "approved", reason: "Family trip" },
  { employeeId: "EMP027", type: "annual",      startKey: "2025-10-27", workingDays: 2, status: "approved", reason: "Weekend getaway extension" },
  { employeeId: "EMP029", type: "sick",        startKey: "2026-03-23", workingDays: 2, status: "rejected", reason: "Feeling unwell", reviewNote: "Please provide a doctor's note for sick leave over 1 day, per policy — resubmit with documentation." },
  { employeeId: "EMP030", type: "annual",      startKey: "2026-06-22", workingDays: 4, status: "approved", reason: "Family vacation" },
  { employeeId: "EMP033", type: "annual",      startKey: "2026-03-09", workingDays: 2, status: "approved", reason: "Personal time off" }, // terminated later — safely before TERMINATED_CUTOFF_KEY
];

// The three currently on-leave employees (Employee.status "on-leave",
// Phase 2's ON_LEAVE_STREAK_EMPLOYEE_IDS) get one big ongoing *parental*
// leave request each instead of several short ones — parental's 90-day
// allowance comfortably covers the ~33 business days their Phase 2
// attendance streak already spans (12 bulk-tail days + the full 20-day
// recent slice + today), and a single long block is a more realistic
// reason for that shape of absence than several short annual/sick
// requests stacked back to back would be.
const ONGOING_PARENTAL_LEAVE_EMPLOYEE_IDS = ["EMP008", "EMP019", "EMP032"];

// Relative to "now" at run time — recomputed fresh on every run, so these
// stay "a few days ago" / "a couple weeks out" regardless of when this
// script actually runs.
const PENDING_LEAVE_REQUESTS = [
  { employeeId: "EMP001", type: "annual", appliedDaysAgo: 2, startDaysFromNow: 10, workingDays: 3, reason: "Family trip" },
  { employeeId: "EMP005", type: "annual", appliedDaysAgo: 1, startDaysFromNow: 14, workingDays: 2, reason: "Long weekend" },
  { employeeId: "EMP011", type: "sick",   appliedDaysAgo: 1, startDaysFromNow: 1,  workingDays: 2, reason: "Feeling unwell, need a couple days to recover" },
  { employeeId: "EMP017", type: "annual", appliedDaysAgo: 3, startDaysFromNow: 21, workingDays: 4, reason: "Personal travel" },
  { employeeId: "EMP021", type: "unpaid", appliedDaysAgo: 4, startDaysFromNow: 5,  workingDays: 2, reason: "Personal matters" },
  { employeeId: "EMP023", type: "annual", appliedDaysAgo: 2, startDaysFromNow: 10, workingDays: 2, reason: "Family visit" },
  { employeeId: "EMP026", type: "sick",   appliedDaysAgo: 1, startDaysFromNow: 1,  workingDays: 1, reason: "Doctor's appointment" },
  { employeeId: "EMP031", type: "annual", appliedDaysAgo: 5, startDaysFromNow: 18, workingDays: 3, reason: "Trip with family" },
  { employeeId: "EMP034", type: "annual", appliedDaysAgo: 2, startDaysFromNow: 9,  workingDays: 2, reason: "Personal time off" },
  { employeeId: "EMP007", type: "unpaid", appliedDaysAgo: 3, startDaysFromNow: 6,  workingDays: 2, reason: "Personal errands" },
];

async function seedLeaveRequests(employees) {
  const byId = new Map(employees.map((e) => [e.employeeId, e]));
  const hrUser = await UserModel.findOne({ email: "hr@hrms.com" });
  const now = new Date();
  const todayUtc = utcMidnight(toDateKeyUtc(now));

  let created = 0;
  let skipped = 0;

  // dedupeQuery is caller-supplied rather than always {employee, startDate,
  // type}: the pending/parental blocks compute startDate relative to "now"
  // at run time, so a literal-date dedupe key would never match across two
  // runs on different days and would insert a duplicate on every re-run.
  // Deduping on {employee, type, status} instead for those keeps the
  // script safe to re-run regardless of when it's next invoked.
  async function upsertRequest({ employeeId, type, startDate, endDate, status, reason, reviewNote, appliedAt, dedupeQuery }) {
    const emp = byId.get(employeeId);
    if (!emp) { skipped += 1; return; }
    if (emp.createdAt && startDate < emp.createdAt) { skipped += 1; return; }
    if (employeeId === "EMP033" && toDateKeyUtc(startDate) >= TERMINATED_CUTOFF_KEY) { skipped += 1; return; }

    const exists = await LeaveRequestModel.findOne({ employee: emp._id, ...dedupeQuery });
    if (exists) return;

    const days = countWorkingDays(startDate, endDate);
    const doc = {
      employee: emp._id,
      requestedBy: emp.userId ?? null,
      startDate,
      endDate,
      days,
      type,
      reason: reason ?? "",
      appliedAt,
      status,
    };
    if (status !== "pending") {
      doc.reviewedBy = hrUser?._id ?? null;
      doc.reviewedAt = addUtcDays(appliedAt, 2);
      doc.reviewNote = reviewNote ?? "";
    }

    await LeaveRequestModel.create(doc);
    created += 1;

    if (status === "approved") {
      await syncApprovedLeaveToAttendance(emp._id, startDate, endDate);
    }
  }

  for (const spec of HISTORICAL_LEAVE_REQUESTS) {
    const startDate = nextWeekdayOnOrAfter(utcMidnight(spec.startKey));
    const endDate = endDateForWorkingDays(startDate, spec.workingDays);
    await upsertRequest({
      employeeId: spec.employeeId,
      type: spec.type,
      startDate,
      endDate,
      status: spec.status,
      reason: spec.reason,
      reviewNote: spec.reviewNote,
      appliedAt: addUtcDays(startDate, -5),
      dedupeQuery: { startDate, type: spec.type },
    });
  }

  const parentalStart = nextWeekdayOnOrAfter(addUtcDays(todayUtc, -40));
  const parentalEnd = addUtcDays(todayUtc, 10);
  for (const employeeId of ONGOING_PARENTAL_LEAVE_EMPLOYEE_IDS) {
    await upsertRequest({
      employeeId,
      type: "parental",
      startDate: parentalStart,
      endDate: parentalEnd,
      status: "approved",
      reason: "Parental leave for a new child",
      appliedAt: addUtcDays(parentalStart, -10),
      dedupeQuery: { type: "parental", status: "approved" },
    });
  }

  for (const spec of PENDING_LEAVE_REQUESTS) {
    const appliedAt = addUtcDays(todayUtc, -spec.appliedDaysAgo);
    const startDate = nextWeekdayOnOrAfter(addUtcDays(todayUtc, spec.startDaysFromNow));
    const endDate = endDateForWorkingDays(startDate, spec.workingDays);
    await upsertRequest({
      employeeId: spec.employeeId,
      type: spec.type,
      startDate,
      endDate,
      status: "pending",
      reason: spec.reason,
      appliedAt,
      dedupeQuery: { status: "pending" },
    });
  }

  console.log(`✓ Seeded ${created} leave requests` + (skipped ? ` (skipped ${skipped})` : ""));
}

/* ── Payroll history (Sample Data plan, Phase 4) ─────────────────────────
 * Walks the real payroll jobs forward across the trailing 12 months so
 * periods land in believable, varied states instead of an empty Payroll
 * page. Every number here — FX rate, BHXH/BHYT/BHTN, deductions — comes
 * from the actual payroll engine (utils/payrollEngine.js via
 * utils/payrollGeneration.js), not hand-typed figures, since Phase 2/3
 * already seeded real attendance and leave data for these jobs to read.
 *
 * generateMonthlyPayrollDraft({asOf}) drafts the month asOf falls in.
 * runMonthlyPayroll({asOf}) always targets *asOf's previous month* (it
 * mirrors the real 10th-of-month cron, which pays out last month's
 * period) and — important — always drives a period straight through to
 * "paid" in one call; it has no "stop at approved" mode. So the one
 * period we want left at "approved" (not yet paid) is moved there with a
 * direct, minimal field update instead, mirroring exactly what
 * payrollController.js's setPeriodStatus does for that same transition
 * (set status/approvedBy/approvedAt, log it) — that handler is
 * Express-only (needs a real req/res), so replicating its few lines
 * directly here is simpler and more transparent than mocking one.
 *
 * Newest month → left as "draft" (freshly generated, awaiting HR review —
 * matches a real deploy, where the draft job runs at the start of the
 * month and the pay run doesn't happen until the 10th of the next one).
 * Second-newest → "approved" only. Everything older → fully "paid".
 */
async function seedPayrollHistory() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1–12

  // Trailing 12 months ending at the current one, oldest first. Built via
  // Date's own month-overflow normalization (new Date(y, -4, 1) rolls back
  // into the previous year correctly) rather than hand-rolled carry logic.
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(currentYear, currentMonth - 1 - i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }

  const adminUser = await UserModel.findOne({ email: "admin@hrms.com" });
  const label = (y, m) => `${y}-${String(m).padStart(2, "0")}`;

  for (let idx = 0; idx < months.length; idx++) {
    const { year, month } = months[idx];
    const isCurrentMonth = idx === months.length - 1;
    const isPreviousMonth = idx === months.length - 2;

    const draftResult = await generateMonthlyPayrollDraft({ asOf: new Date(year, month - 1, 1) });
    console.log(`✓ Drafted ${label(year, month)}:`, JSON.stringify(draftResult));

    if (isCurrentMonth) continue; // leave as draft

    if (isPreviousMonth) {
      const period = await PayrollPeriodModel.findOne({ year, month });
      if (period && period.status === "draft") {
        const payslipCount = await PayslipModel.countDocuments({ period: period._id });
        if (payslipCount > 0) {
          period.status = "approved";
          period.approvedBy = adminUser?._id ?? null;
          period.approvedAt = new Date();
          await period.save();
          await logAction(
            {},
            {
              action: "status_changed",
              resource: "payroll",
              resourceId: period._id,
              label: `Payroll ${label(year, month)} — draft to approved`,
            },
          );
          console.log(`✓ Approved ${label(year, month)} (${payslipCount} payslips) — held here, not yet paid`);
        }
      }
      continue;
    }

    // asOf = the 1st of the *following* month, since runMonthlyPayroll
    // always targets "asOf's previous month". (year, month) here is
    // already 1-indexed, so new Date(year, month, 1) — no "-1" — lands
    // exactly on next month's 1st in JS's 0-indexed Date constructor.
    const payRunResult = await runMonthlyPayroll({ asOf: new Date(year, month, 1) });
    console.log(`✓ Paid ${label(year, month)}:`, JSON.stringify(payRunResult));
  }
}

/* ── Promotion eligibility (Sample Data plan, Phase 5) ────────────────────
 * Calls the real checkPromotionEligibility job once — Phase 1 already
 * planted two employees (EMP010, EMP013) with levelStartDate safely past
 * their tenure threshold specifically so this job has genuine candidates
 * to flag, rather than fabricating PromotionRequest documents directly.
 * Every other active employee was deliberately kept under threshold, so
 * only those two should come out of this.
 *
 * Two more are added by hand afterward — one approved, one rejected — for
 * full status coverage. HR-initiated promotions don't require the tenure
 * threshold the auto-check enforces, so these represent the "manager
 * proposes early based on performance" path instead, not a second flavor
 * of the same auto-flagging logic.
 */
async function seedPromotionRequests(employees) {
  const byId = new Map(employees.map((e) => [e.employeeId, e]));

  const eligibilityResult = await checkPromotionEligibility({ asOf: new Date() });
  console.log("✓ Ran checkPromotionEligibility:", JSON.stringify(eligibilityResult));

  const hrUser = await UserModel.findOne({ email: "hr@hrms.com" });
  const adminUser = await UserModel.findOne({ email: "admin@hrms.com" });

  async function upsertManualProposal({ employeeId, proposedPositionLevel, proposedAnnualSalary, reason, status, reviewNote }) {
    const emp = byId.get(employeeId);
    if (!emp) return;

    const exists = await PromotionRequestModel.findOne({
      employee: emp._id,
      systemGenerated: false,
      proposedPositionLevel,
    });
    if (exists) return;

    const dept = emp.department ? await DepartmentModel.findById(emp.department) : null;
    const appliedAt = addUtcDays(utcMidnight(toDateKeyUtc(new Date())), -14);

    const doc = {
      employee: emp._id,
      requestedBy: hrUser?._id ?? null,
      systemGenerated: false,
      status,
      currentDesignation: emp.designation ?? null,
      currentDepartmentName: dept?.name ?? null,
      currentAnnualSalary: emp.annualSalary ?? 0,
      currentPositionLevel: emp.positionLevel ?? null,
      proposedPositionLevel,
      proposedAnnualSalary,
      reason,
      appliedAt,
    };
    if (status !== "pending") {
      doc.reviewedBy = adminUser?._id ?? null;
      doc.reviewedAt = addUtcDays(appliedAt, 4);
      doc.reviewNote = reviewNote ?? "";
    }

    await PromotionRequestModel.create(doc);

    if (status === "approved") {
      // Mirrors promotionRequestController.js's onApprove hook: apply the
      // proposed level/salary to the employee and restart their tenure
      // clock, exactly as approving this through the real UI would.
      await EmployeeModel.findByIdAndUpdate(emp._id, {
        positionLevel: proposedPositionLevel,
        annualSalary: proposedAnnualSalary,
        levelStartDate: new Date(),
      });
    }
  }

  await upsertManualProposal({
    employeeId: "EMP029",
    proposedPositionLevel: "Manager",
    proposedAnnualSalary: 130000,
    reason: "Strong performance this year and consistent ownership of the Sales team's largest accounts — proposing an early promotion to Manager.",
    status: "approved",
    reviewNote: "Agreed — well-earned. Approved ahead of the usual tenure schedule.",
  });

  await upsertManualProposal({
    employeeId: "EMP018",
    proposedPositionLevel: "Senior",
    proposedAnnualSalary: 90000,
    reason: "Requesting consideration for Senior given recent campaign ownership.",
    status: "rejected",
    reviewNote: "Not quite yet — revisit in 6 months once the current campaign cycle wraps and results are in.",
  });

  console.log("✓ Seeded 2 manually-proposed promotion requests (1 approved, 1 rejected)");
}

/* ── Profile edit requests (Sample Data plan, Phase 6) ────────────────────
 * One pending, one approved, one rejected, for the Admin "Edit requests"
 * tab. The approved one replicates profileEditRequestController.js's
 * onApprove hook exactly (apply the diff's "to" values to the Employee
 * record), so it actually changes the employee's data, not just its own
 * status — and each "from" value is read off the employee's real current
 * field at seed time, not hand-typed, so the diff is never stale.
 */
const PROFILE_EDIT_CLIENT_TO_DB = { name: "name", phone: "phone", address: "address", age: "age", sex: "gender" };

const PROFILE_EDIT_REQUESTS = [
  {
    employeeId: "EMP012",
    status: "pending",
    daysAgo: 2,
    changes: { address: "45 Le Van Sy, Ho Chi Minh City", phone: "+84 90 555 2231" },
  },
  {
    employeeId: "EMP021",
    status: "approved",
    daysAgo: 20,
    changes: { phone: "+84 91 777 4410" },
  },
  {
    employeeId: "EMP006",
    status: "rejected",
    daysAgo: 15,
    changes: { name: "Sarah Lee-Nguyen" },
    reviewNote: "Please submit an updated legal ID or marriage certificate to HR before we can process a legal name change.",
  },
];

async function seedProfileEditRequests(employees) {
  const byId = new Map(employees.map((e) => [e.employeeId, e]));
  const hrUser = await UserModel.findOne({ email: "hr@hrms.com" });
  const todayUtc = utcMidnight(toDateKeyUtc(new Date()));

  let created = 0;
  for (const spec of PROFILE_EDIT_REQUESTS) {
    const emp = byId.get(spec.employeeId);
    if (!emp) continue;

    const exists = await ProfileEditRequestModel.findOne({ employee: emp._id });
    if (exists) continue;

    const changes = {};
    for (const [field, to] of Object.entries(spec.changes)) {
      const dbField = PROFILE_EDIT_CLIENT_TO_DB[field] ?? field;
      changes[field] = { from: emp[dbField] ?? null, to };
    }

    const appliedAt = addUtcDays(todayUtc, -spec.daysAgo);
    const doc = {
      employee: emp._id,
      requestedBy: emp.userId ?? null,
      changes,
      status: spec.status,
      createdAt: appliedAt,
    };
    if (spec.status !== "pending") {
      doc.reviewedBy = hrUser?._id ?? null;
      doc.reviewedAt = addUtcDays(appliedAt, 2);
      doc.reviewNote = spec.reviewNote ?? "";
    }

    await ProfileEditRequestModel.create(doc);
    created += 1;

    if (spec.status === "approved") {
      const updates = {};
      for (const [field, { to }] of Object.entries(changes)) {
        const dbField = PROFILE_EDIT_CLIENT_TO_DB[field] ?? field;
        updates[dbField] = field === "age" ? Number(to) || undefined : to;
      }
      await EmployeeModel.findByIdAndUpdate(emp._id, updates);
    }
  }

  console.log(`✓ Seeded ${created} profile edit requests`);
}

/* ── Performance reviews + appeals (Sample Data plan, Phase 7) ────────────
 * Cycles come from the real ensureStandardCycles() (utils/performanceCycles.js)
 * — it self-manages a rolling window of half-year cycles (2 closed, 1 open)
 * dated off "now", the same way listCycles/loadCycleOrThrow already trigger
 * it in production. No cycle dates are hand-typed here.
 *
 * Reviews are written as one $set per employee rather than replaying the
 * real submitSelf/submitManager/setCompetency/addGoal call sequence one
 * HTTP call at a time — slower for no benefit here, since the schema has
 * no cross-field validation that sequence would exercise differently.
 * managerReviewedBy follows the same authorization rule the real
 * performanceScope.js enforces: only Engineering has an actual
 * role:"MANAGER" user (MGR002), so every other department is "orphan" and
 * HR is who'd really be allowed to submit those manager reviews.
 */

const PERFORMANCE_TIER = {
  EMP009: "star", EMP015: "star", EMP022: "star", EMP030: "star",
  EMP017: "developing", EMP026: "developing",
};

const GOAL_POOL = [
  "Complete a relevant certification this cycle",
  "Mentor a junior team member",
  "Improve documentation for core workflows",
  "Take ownership of a process improvement initiative",
  "Strengthen cross-team collaboration",
  "Present at the next team sync or all-hands",
  "Improve consistency in meeting deadlines",
  "Deepen expertise in a core tool or domain area",
  "Support onboarding for new team members",
  "Contribute more to quarterly planning discussions",
  "Take on a stretch project outside the usual scope",
  "Improve response time on assigned tasks",
];

const COMPETENCY_COMMENTS = {
  low: ["An area to focus on this cycle.", "Room to grow here.", "Needs more consistency."],
  mid: ["Solid and reliable.", "Meets expectations consistently.", "Steady performance here."],
  high: ["A real strength.", "Consistently strong in this area.", "Stands out here."],
};

function randomInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}
function pickOne(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function clampRating(n) {
  return Math.max(1, Math.min(5, Math.round(n)));
}
function competencyComment(rating) {
  const tier = rating <= 2 ? "low" : rating === 3 ? "mid" : "high";
  return pickOne(COMPETENCY_COMMENTS[tier]);
}
function tierSelfBase(employeeId) {
  const tier = PERFORMANCE_TIER[employeeId] ?? "solid";
  if (tier === "star") return 5;
  if (tier === "developing") return 2;
  return randomInt(3, 4);
}
function buildCompetencies(selfBase, managerBase) {
  const out = {};
  for (const key of ["communication", "execution", "ownership", "collaboration", "leadership", "problemSolving"]) {
    const self = clampRating(selfBase + randomInt(-1, 1));
    const manager = clampRating(managerBase + randomInt(-1, 1));
    out[key] = { self, selfComment: competencyComment(self), manager, managerComment: competencyComment(manager) };
  }
  return out;
}
function buildGoals(count, createdBy) {
  const pool = [...GOAL_POOL];
  const goals = [];
  for (let i = 0; i < count && pool.length; i += 1) {
    const idx = Math.floor(Math.random() * pool.length);
    const [text] = pool.splice(idx, 1);
    goals.push({ text, progress: pickOne([20, 30, 40, 50, 60, 70, 80, 90, 100]), createdBy });
  }
  return goals;
}

// EMP008/019/032 (on-leave), EMP033 (terminated), EMP028 (chronic no-show,
// consistent with their disengaged pattern elsewhere), EMP020 (hired too
// recently to have been part of the closed cycle) are deliberately excluded.
const CLOSED_CYCLE_ROSTER = [
  "ADM001", "MGR001", "MGR002",
  "EMP001", "EMP002", "EMP003", "EMP004", "EMP005", "EMP006", "EMP007",
  "EMP009", "EMP010", "EMP011", "EMP012", "EMP013", "EMP014", "EMP015", "EMP016", "EMP017", "EMP018",
  "EMP021", "EMP022", "EMP023", "EMP024", "EMP025", "EMP026", "EMP027",
  "EMP029", "EMP030", "EMP031", "EMP034",
];

const PEER_FEEDBACK_ROSTER = new Set(["EMP009", "EMP015", "EMP022", "EMP030", "EMP002", "EMP023"]);
const RESOLVED_APPEAL_EMPLOYEE_ID = "EMP025";

async function seedPerformanceReviews(employees) {
  const byId = new Map(employees.map((e) => [e.employeeId, e]));
  const hrUser = await UserModel.findOne({ email: "hr@hrms.com" });
  const adminUser = await UserModel.findOne({ email: "admin@hrms.com" });
  const engManagerUser = await UserModel.findOne({ email: "manager@hrms.com" });

  async function managerReviewerForDept(emp) {
    if (!emp.department) return hrUser?._id ?? null;
    const dept = await DepartmentModel.findById(emp.department, "name");
    return dept?.name === "Engineering" ? (engManagerUser?._id ?? hrUser?._id) : (hrUser?._id ?? null);
  }

  const cycles = await ensureStandardCycles();
  const closedCycle = cycles[cycles.length - 2];
  const openCycle = cycles[cycles.length - 1];
  console.log(
    "✓ Ensured standard cycles:",
    cycles.map((c) => `${c.key} (${c.defaultStatus})`).join(", "),
  );

  const now = new Date();
  const cycleAgeDays = Math.max(1, Math.floor((now - new Date(openCycle.start)) / 86400000));
  const safeDaysAgo = (n) => addUtcDays(utcMidnight(toDateKeyUtc(now)), -Math.min(n, cycleAgeDays - 1 || 1));

  let closedCount = 0;
  for (const employeeId of CLOSED_CYCLE_ROSTER) {
    const emp = byId.get(employeeId);
    if (!emp) continue;

    const exists = await PerformanceReviewModel.findOne({ cycleKey: closedCycle.key, employee: emp._id });
    if (exists) continue;

    const selfBase = tierSelfBase(employeeId);
    const managerBase = clampRating(selfBase + randomInt(-1, 1));
    const managerReviewedBy = await managerReviewerForDept(emp);

    const selfSubmittedDate = new Date(new Date(closedCycle.end).getTime() - 20 * 86400000);
    const managerSubmittedDate = new Date(new Date(closedCycle.end).getTime() - 10 * 86400000);

    const doc = {
      cycleKey: closedCycle.key,
      employee: emp._id,
      selfRating: selfBase,
      selfComments: "Reflecting on this cycle, I focused on delivering consistently and supporting the team where I could.",
      selfSubmittedDate,
      managerRating: managerBase,
      managerComments: "Good cycle overall — see competency notes for specific areas of strength and focus.",
      managerSubmittedDate,
      managerReviewedBy,
      competencies: buildCompetencies(selfBase, managerBase),
      goals: buildGoals(randomInt(1, 3), emp.userId ?? null),
      peerFeedback: PEER_FEEDBACK_ROSTER.has(employeeId)
        ? [{ name: "A teammate", relation: "Peer", comments: "Reliable and easy to work with — always follows through.", addedBy: hrUser?._id ?? null, addedAt: managerSubmittedDate }]
        : [],
      appeal: null,
    };

    if (employeeId === RESOLVED_APPEAL_EMPLOYEE_ID) {
      const adjustedRating = clampRating(managerBase + 1);
      doc.managerRating = adjustedRating; // reflects the post-resolution value, same as the real resolveAppeal effect
      doc.appeal = {
        reasonCategory: "rating_low",
        detail: "I believe this cycle's rating doesn't reflect the scope of work I took on, particularly the finance close automation project.",
        status: "Resolved",
        filedDate: new Date(managerSubmittedDate.getTime() + 3 * 86400000),
        filedBy: emp.userId ?? null,
        resolution: "Adjusted",
        resolvedRating: adjustedRating,
        resolverNote: "Agreed the automation work wasn't fully reflected — adjusted up by one point.",
        resolvedBy: adminUser?._id ?? null,
        resolvedDate: new Date(managerSubmittedDate.getTime() + 9 * 86400000),
      };
    }

    await PerformanceReviewModel.findOneAndUpdate(
      { cycleKey: closedCycle.key, employee: emp._id },
      { $set: doc },
      { upsert: true, setDefaultsOnInsert: true },
    );
    closedCount += 1;
  }
  console.log(`✓ Seeded ${closedCount} completed reviews for ${closedCycle.key} (closed)`);

  // Open cycle: a deliberate mid-cycle mix, not full coverage — most of the
  // roster genuinely hasn't started yet, which is realistic and needs no
  // seeding (no review doc at all = "Not started").
  const selfOnly = ["EMP002", "EMP011", "EMP024", "EMP031"];
  const managerOnly = ["EMP016"];
  const completed = ["EMP015", "EMP022", "EMP030"];
  const completedWithPendingAppeal = "EMP009";

  let openCount = 0;
  for (const employeeId of selfOnly) {
    const emp = byId.get(employeeId);
    if (!emp) continue;
    const exists = await PerformanceReviewModel.findOne({ cycleKey: openCycle.key, employee: emp._id });
    if (exists) continue;
    const selfBase = tierSelfBase(employeeId);
    await PerformanceReviewModel.findOneAndUpdate(
      { cycleKey: openCycle.key, employee: emp._id },
      {
        $set: {
          cycleKey: openCycle.key,
          employee: emp._id,
          selfRating: selfBase,
          selfComments: "Submitting my self-review for this cycle — looking forward to the discussion.",
          selfSubmittedDate: safeDaysAgo(randomInt(3, 10)),
          competencies: buildCompetencies(selfBase, selfBase),
        },
      },
      { upsert: true, setDefaultsOnInsert: true },
    );
    openCount += 1;
  }

  for (const employeeId of managerOnly) {
    const emp = byId.get(employeeId);
    if (!emp) continue;
    const exists = await PerformanceReviewModel.findOne({ cycleKey: openCycle.key, employee: emp._id });
    if (exists) continue;
    const managerBase = tierSelfBase(employeeId);
    const managerReviewedBy = await managerReviewerForDept(emp);
    await PerformanceReviewModel.findOneAndUpdate(
      { cycleKey: openCycle.key, employee: emp._id },
      {
        $set: {
          cycleKey: openCycle.key,
          employee: emp._id,
          managerRating: managerBase,
          managerComments: "Getting an early read in before the self-review is in — will revisit once it's submitted.",
          managerSubmittedDate: safeDaysAgo(randomInt(3, 10)),
          managerReviewedBy,
          competencies: buildCompetencies(managerBase, managerBase),
        },
      },
      { upsert: true, setDefaultsOnInsert: true },
    );
    openCount += 1;
  }

  for (const employeeId of [...completed, completedWithPendingAppeal]) {
    const emp = byId.get(employeeId);
    if (!emp) continue;
    const exists = await PerformanceReviewModel.findOne({ cycleKey: openCycle.key, employee: emp._id });
    if (exists) continue;

    const selfBase = tierSelfBase(employeeId);
    const managerBase = clampRating(selfBase + randomInt(-1, 1));
    const managerReviewedBy = await managerReviewerForDept(emp);
    const isPendingAppealCase = employeeId === completedWithPendingAppeal;

    const selfSubmittedDate = safeDaysAgo(isPendingAppealCase ? 8 : randomInt(18, 25));
    const managerSubmittedDate = safeDaysAgo(isPendingAppealCase ? 5 : randomInt(10, 17));

    const doc = {
      cycleKey: openCycle.key,
      employee: emp._id,
      selfRating: selfBase,
      selfComments: "Submitting my self-review for this cycle.",
      selfSubmittedDate,
      managerRating: managerBase,
      managerComments: "Review complete — see competency notes below.",
      managerSubmittedDate,
      managerReviewedBy,
      competencies: buildCompetencies(selfBase, managerBase),
      goals: buildGoals(randomInt(1, 2), emp.userId ?? null),
    };

    if (isPendingAppealCase) {
      doc.appeal = {
        reasonCategory: "inaccurate",
        detail: "A couple of the shipped features from this cycle aren't reflected in the competency notes — would like this reviewed.",
        status: "Pending",
        filedDate: safeDaysAgo(2),
        filedBy: emp.userId ?? null,
      };
    }

    await PerformanceReviewModel.findOneAndUpdate(
      { cycleKey: openCycle.key, employee: emp._id },
      { $set: doc },
      { upsert: true, setDefaultsOnInsert: true },
    );
    openCount += 1;
  }

  console.log(`✓ Seeded ${openCount} in-progress reviews for ${openCycle.key} (open)`);
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

/* ── Targeted notifications (Sample Data plan, Phase 8) ───────────────────
 * Writing directly to Mongoose in Phases 3/5/6/7 skipped the real
 * controllers' own NotificationModel.create() side effects entirely (no
 * HTTP request ever happened, so those never fired) — this backfills a
 * representative sample of them, matching the exact copy/titleKey shape
 * each real controller already uses (leaveRequestController.js,
 * promotionRequestController.js, profileEditRequestController.js,
 * performanceController.js). Dates are read back from the records
 * themselves rather than re-typed, so they can't drift out of sync with
 * what was actually seeded. Older (already-acted-on) ones are marked
 * read; the two freshest performance/leave items are left unread.
 */
async function seedTargetedNotifications(employees) {
  const byId = new Map(employees.map((e) => [e.employeeId, e]));
  const hrUser = await UserModel.findOne({ email: "hr@hrms.com" });

  let created = 0;

  async function notifyEmployeeUser(employeeId, payload) {
    const emp = byId.get(employeeId);
    if (!emp?.userId) return;
    const exists = await NotificationModel.findOne({ user: emp.userId, title: payload.title, message: payload.message });
    if (exists) return;
    await NotificationModel.create({ user: emp.userId, ...payload });
    created += 1;
  }

  async function notifyHrUser(payload) {
    if (!hrUser) return;
    const exists = await NotificationModel.findOne({ user: hrUser._id, title: payload.title, message: payload.message });
    if (exists) return;
    await NotificationModel.create({ user: hrUser._id, ...payload });
    created += 1;
  }

  // Leave request outcomes — mirrors leaveRequestController.js's notifyEmployee.
  const leaveOutcomeEmployees = [
    { employeeId: "EMP014", type: "unpaid" },
    { employeeId: "EMP018", type: "annual" },
    { employeeId: "EMP029", type: "sick" },
    { employeeId: "EMP009", type: "annual" },
    { employeeId: "EMP015", type: "annual" },
  ];
  for (const { employeeId, type } of leaveOutcomeEmployees) {
    const emp = byId.get(employeeId);
    if (!emp) continue;
    const request = await LeaveRequestModel.findOne({ employee: emp._id, type, status: { $ne: "pending" } });
    if (!request) continue;

    const dateKey = (d) => toDateKeyUtc(new Date(d));
    if (request.status === "approved") {
      await notifyEmployeeUser(employeeId, {
        category: "leave",
        title: "Leave request approved",
        message: `Your ${request.type} leave from ${dateKey(request.startDate)} to ${dateKey(request.endDate)} has been approved.`,
        titleKey: "leaveApproved",
        messageKey: "leaveApproved",
        params: { leaveType: request.type, startDate: request.startDate, endDate: request.endDate },
        link: "/dashboard",
        linkLabel: "View leave balance",
        read: true,
        createdAt: request.reviewedAt,
      });
    } else {
      await notifyEmployeeUser(employeeId, {
        category: "leave",
        title: "Leave request rejected",
        message: `Your leave request was rejected.${request.reviewNote ? ` Note: ${request.reviewNote}` : ""}`,
        titleKey: "leaveRejected",
        messageKey: request.reviewNote ? "leaveRejectedWithNote" : "leaveRejected",
        params: request.reviewNote ? { note: request.reviewNote } : undefined,
        link: "/dashboard",
        linkLabel: "View leave balance",
        read: true,
        createdAt: request.reviewedAt,
      });
    }
  }

  // Profile edit outcomes — mirrors profileEditRequestController.js's notifyEmployee.
  for (const employeeId of ["EMP021", "EMP006"]) {
    const emp = byId.get(employeeId);
    if (!emp) continue;
    const request = await ProfileEditRequestModel.findOne({ employee: emp._id, status: { $ne: "pending" } });
    if (!request) continue;

    if (request.status === "approved") {
      await notifyEmployeeUser(employeeId, {
        category: "employee",
        title: "Profile update approved",
        message: "Your profile edit request has been approved and your information has been updated.",
        titleKey: "profileUpdateApproved",
        messageKey: "profileUpdateApproved",
        link: `/employees/${emp._id}`,
        linkLabel: "View profile",
        read: true,
        createdAt: request.reviewedAt,
      });
    } else {
      await notifyEmployeeUser(employeeId, {
        category: "employee",
        title: "Profile update rejected",
        message: `Your profile edit request was rejected.${request.reviewNote ? ` Note: ${request.reviewNote}` : ""}`,
        titleKey: "profileUpdateRejected",
        messageKey: request.reviewNote ? "profileUpdateRejectedWithNote" : "profileUpdateRejected",
        params: request.reviewNote ? { note: request.reviewNote } : undefined,
        link: `/employees/${emp._id}`,
        linkLabel: "View profile",
        read: true,
        createdAt: request.reviewedAt,
      });
    }
  }

  // Promotion outcomes — mirrors promotionRequestController.js's notifyEmployee.
  for (const employeeId of ["EMP029", "EMP018"]) {
    const emp = byId.get(employeeId);
    if (!emp) continue;
    const request = await PromotionRequestModel.findOne({ employee: emp._id, systemGenerated: false, status: { $ne: "pending" } });
    if (!request) continue;

    if (request.status === "approved") {
      await notifyEmployeeUser(employeeId, {
        category: "employee",
        title: "Promotion approved",
        message: `Your promotion has been approved — new level: ${request.proposedPositionLevel}. Your HR record has been updated.`,
        titleKey: "promotionApproved",
        messageKey: "promotionApprovedLevelOnly",
        params: { newLevel: request.proposedPositionLevel },
        link: `/employees/${emp._id}`,
        linkLabel: "View profile",
        read: true,
        createdAt: request.reviewedAt,
      });
    } else {
      await notifyEmployeeUser(employeeId, {
        category: "employee",
        title: "Promotion request rejected",
        message: `Your promotion request was not approved.${request.reviewNote ? ` Note: ${request.reviewNote}` : ""}`,
        titleKey: "promotionRejected",
        messageKey: request.reviewNote ? "promotionRejectedWithNote" : "promotionRejected",
        params: request.reviewNote ? { note: request.reviewNote } : undefined,
        link: `/employees/${emp._id}`,
        linkLabel: "View profile",
        read: true,
        createdAt: request.reviewedAt,
      });
    }
  }

  // Performance appeal — resolved (to the employee) and filed (to HR) —
  // mirrors performanceController.js's resolveAppeal/fileAppeal notifications.
  const emp025 = byId.get("EMP025");
  if (emp025) {
    const review = await PerformanceReviewModel.findOne({ employee: emp025._id, "appeal.status": "Resolved" });
    if (review?.appeal) {
      await notifyEmployeeUser("EMP025", {
        category: "performance",
        title: "Performance appeal resolved",
        message: `Your appeal was ${review.appeal.resolution.toLowerCase()}.`,
        titleKey: "appealResolved",
        messageKey: "appealResolved",
        params: { resolution: review.appeal.resolution.toLowerCase() },
        link: "/performance",
        linkLabel: "Open review",
        read: true,
        createdAt: review.appeal.resolvedDate,
      });
    }
  }

  const emp009 = byId.get("EMP009");
  if (emp009) {
    const review = await PerformanceReviewModel.findOne({ employee: emp009._id, "appeal.status": "Pending" });
    if (review?.appeal) {
      await notifyHrUser({
        category: "performance",
        title: "Performance appeal filed",
        message: `${emp009.name} appealed their manager rating.`,
        titleKey: "appealFiled",
        messageKey: "appealFiled",
        params: { employeeName: emp009.name },
        link: "/performance",
        linkLabel: "Open review",
        read: false,
        createdAt: review.appeal.filedDate,
      });
    }
  }

  // HR-facing: one still-pending leave request awaiting review — mirrors
  // leaveRequestController.js's create()-time HR notification.
  const emp001 = byId.get("EMP001");
  if (emp001) {
    const pendingLeave = await LeaveRequestModel.findOne({ employee: emp001._id, status: "pending" });
    if (pendingLeave) {
      await notifyHrUser({
        category: "leave",
        title: "New leave request",
        message: `${emp001.name} requested ${pendingLeave.days} ${pendingLeave.type} leave day${pendingLeave.days === 1 ? "" : "s"}.`,
        titleKey: "leaveRequestSubmitted",
        messageKey: "leaveRequestSubmitted",
        params: { employeeName: emp001.name, days: pendingLeave.days, leaveType: pendingLeave.type },
        link: "/holidays",
        linkLabel: "Review request",
        read: false,
        createdAt: pendingLeave.appliedAt,
      });
    }
  }

  console.log(`✓ Seeded ${created} targeted notifications`);
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
  await seedLeaveRequests(employees);
  await seedPayrollHistory();
  await seedPromotionRequests(employees);
  await seedProfileEditRequests(employees);
  await seedPerformanceReviews(employees);
  await seedNotifications();
  await seedTargetedNotifications(employees);

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
