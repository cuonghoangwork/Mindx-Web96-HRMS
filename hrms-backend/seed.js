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
import mongoose from "mongoose";
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
import { annualSalaryRaise } from "./jobs/annualSalaryRaise.js";
import PromotionRequestModel from "./model/PromotionRequest.js";
import OvertimeRequestModel from "./model/OvertimeRequest.js";
import NoShowReviewModel from "./model/NoShowReview.js";
import { resolveDayType, splitDayNight } from "./utils/overtimeRate.js";
import { buildPayslipRows, insertPayslips } from "./utils/payrollGeneration.js";
import { autoDeductionVnd, computePayslip } from "./utils/payrollEngine.js";
import { diffChanges } from "./utils/auditLog.js";
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

/* ── Admin account ── with a linked Employee so "My Profile" resolves. */
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
    // createdAt mirrors startDate: buildPayslipRows selects payable
    // employees by createdAt, so history phases need it backdated too.
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

/* ── HR account (company-wide, DECISIONS.md D12) ── every manager-tier
 * account needs a linked Employee with a department or manager-only
 * actions are locked out. */
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

/* ── MANAGER account ── scoped to Engineering by utils/managerScope.js. */
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

/* ── Tenure for the original 8 ── used as startDate, levelStartDate and
 * createdAt. Non-Managers sit at least a year under their promotion
 * threshold (DECISIONS.md D1) so the queue holds only the deliberate
 * EMP010/EMP013 cases whenever the seed runs. */
const ORIGINAL_ROSTER_TENURE = {
  EMP001: { positionLevel: "Full-time", startDate: "2023-03-06" },
  EMP002: { positionLevel: "Full-time", startDate: "2023-07-03" },
  EMP003: { positionLevel: "Manager",   startDate: "2019-04-01" },
  EMP004: { positionLevel: "Full-time", startDate: "2024-01-08" },
  EMP005: { positionLevel: "Manager",   startDate: "2018-10-01" },
  EMP006: { positionLevel: "Full-time", startDate: "2024-09-02" },
  EMP007: { positionLevel: "Senior",    startDate: "2022-11-07" },
  EMP008: { positionLevel: "Senior",    startDate: "2023-01-16" },
};

/* ── Employees — each gets a linked User account (EMPLOYEE role) ── */
async function seedEmployees(deptByName) {
  // Without a startDate the original 8 read as "not hired yet" to every
  // history phase below.
  const defs = [
    { employeeId: "EMP001", name: "John Doe",      email: "john.doe@hrms.com",      department: "Engineering",  designation: "Software Engineer",  contractType: "full-time", status: "active",    age: 28, gender: "male",   address: "123 Main St, New York, NY",        annualSalary: 85000,  ...ORIGINAL_ROSTER_TENURE.EMP001 },
    { employeeId: "EMP002", name: "Jane Smith",    email: "jane.smith@hrms.com",    department: "Design",       designation: "UI Designer",        contractType: "full-time", status: "active",    age: 32, gender: "female", address: "456 Oak Ave, Los Angeles, CA",     annualSalary: 75000,  ...ORIGINAL_ROSTER_TENURE.EMP002 },
    { employeeId: "EMP003", name: "Bob Johnson",   email: "bob.johnson@hrms.com",   department: "Marketing",    designation: "Marketing Manager",  contractType: "full-time", status: "on-leave",  age: 45, gender: "male",   address: "789 Pine Rd, Chicago, IL",         annualSalary: 95000,  ...ORIGINAL_ROSTER_TENURE.EMP003 },
    { employeeId: "EMP004", name: "Alice Brown",   email: "alice.brown@hrms.com",   department: "Finance",      designation: "HR Specialist",      contractType: "part-time", status: "active",    age: 29, gender: "female", address: "321 Elm St, Houston, TX",          annualSalary: 45000,  ...ORIGINAL_ROSTER_TENURE.EMP004 },
    { employeeId: "EMP005", name: "Mike Wilson",   email: "mike.wilson@hrms.com",   department: "Sales",        designation: "Sales Manager",      contractType: "contract",  status: "active",    age: 38, gender: "male",   address: "654 Maple Dr, Phoenix, AZ",        annualSalary: 80000,  ...ORIGINAL_ROSTER_TENURE.EMP005 },
    { employeeId: "EMP006", name: "Sarah Lee",     email: "sarah.lee@hrms.com",     department: "IT",           designation: "DevOps Engineer",    contractType: "part-time", status: "active",    age: 26, gender: "female", address: "987 Cedar Ln, Seattle, WA",        annualSalary: 55000,  ...ORIGINAL_ROSTER_TENURE.EMP006 },
    { employeeId: "EMP007", name: "Tom Davis",     email: "tom.davis@hrms.com",     department: "Management",   designation: "Product Manager",    contractType: "full-time", status: "active",    age: 42, gender: "male",   address: "147 Birch Blvd, Boston, MA",       annualSalary: 110000, ...ORIGINAL_ROSTER_TENURE.EMP007 },
    { employeeId: "EMP008", name: "Lisa Chen",     email: "lisa.chen@hrms.com",     department: "Design",       designation: "UX Designer",        contractType: "contract",  status: "on-leave",  age: 31, gender: "female", address: "258 Spruce Way, San Francisco, CA", annualSalary: 90000,  ...ORIGINAL_ROSTER_TENURE.EMP008 },

    // Extended roster. startDate doubles as levelStartDate and createdAt.
    // EMP010 (Full-time since 2021-12) and EMP013 (Intern since 2025-11)
    // are deliberately past their promotion threshold so
    // checkPromotionEligibility has real candidates; everyone else is
    // kept under it.

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

    let userAcc = await UserModel.findOne({ email: def.email });
    if (!userAcc) {
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
        createdAt: def.startDate,
      });
      console.log("✓ Created employee:", def.employeeId, def.name);
    }

    if (!userAcc.employee) {
      userAcc.employee = emp._id;
      await userAcc.save();
    }

    created.push(emp);
  }
  return created;
}

