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

const SALT_ROUNDS = 10;

function hashPassword(plain) {
  const salt = bcrypt.genSaltSync(SALT_ROUNDS);
  return bcrypt.hashSync(plain, salt);
}

/* ── Admin account (ADMIN role — seed only) ── */
async function upsertAdmin() {
  const email = "admin@hrms.com";
  let user = await UserModel.findOne({ email });
  if (user) {
    console.log("✓ Admin user already exists:", email);
    return user;
  }
  user = await UserModel.create({
    email,
    password: hashPassword("admin123"),
    name: "Admin User",
    role: "ADMIN",
  });
  console.log("✓ Created ADMIN user:", email, "/ admin123");
  return user;
}

/* ── Demo HR/Manager account (MANAGER role — promoted for demo) ── */
async function upsertHRUser() {
  const email = "hr@hrms.com";
  let user = await UserModel.findOne({ email });
  if (user) {
    console.log("✓ HR user already exists:", email);
    return user;
  }
  user = await UserModel.create({
    email,
    password: hashPassword("hr123456"),
    name: "HR Manager",
    role: "MANAGER",
  });
  console.log("✓ Created MANAGER user:", email, "/ hr123456");
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

/* ── Attendance ── */
async function seedAttendance(employees) {
  const date = new Date("2026-01-15");
  const statuses = [
    { checkIn: "09:00", checkOut: "18:00", status: "present"  },
    { checkIn: "09:15", checkOut: "18:30", status: "present"  },
    { checkIn: null,    checkOut: null,    status: "on-leave"  },
    { checkIn: "08:45", checkOut: "17:30", status: "present"  },
    { checkIn: "09:30", checkOut: null,    status: "present"  },
    { checkIn: "09:45", checkOut: "18:00", status: "present"  },
    { checkIn: "08:30", checkOut: "17:00", status: "present"  },
    { checkIn: null,    checkOut: null,    status: "on-leave"  },
  ];
  for (let i = 0; i < employees.length; i++) {
    const emp = employees[i];
    const def = statuses[i % statuses.length];
    const exists = await AttendanceModel.findOne({ employee: emp._id, date });
    if (!exists) {
      await AttendanceModel.create({ employee: emp._id, date, ...def });
    }
  }
  console.log("✓ Seeded attendance for", employees.length, "employees on 2026-01-15");
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

  await upsertAdmin();
  await upsertHRUser();

  const deptByName = await seedDepartments();
  const employees  = await seedEmployees(deptByName);
  const jobs       = await seedJobs(deptByName);

  await seedPositionLevels();
  await backfillEmployeePositionLadder();

  await seedCandidates(jobs);
  await seedHolidays();
  await seedAttendance(employees);
  await seedNotifications();

  console.log("\n✅ Seed complete.");
  console.log("   Admin  → admin@hrms.com  / admin123");
  console.log("   HR     → hr@hrms.com     / hr123456");
  console.log("   Employees → <firstname>.<lastname>@hrms.com / emp001pass … emp008pass\n");

  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