/** Upgrades a database seeded before ORIGINAL_ROSTER_TENURE existed; a
 * no-op on a fresh one. */
async function backfillOriginalRosterTenure() {
  for (const [employeeId, tenure] of Object.entries(ORIGINAL_ROSTER_TENURE)) {
    const emp = await EmployeeModel.findOne({ employeeId });
    if (!emp) continue;
    const startDate = new Date(tenure.startDate);
    const upToDate =
      emp.positionLevel === tenure.positionLevel &&
      emp.startDate && +emp.startDate === +startDate &&
      emp.levelStartDate && +emp.levelStartDate === +startDate;
    if (upToDate) continue;
    emp.positionLevel = tenure.positionLevel;
    emp.startDate = startDate;
    emp.levelStartDate = startDate;
    await emp.save({ validateBeforeSave: false });
    await EmployeeModel.updateOne(
      { _id: emp._id, createdAt: { $gt: startDate } },
      { $set: { createdAt: startDate } },
      { timestamps: false },
    );
    console.log(`✓ Backfilled tenure for ${employeeId} ${emp.name}: ${tenure.positionLevel} since ${tenure.startDate}`);
  }
}

/** Points Department.manager at a real Employee (OrgChart resolves the
 * manager by id, not managerName) and keeps managerName in sync. */
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
    // Names never collide with the roster; a shared name reads as a data bug.
    { name: "Michael Foster",  jobTitle: "Senior Software Engineer", stage: "interview", rating: 4.5, email: "michael.foster@example.com",  phone: "+84 90 123 4567", notes: "Strong backend experience." },
    { name: "Sara Lindqvist",  jobTitle: "UI/UX Designer",           stage: "screening", rating: 4.0, email: "sara.lindqvist@example.com",  phone: "+84 91 234 5678", notes: "Great portfolio."           },
    { name: "Tom Brown",       jobTitle: "DevOps Engineer",          stage: "offer",     rating: 4.8, email: "tom.brown@example.com",       phone: "+84 92 345 6789", notes: "Offer extended."            },
    { name: "Emily Davis",     jobTitle: "Senior Software Engineer", stage: "applied",   rating: 3.8, email: "emily.davis@example.com",     phone: "+84 93 456 7890", notes: ""                           },
    // Hired: the same person is EMP020, so funnel and roster agree.
    { name: "Noah Fischer",    jobTitle: "Marketing Intern",         stage: "hired",     rating: 4.2, email: "noah.fischer.cand@example.com", phone: "+84 94 567 8901", notes: "Hired — started 15 Jul 2026 as EMP020." },
    // Closed/filled roles keep their outcome on record.
    { name: "Pham Van Duc",    jobTitle: "Sales Associate",          stage: "hired",     rating: 4.4, email: "duc.pham.sales@example.com",   phone: "+84 90 222 8811", notes: "Hired — role closed." },
    { name: "Lena Hoffmann",   jobTitle: "Sales Associate",          stage: "rejected",  rating: 3.1, email: "lena.hoffmann@example.com",    phone: "+84 91 333 9922", notes: "Went with a candidate with more B2B experience." },
    { name: "Arjun Mehta",     jobTitle: "Product Manager",          stage: "hired",     rating: 4.6, email: "arjun.mehta@example.com",      phone: "+84 92 444 0033", notes: "Hired — role filled." },
    { name: "Claire Dubois",   jobTitle: "Product Manager",          stage: "rejected",  rating: 3.7, email: "claire.dubois@example.com",    phone: "+84 93 555 1144", notes: "Strong, but looking for a more senior scope than this role." },
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

/* ── Holidays ── one list, two consumers: seedHolidays() writes it and
 * collectBusinessDayKeys() skips these dates. A separately hand-copied
 * skip-set once stopped at June and turned National Day into 9 hours of
 * holiday overtime for everyone. Every type is a day off
 * (utils/holidayLookup.js). The list runs past "now" so the dashboard's
 * upcoming-holidays widget isn't empty. */
const HOLIDAY_DEFS = [
  { name: "National Day",                    date: "2025-09-02", type: "public"   },
  { name: "New Year's Day",                  date: "2026-01-01", type: "public"   },
  { name: "Tet Holiday (Lunar New Year)",    date: "2026-02-17", type: "public"   },
  { name: "Hung Kings' Temple Festival",     date: "2026-04-26", type: "public"   },
  { name: "Reunification Day",               date: "2026-04-30", type: "public"   },
  { name: "International Labor Day",         date: "2026-05-01", type: "public"   },
  { name: "Company Anniversary",             date: "2026-06-15", type: "company"  },
  { name: "National Day",                    date: "2026-09-02", type: "public"   },
  { name: "Company Team-Building Day",       date: "2026-11-13", type: "company"  },
  { name: "Year-End Wellness Day",           date: "2026-12-24", type: "optional" },
  { name: "New Year's Day",                  date: "2027-01-01", type: "public"   },
  { name: "Tet Holiday (Lunar New Year)",    date: "2027-02-08", type: "public"   },
];
const HOLIDAY_DATE_KEYS = new Set(HOLIDAY_DEFS.map((h) => h.date));

async function seedHolidays() {
  const defs = HOLIDAY_DEFS;
  for (const def of defs) {
    const date = new Date(def.date);
    const exists = await HolidayModel.findOne({ name: def.name, date });
    if (!exists) {
      await HolidayModel.create({ ...def, date });
      console.log("✓ Created holiday:", def.name);
    }
  }
}

/* ── Attendance history ── a trailing-12-month window built two ways:
 * older business days are bulk-inserted with a plausible status mix; the
 * last RECENT_SLICE_BUSINESS_DAYS are seeded as open check-ins and closed
 * by the real closeAttendanceDay(), so late/no-show/NoShowReview come
 * from production logic. "Today" is left open for the 23:00 ICT cron
 * (DECISIONS.md D11). Nobody clocks in on a demo system, so every
 * business day after the seed is a full-roster no-show — run the seed the
 * morning of a demo. All dates are UTC calendar days (utils/workday.js).
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

// Insert and tolerate duplicate keys (as markNoShow() does): idempotent
// re-runs without a per-row existence check.
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

function collectBusinessDayKeys(startUtc, endUtcInclusive) {
  const keys = [];
  for (let d = new Date(startUtc); d <= endUtcInclusive; d = addUtcDays(d, 1)) {
    if (isWeekendUtc(d)) continue;
    if (HOLIDAY_DATE_KEYS.has(toDateKeyUtc(d))) continue; // same list seedHolidays() writes
    keys.push(toDateKeyUtc(d));
  }
  return keys;
}

/* ── Overtime requests ── seeded BEFORE attendance so the real close job
 * sees approved shifts and produces the overtime rows itself (autoCheckOut
 * at plannedEnd, applyOvertimeToRecord). plannedMinutes/dayType use the
 * controller's own helpers. Past dates count back over business days;
 * future ones roll forward off weekends. */
function businessDayKeyDaysAgo(n) {
  let d = utcMidnight(toDateKeyUtc(new Date()));
  let remaining = n;
  while (remaining > 0) {
    d = addUtcDays(d, -1);
    if (!isWeekendUtc(d) && !HOLIDAY_DATE_KEYS.has(toDateKeyUtc(d))) remaining -= 1;
  }
  return toDateKeyUtc(d);
}
function businessDayKeyDaysAhead(n) {
  let d = utcMidnight(toDateKeyUtc(new Date()));
  let remaining = n;
  while (remaining > 0) {
    d = addUtcDays(d, 1);
    if (!isWeekendUtc(d) && !HOLIDAY_DATE_KEYS.has(toDateKeyUtc(d))) remaining -= 1;
  }
  return toDateKeyUtc(d);
}

// The mix covers all three day types (DECISIONS.md D5) so a payslip reads
// "150% x 4h · 200% x 6h · 300% x 4h": `weeksAgo` is a Saturday, `holidayKey`
// a seeded holiday (skipped outside the attendance window). One approved
// and two pending shifts ahead of today feed the queue.
const OVERTIME_REQUESTS = [
  { employeeId: "EMP009", daysAgo: 6,   plannedStart: "18:00", plannedEnd: "21:00", status: "approved", origin: "self",     reason: "Release deployment — production cut-over" },
  { employeeId: "EMP009", weeksAgo: 2,  plannedStart: "09:00", plannedEnd: "15:00", status: "approved", origin: "assigned", reason: "Saturday data-centre migration (assigned)" },
  { employeeId: "EMP031", daysAgo: 3,   plannedStart: "18:00", plannedEnd: "20:30", status: "approved", origin: "assigned", reason: "Network maintenance window (assigned by IT manager)" },
  { employeeId: "EMP031", holidayKey: "2026-09-02", plannedStart: "09:00", plannedEnd: "13:00", status: "approved", origin: "assigned", reason: "Holiday on-call — firewall firmware rollout" },
  { employeeId: "EMP012", daysAgo: 7,   plannedStart: "18:00", plannedEnd: "22:00", status: "approved", origin: "self",     reason: "Regression run before the release" },
  { employeeId: "EMP014", daysAgo: 17,  plannedStart: "18:00", plannedEnd: "21:30", status: "approved", origin: "self",     reason: "Incident follow-up — API latency" },
  { employeeId: "EMP023", daysAgo: 13,  plannedStart: "18:00", plannedEnd: "20:00", status: "approved", origin: "self",     reason: "Month-end close" },
  { employeeId: "EMP026", daysAgo: 11,  plannedStart: "18:00", plannedEnd: "21:00", status: "approved", origin: "self",     reason: "Late calls with US accounts" },
  { employeeId: "ADM001", daysAgo: 4,   plannedStart: "18:00", plannedEnd: "21:00", status: "approved", origin: "self",     reason: "Server patching window" },
  { employeeId: "EMP016", daysAgo: 8,   plannedStart: "18:00", plannedEnd: "22:00", status: "rejected", origin: "self",     reason: "Design review prep", reviewNote: "Not needed — the review moved to next sprint. Please plan this within normal hours." },
  { employeeId: "EMP014", daysAhead: 2, plannedStart: "18:00", plannedEnd: "21:00", status: "approved", origin: "self",     reason: "Sprint hardening before the client demo" },
  { employeeId: "EMP023", daysAhead: 5, plannedStart: "18:00", plannedEnd: "20:00", status: "pending",  origin: "self",     reason: "Month-end close" },
  { employeeId: "EMP026", daysAhead: 4, plannedStart: "18:00", plannedEnd: "21:00", status: "pending",  origin: "self",     reason: "Quarter-end pipeline calls with US accounts" },
];

/** The Saturday `n` weeks back (n=1 is the most recent one). */
function saturdayKeyWeeksAgo(n) {
  let d = utcMidnight(toDateKeyUtc(new Date()));
  d = addUtcDays(d, -((d.getUTCDay() + 1) % 7 || 7)); // most recent Saturday strictly before today
  return toDateKeyUtc(addUtcDays(d, -7 * (n - 1)));
}

function overtimeDateKeyFor(spec) {
  if (spec.daysAgo != null) return businessDayKeyDaysAgo(spec.daysAgo);
  if (spec.daysAhead != null) return businessDayKeyDaysAhead(spec.daysAhead);
  if (spec.weeksAgo != null) return saturdayKeyWeeksAgo(spec.weeksAgo);
  if (spec.holidayKey) {
    const today = toDateKeyUtc(new Date());
    const windowStart = toDateKeyUtc(addUtcDays(utcMidnight(today), -365));
    return spec.holidayKey < today && spec.holidayKey >= windowStart ? spec.holidayKey : null;
  }
  return null;
}

async function seedOvertimeRequests(employees) {
  const byId = new Map(employees.map((e) => [e.employeeId, e]));
  const hrUser = await UserModel.findOne({ email: "hr@hrms.com" });
  let created = 0;

  for (const spec of OVERTIME_REQUESTS) {
    const emp = byId.get(spec.employeeId);
    if (!emp) continue;

    const dateKey = overtimeDateKeyFor(spec);
    if (!dateKey) continue;
    const date = utcMidnight(dateKey);

    const exists = await OvertimeRequestModel.findOne({ employee: emp._id, date });
    if (exists) continue;

    const { dayMinutes, nightMinutes } = splitDayNight(spec.plannedStart, spec.plannedEnd);
    const appliedAt = addUtcDays(date, -3);
    const doc = {
      employee: emp._id,
      requestedBy: emp.userId ?? null,
      date,
      plannedStart: spec.plannedStart,
      plannedEnd: spec.plannedEnd,
      plannedMinutes: dayMinutes + nightMinutes,
      origin: spec.origin,
      dayType: resolveDayType(dateKey, { isHoliday: HOLIDAY_DATE_KEYS.has(dateKey) }),
      reason: spec.reason,
      status: spec.status,
      appliedAt,
    };
    if (spec.status !== "pending") {
      doc.reviewedBy = hrUser?._id ?? null;
      doc.reviewedAt = addUtcDays(appliedAt, 1);
      doc.reviewNote = spec.reviewNote ?? "";
    }
    await OvertimeRequestModel.create(doc);
    created += 1;
  }
  console.log(`✓ Seeded ${created} overtime requests`);
}

/** {employeeId → Set<dateKey>} of approved shifts: the recent-slice
 * generator never rolls a no-show on a booked day. */
async function approvedOvertimeDays(employees) {
  const rows = await OvertimeRequestModel.find({ status: "approved" }, "employee date");
  const idByObjectId = new Map(employees.map((e) => [String(e._id), e.employeeId]));
  const out = new Map();
  for (const r of rows) {
    const employeeId = idByObjectId.get(String(r.employee));
    if (!employeeId) continue;
    if (!out.has(employeeId)) out.set(employeeId, new Set());
    out.get(employeeId).add(toDateKeyUtc(r.date));
  }
  return out;
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

      // no-show is rare here: bulk days never run the real close job, so
      // 5+ by chance would never produce a NoShowReview flag. Only EMP028
      // (via the real job) crosses the threshold.
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
  const otDays = await approvedOvertimeDays(employees);

  // Off days with an approved shift are closed by the real job too; only
  // the booked employees check in.
  const firstKey = recentDateKeys[0];
  const offDaysWithOt = [...new Set([...otDays.values()].flatMap((set) => [...set]))]
    .filter((k) => k >= firstKey && k < toDateKeyUtc(new Date()) && !recentDateKeys.includes(k))
    .filter((k) => isWeekendUtc(utcMidnight(k)) || HOLIDAY_DATE_KEYS.has(k));
  const dateKeys = [...recentDateKeys, ...offDaysWithOt].sort();

  for (const dateKey of dateKeys) {
    const date = utcMidnight(dateKey);
    const preSeedDocs = [];
    const isOffDay = isWeekendUtc(date) || HOLIDAY_DATE_KEYS.has(dateKey);

    for (const emp of employees) {
      if (emp.createdAt && date < emp.createdAt) continue;
      if (emp.employeeId === "EMP033" && dateKey >= TERMINATED_CUTOFF_KEY) continue;

      if (ON_LEAVE_STREAK_EMPLOYEE_IDS.has(emp.employeeId)) {
        preSeedDocs.push({ employee: emp._id, date, checkIn: null, checkOut: null, hours: 0, status: "on-leave" });
        continue;
      }

      if (emp.employeeId === CHRONIC_NO_SHOW_EMPLOYEE_ID && chronicNoShows < 6) {
        chronicNoShows += 1;
        continue; // no row at all — the real markNoShow() catches it
      }

      const bookedLate = otDays.get(emp.employeeId)?.has(dateKey) ?? false;
      if (isOffDay && !bookedLate) continue; // nobody else works a rest day
      if (!bookedLate && Math.random() < 0.03) continue; // occasional no-show

      // Left open; autoCheckOut fills checkOut below. On an off day the
      // shift is the whole span, so check in at plannedStart.
      const checkIn = isOffDay
        ? (await OvertimeRequestModel.findOne({ employee: emp._id, date, status: "approved" }, "plannedStart"))?.plannedStart ?? checkInOnTime()
        : !bookedLate && Math.random() < 0.10 ? checkInLate() : checkInOnTime();
      preSeedDocs.push({ employee: emp._id, date, checkIn, checkOut: null, hours: 0, status: "present" });
    }

    await insertAttendanceTolerantly(preSeedDocs);

    // Chronological order is required: flagRepeatedNoShows counts all-time
    // no-shows, so it must fire on the day of the 5th one.
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
    `✓ Seeded ${inserted} in-progress check-ins for today (${dateKey}) — left open; ` +
      "the scheduled close-day job (GitHub Actions, 23:00 ICT) closes it tonight.",
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

/* ── Leave requests ── reviewed history, one ongoing parental block per
 * on-leave employee (explains their attendance streak), and pending
 * requests so the queue isn't empty. Approved ones replay the
 * controller's onApprove (upsert "on-leave" attendance per weekday) so
 * Attendance and Leave Requests agree. */

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

// Mirrors leaveRequestController.js's onApprove (same upsert, weekdays only).
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

// Fixed dates: idempotent by construction.
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

// One long parental block (90-day allowance) covers the ~33 business days
// their attendance streak spans.
const ONGOING_PARENTAL_LEAVE_EMPLOYEE_IDS = ["EMP008", "EMP019", "EMP032"];

// Relative to run time.
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

  // dedupeQuery is caller-supplied: the relative-date blocks dedupe on
  // {type, status}, since their startDate differs on every run.
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

/* ── Payroll history ── walks the real payroll jobs across the trailing
 * 12 months, so every figure comes from the engine reading the seeded
 * attendance and leave. Newest month stays "draft", the one before is
 * "approved", older ones are "paid" (DECISIONS.md D9).
 * runMonthlyPayroll({asOf}) targets asOf's PREVIOUS month and always runs
 * through to "paid", so the "approved" period is set with the same minimal
 * field update payrollController.setPeriodStatus makes. */
/* ── Payslip adjustments ── HR edits (bonus, allowance, overridden
 * deduction) applied right after each month's draft, and again after
 * refreshCurrentDraftPayrollAfterPromotions() rebuilds the current one.
 * Mirrors payrollController.updatePayslip. Amounts are USD, converted at
 * the period's fxRate. `months` is 1–12 or "all"; `recent: n` is the last
 * n months of the window. */
const PAYSLIP_ADJUSTMENTS = [
  // Standing allowances
  { employeeId: "ADM001", months: "all",         allowanceUsd: 400, reason: "Management allowance" },
  { employeeId: "MGR001", months: "all",         allowanceUsd: 300, reason: "Management allowance" },
  { employeeId: "MGR002", months: "all",         allowanceUsd: 250, reason: "On-call allowance — Engineering" },
  { employeeId: "EMP009", months: "all",         allowanceUsd: 250, reason: "On-call allowance — Engineering" },
  { employeeId: "EMP014", months: "all",         allowanceUsd: 250, reason: "On-call allowance — Engineering" },
  { employeeId: "EMP031", months: "all",         allowanceUsd: 60,  reason: "Phone allowance — IT" },
  { employeeId: "EMP015", months: "all",         allowanceUsd: 150, reason: "Transport allowance" },
  // Sales commission and quarterly bonuses
  { employeeId: "EMP026", months: "all",         bonusUsd: 450,   reason: "Monthly sales commission" },
  { employeeId: "EMP027", months: "all",         bonusUsd: 350,   reason: "Monthly sales commission" },
  { employeeId: "EMP029", months: [3, 6, 9, 12], bonusUsd: 1_500, reason: "Quarterly sales bonus" },
  { employeeId: "EMP005", months: [3, 6, 9, 12], bonusUsd: 1_200, reason: "Quarterly sales bonus" },
  // One-off bonuses in the current month (the one the demo opens on)
  { employeeId: "ADM001", recent: 1,             bonusUsd: 2_000, reason: "Annual performance bonus" },
  { employeeId: "MGR002", recent: 1,             bonusUsd: 800,   reason: "Release delivery bonus" },
  { employeeId: "EMP012", recent: 1,             bonusUsd: 400,   reason: "Release delivery bonus" },
  // Overridden deductions
  { employeeId: "EMP011", recent: 3,             deductionUsd: 300, reason: "Salary advance repayment (3 instalments)" },
  { employeeId: "EMP018", recent: 2,             deductionUsd: 120, reason: "Equipment replacement — lost access badge and laptop charger" },
];

async function applyPayslipAdjustments({ year, month }, { monthIndexFromEnd, hrUser }) {
  const period = await PayrollPeriodModel.findOne({ year, month });
  if (!period) return 0;
  const employees = await EmployeeModel.find({ employeeId: { $in: PAYSLIP_ADJUSTMENTS.map((a) => a.employeeId) } }, "employeeId");
  const byCode = new Map(employees.map((e) => [e.employeeId, e._id]));
  let applied = 0;

  for (const spec of PAYSLIP_ADJUSTMENTS) {
    const inMonth =
      spec.months === "all" ||
      (Array.isArray(spec.months) && spec.months.includes(month)) ||
      (spec.recent != null && monthIndexFromEnd < spec.recent);
    if (!inMonth) continue;
    const employeeId = byCode.get(spec.employeeId);
    if (!employeeId) continue;
    const payslip = await PayslipModel.findOne({ period: period._id, employee: employeeId });
    if (!payslip) continue;

    const vnd = (usd) => Math.round(usd * period.fxRate);
    const before = { baseSalary: payslip.baseSalary, bonus: payslip.bonus, allowance: payslip.allowance, deduction: payslip.deduction };
    const merged = {
      baseSalary: payslip.baseSalary,
      bonus: spec.bonusUsd != null ? vnd(spec.bonusUsd) : payslip.bonus,
      allowance: spec.allowanceUsd != null ? vnd(spec.allowanceUsd) : payslip.allowance,
      deduction: spec.deductionUsd != null ? vnd(spec.deductionUsd) : payslip.deduction,
    };
    const changes = diffChanges(before, merged);
    if (!changes) continue; // already applied

    payslip.autoDeduction = autoDeductionVnd({
      baseSalary: merged.baseSalary,
      bonus: merged.bonus,
      allowance: merged.allowance,
      unpaidLeaveDays: payslip.unpaidLeaveDays,
      absentDays: payslip.absentDays,
      standardWorkingDays: period.standardWorkingDays,
    });
    payslip.deductionOverridden = merged.deduction !== payslip.autoDeduction;
    Object.assign(
      payslip,
      computePayslip({
        ...merged,
        unpaidDays: payslip.unpaidLeaveDays + payslip.absentDays,
        overtimePay: payslip.overtimePay,
        overtimeTaxExempt: payslip.overtimeTaxExempt,
      }),
    );
    await payslip.save();

    // Log each edit once, not once per run (the current draft is rebuilt each run).
    const label = `${payslip.employeeName} — ${year}-${pad2(month)}`;
    const logged = await mongoose.connection.db
      .collection("auditlogs")
      .findOne({ resource: "payroll", action: "updated", label, "changes.reason.to": spec.reason });
    if (!logged) {
      await logAction(
        { user: hrUser ? { id: hrUser._id, name: hrUser.name, role: hrUser.role } : undefined },
        {
          action: "updated",
          resource: "payroll",
          resourceId: payslip._id,
          label,
          changes: { ...changes, reason: { from: null, to: spec.reason } },
        },
      );
    }
    applied += 1;
  }
  return applied;
}

async function seedPayrollHistory() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1–12

  // Trailing 12 months, oldest first; Date normalizes negative month indexes.
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(currentYear, currentMonth - 1 - i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }

  const adminUser = await UserModel.findOne({ email: "admin@hrms.com" });
  const hrUser = await UserModel.findOne({ email: "hr@hrms.com" });
  const label = (y, m) => `${y}-${String(m).padStart(2, "0")}`;
  let adjusted = 0;

  for (let idx = 0; idx < months.length; idx++) {
    const { year, month } = months[idx];
    const isCurrentMonth = idx === months.length - 1;
    const isPreviousMonth = idx === months.length - 2;

    const draftResult = await generateMonthlyPayrollDraft({ asOf: new Date(year, month - 1, 1) });
    console.log(`✓ Drafted ${label(year, month)}:`, JSON.stringify(draftResult));
    adjusted += await applyPayslipAdjustments({ year, month }, { monthIndexFromEnd: months.length - 1 - idx, hrUser });

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

    // `month` is 1-indexed, so new Date(year, month, 1) is next month's 1st.
    const payRunResult = await runMonthlyPayroll({ asOf: new Date(year, month, 1) });
    console.log(`✓ Paid ${label(year, month)}:`, JSON.stringify(payRunResult));
  }
  console.log(`✓ Applied ${adjusted} payslip adjustments (bonus / allowance / deduction) across the history`);
}

/* ── Promotions ── runs the real checkPromotionEligibility (EMP010/EMP013
 * are the planted candidates), then adds one approved and one rejected
 * HR-initiated proposal. Those skip the tenure threshold, standing for
 * the "propose early on performance" path. */
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
      // Mirrors promotionRequestController.js's onApprove.
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

/* ── Annual raises ── backdated createdAt means the cron's first real run
 * would flood the queue with ~18 anniversary proposals at once. Run it
 * here and resolve all but PENDING_ANNUAL_RAISES; the cron dedups against
 * these rows. Approval mirrors the controller (salary only; level and
 * levelStartDate untouched). Paid months keep their pre-raise figures. */
const PENDING_ANNUAL_RAISES = 2;

async function seedAnnualRaises() {
  const before = await PromotionRequestModel.countDocuments({ systemGenerated: true, proposedPositionLevel: null });
  const result = await annualSalaryRaise({ asOf: new Date() });
  console.log("✓ Ran annualSalaryRaise:", JSON.stringify(result));
  if (before > 0) return; // already worked on a previous run — leave HR's decisions alone

  const adminUser = await UserModel.findOne({ email: "admin@hrms.com" });
  const pending = await PromotionRequestModel.find({
    systemGenerated: true,
    proposedPositionLevel: null,
    status: "pending",
  }).sort({ effectiveDate: -1, _id: 1 });

  let approved = 0;
  for (const request of pending.slice(PENDING_ANNUAL_RAISES)) {
    request.status = "approved";
    request.reviewedBy = adminUser?._id ?? null;
    request.reviewedAt = addUtcDays(request.effectiveDate ?? new Date(), 3);
    request.reviewNote = "Standard annual increase — approved.";
    await request.save();
    if (typeof request.proposedAnnualSalary === "number") {
      await EmployeeModel.findByIdAndUpdate(request.employee, { annualSalary: request.proposedAnnualSalary });
    }
    approved += 1;
  }
  console.log(`✓ Annual raises: ${approved} approved, ${Math.min(pending.length, PENDING_ANNUAL_RAISES)} left pending for review`);
}

/* ── Post-promotion payroll refresh ── the current draft was built before
 * promotions and raises changed salaries. A real draft doesn't refresh
 * either; this replays payrollController's regenerate endpoint. */
async function refreshCurrentDraftPayrollAfterPromotions() {
  const now = new Date();
  const period = await PayrollPeriodModel.findOne({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    status: "draft",
  });
  if (!period) return;

  await PayslipModel.deleteMany({ period: period._id });
  const rows = await buildPayslipRows(period);
  const generated = await insertPayslips(rows);
  await logAction(
    {},
    {
      action: "updated",
      resource: "payroll",
      resourceId: period._id,
      label: `Payroll ${period.year}-${String(period.month).padStart(2, "0")} regenerated (post-promotion refresh)`,
    },
  );
  console.log(
    `✓ Refreshed ${period.year}-${String(period.month).padStart(2, "0")} draft payroll ` +
      `to reflect post-promotion salaries (${generated} payslips)`,
  );

  // The rebuild dropped this month's adjustments with the old rows; re-apply.
  const hrUser = await UserModel.findOne({ email: "hr@hrms.com" });
  const reapplied = await applyPayslipAdjustments({ year: period.year, month: period.month }, { monthIndexFromEnd: 0, hrUser });
  console.log(`✓ Re-applied ${reapplied} payslip adjustments to the refreshed draft`);
}

/* ── Profile edit requests ── one each of pending/approved/rejected. The
 * approved one applies its "to" values to the Employee (the controller's
 * onApprove); "from" values are read off the record at seed time. */
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

/* ── Performance reviews + appeals ── cycles come from the real
 * ensureStandardCycles() (rolling 2 closed + 1 open). Reviews are one
 * $set per employee rather than a replay of the submit endpoints; the
 * schema has no cross-field validation that sequence would exercise.
 * managerReviewedBy follows performanceScope.js: only Engineering has a
 * MANAGER user, so HR reviews every other department. */

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

// Excludes on-leave (EMP008/019/032), terminated (EMP033), chronic no-show
// (EMP028) and EMP020 (hired after the closed cycle).
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
    let candidateId = hrUser?._id ?? null;
    if (emp.department) {
      const dept = await DepartmentModel.findById(emp.department, "name");
      if (dept?.name === "Engineering") candidateId = engManagerUser?._id ?? hrUser?._id ?? null;
    }
    // assertCanRateAsManager blocks self-review even for ADMIN, which the
    // rules above would produce for MGR001 (HR) and MGR002 (Engineering
    // manager). Admin is the only valid reviewer for either.
    if (candidateId && emp.userId && String(candidateId) === String(emp.userId)) {
      return adminUser?._id ?? null;
    }
    return candidateId;
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
      doc.managerRating = adjustedRating; // post-resolution value, as resolveAppeal writes it
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

  // Databases seeded before the self-review guard have MGR001/MGR002
  // self-reviewed, and the exists-check above would keep them that way.
  for (const employeeId of ["MGR001", "MGR002"]) {
    const emp = byId.get(employeeId);
    if (!emp?.userId) continue;
    const review = await PerformanceReviewModel.findOne({ cycleKey: closedCycle.key, employee: emp._id });
    if (!review?.managerReviewedBy) continue;
    if (String(review.managerReviewedBy) === String(emp.userId)) {
      review.managerReviewedBy = adminUser?._id ?? null;
      await review.save();
      console.log(`✓ Corrected self-reviewed manager rating for ${employeeId} (now reviewed by Admin)`);
    }
  }

  // Open cycle: a mid-cycle mix. No review doc = "Not started", so most of
  // the roster needs nothing.
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

/* ── Position ladder ── */
async function seedPositionLevels() {
  // baseSalary is USD like annualSalary; HR can PATCH it, order/level are structural.
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

/** Backfills positionLevel/levelStartDate on employees that predate those
 * fields (the pre("validate") default only fires on create). Only touches
 * unset fields. */
async function backfillEmployeePositionLadder() {
  const missingLevel = await EmployeeModel.updateMany(
    { positionLevel: { $exists: false } },
    { $set: { positionLevel: "Full-time" } },
  );
  if (missingLevel.modifiedCount > 0) {
    console.log(`✓ Backfilled positionLevel on ${missingLevel.modifiedCount} existing employee(s)`);
  }

  // startDate over "now": defaulting to now would reset every promotion clock.
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

/* ── Broadcast notifications (user: null) ── each message is read off the
 * seeded data (newest hire, next holiday, interviewing candidate) so it
 * can't go stale. Payroll/attendance notices come from the real jobs.
 * Deduped by title. */
async function seedNotifications() {
  const now = new Date();

  const newestHire = await EmployeeModel.findOne({ status: "active" }).sort({ createdAt: -1 });
  const nextHoliday = await HolidayModel.findOne({ date: { $gte: now } }).sort({ date: 1 });
  const interviewing = await CandidateModel.findOne({ stage: "interview" }).populate("job", "title");

  const defs = [
    interviewing && {
      category: "hiring",
      title: "Interview scheduled",
      message: `Interview with ${interviewing.name} for ${interviewing.job?.title ?? "an open role"} is on the calendar this week.`,
    },
    newestHire && {
      category: "employee",
      title: "New employee added",
      message: `${newestHire.name} has joined the team as ${newestHire.designation}.`,
    },
    nextHoliday && {
      category: "holiday",
      title: "Upcoming holiday",
      message: `${nextHoliday.name} is coming up on ${nextHoliday.date.toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}.`,
    },
    { category: "system", title: "System maintenance", message: "Scheduled maintenance this weekend, Saturday 22:00–23:00 ICT." },
  ].filter(Boolean);

  for (const def of defs) {
    const exists = await NotificationModel.findOne({ title: def.title, user: null });
    if (!exists) {
      await NotificationModel.create({ ...def, user: null });
      console.log("✓ Created notification:", def.title);
    }
  }
}

/* ── Targeted notifications ── the direct Mongoose writes above skipped
 * the controllers' notification side effects; this backfills a sample in
 * each controller's exact copy/titleKey shape, dated off the records.
 * Older ones are marked read; the freshest two stay unread. */
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

/* ── Backdate what the real jobs wrote ── the close-day, payroll and raise
 * jobs stamp their notifications and audit entries "just now". Each names
 * the day or period it describes, so the timestamp is recovered from the
 * record: attendance close → D 23:00 ICT; draft → 1st 08:00; paid → 10th
 * of the next month; no-show flag → the 5th no-show's day; raise proposal
 * → its anniversary (approved ones deleted). Anything older than a few
 * days is marked read. Raw updateOne calls, since `timestamps` would
 * re-stamp updatedAt. */
const ICT_OFFSET_MS = 7 * 3600 * 1000;
function ictTime(dateKey, hour) {
  return new Date(utcMidnight(dateKey).getTime() + hour * 3600 * 1000 - ICT_OFFSET_MS);
}
function firstOfMonth(label) {
  const [y, m] = label.split("-").map(Number);
  return `${y}-${pad2(m)}-01`;
}
function tenthOfNextMonth(label) {
  const [y, m] = label.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 10)); // month is 0-indexed, so `m` is next month
  return toDateKeyUtc(d);
}

async function backdateJobArtifacts() {
  const now = new Date();
  const readCutoff = addUtcDays(now, -3);
  const notifications = NotificationModel.collection;
  const auditLogs = mongoose.connection.db.collection("auditlogs");
  let moved = 0;
  let removed = 0;

  async function stamp(collection, filter, createdAt) {
    const res = await collection.updateMany(filter, {
      $set: { createdAt, updatedAt: createdAt, ...(collection === notifications && createdAt < readCutoff ? { read: true } : {}) },
    });
    moved += res.modifiedCount;
  }

  // Attendance closes — notification (params.date) and audit (label).
  for (const n of await notifications.find({ titleKey: { $in: ["attendanceClosed", "attendanceClosedWithFlagged"] } }).toArray()) {
    if (n.params?.date) await stamp(notifications, { _id: n._id }, ictTime(n.params.date, 23));
  }
  for (const a of await auditLogs.find({ resource: "attendance", label: /^Attendance closed for (\d{4}-\d{2}-\d{2})$/ }).toArray()) {
    await stamp(auditLogs, { _id: a._id }, ictTime(a.label.slice(-10), 23));
  }

  // Payroll drafts and pay runs.
  for (const n of await notifications.find({ titleKey: "monthlyPayrollDraftReady" }).toArray()) {
    if (n.params?.periodLabel) await stamp(notifications, { _id: n._id }, ictTime(firstOfMonth(n.params.periodLabel), 8));
  }
  for (const n of await notifications.find({ titleKey: "payrollPaid" }).toArray()) {
    if (n.params?.periodLabel) await stamp(notifications, { _id: n._id }, ictTime(tenthOfNextMonth(n.params.periodLabel), 8));
  }
  // Payslip adjustments: between the 1st-of-month draft and the 10th pay run.
  const currentLabel = `${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}`;
  for (const a of await auditLogs.find({ resource: "payroll", action: "updated", label: / — (\d{4}-\d{2})$/ }).toArray()) {
    const label = a.label.slice(-7);
    if (label === currentLabel) continue; // this month's edits happened "today"
    await stamp(auditLogs, { _id: a._id }, ictTime(tenthOfNextMonth(label).replace(/-10$/, "-06"), 10));
  }
  for (const a of await auditLogs.find({ resource: "payroll", label: /^Payroll (\d{4}-\d{2})/ }).toArray()) {
    const label = a.label.slice(8, 15);
    if (/auto-drafted/.test(a.label)) await stamp(auditLogs, { _id: a._id }, ictTime(firstOfMonth(label), 8));
    else if (/paid by the monthly run/.test(a.label)) await stamp(auditLogs, { _id: a._id }, ictTime(tenthOfNextMonth(label), 8));
    else if (/draft to approved/.test(a.label)) await stamp(auditLogs, { _id: a._id }, ictTime(tenthOfNextMonth(label).replace(/-10$/, "-05"), 10));
  }

  // No-show flags: the notification, and the review row's flaggedAt, move
  // to the day of the 5th no-show that triggered them.
  for (const flag of await NoShowReviewModel.find()) {
    const noShows = await AttendanceModel.find({ employee: flag.employee, status: "no-show" }, "date").sort({ date: 1 });
    const trigger = noShows[Math.min(flag.noShowCountAtFlag, noShows.length) - 1];
    if (!trigger) continue;
    const when = ictTime(toDateKeyUtc(trigger.date), 23);
    await NoShowReviewModel.collection.updateOne({ _id: flag._id }, { $set: { flaggedAt: when, createdAt: when, updatedAt: when } });
    const emp = await EmployeeModel.findById(flag.employee, "name employeeId");
    if (emp) await stamp(notifications, { titleKey: "noShowPatternFlagged", message: new RegExp(`\\(${emp.employeeId}\\)`) }, when);
  }

  // Annual raises: drop the notification for every proposal seedAnnualRaises()
  // already approved (HR "worked" those), and date the rest to their anniversary.
  for (const req of await PromotionRequestModel.find({ systemGenerated: true, proposedPositionLevel: null }).populate("employee", "name")) {
    const filter = { titleKey: "annualRaiseAwaiting", "params.employeeName": req.employee?.name };
    if (req.status === "approved") {
      removed += (await notifications.deleteMany(filter)).deletedCount;
    } else if (req.effectiveDate) {
      await stamp(notifications, filter, ictTime(toDateKeyUtc(req.effectiveDate), 4));
    }
  }

  console.log(`✓ Backdated ${moved} job-generated notifications/audit entries to the dates they describe; removed ${removed} already-handled raise notices`);
}

/* ── Main ── */
async function main() {
  await connectDB();

  const deptByName = await seedDepartments();
  await upsertAdmin(deptByName);
  await upsertHRUser(deptByName);
  await upsertManagerUser(deptByName);
  // ADM001/MGR001/MGR002 come from the upserts, not seedEmployees(); add
  // them here or every history phase skips them.
  const employees = [
    ...(await seedEmployees(deptByName)),
    ...(await EmployeeModel.find({ employeeId: { $in: ["ADM001", "MGR001", "MGR002"] } })),
  ];
  const jobs       = await seedJobs(deptByName);

  await seedPositionLevels();
  await backfillEmployeePositionLadder();
  await backfillOriginalRosterTenure();
  await linkDepartmentManagers(deptByName);

  await seedCandidates(jobs);
  await seedHolidays();
  await seedOvertimeRequests(employees); // before attendance: the real close job must see approved shifts
  await seedAttendanceHistory(employees);
  await seedLeaveRequests(employees);
  await seedPayrollHistory();
  await seedPromotionRequests(employees);
  await seedAnnualRaises();
  await refreshCurrentDraftPayrollAfterPromotions();
  await seedProfileEditRequests(employees);
  await seedPerformanceReviews(employees);
  await seedNotifications();
  await seedTargetedNotifications(employees);
  await backdateJobArtifacts();

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
