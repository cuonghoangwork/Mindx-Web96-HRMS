// One-off seed script — populates MongoDB with enough demo data to run the
// HRMS frontend end-to-end (login, employees, departments, jobs, candidates,
// holidays, attendance, notifications).
//
// Usage:
//   cp .env.example .env.dev   (fill in CONNECT_STRING, AT_SECRETKEY, RT_SECRETKEY)
//   npm run seed:env
//
// Safe to re-run: it skips creation for anything that already exists by a
// natural unique key (email / employeeId / name+date / etc).

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

const SALT_ROUNDS = 10;

async function upsertAdmin() {
  const email = "admin@hrms.com";
  const existing = await UserModel.findOne({ email });
  if (existing) {
    console.log("✓ Admin user already exists:", email);
    return existing;
  }
  const salt = bcrypt.genSaltSync(SALT_ROUNDS);
  const hash = bcrypt.hashSync("admin123", salt);
  const user = await UserModel.create({
    email,
    password: hash,
    name: "Admin User",
    role: "ADMIN",
  });
  console.log("✓ Created admin user:", email, "/ admin123");
  return user;
}

async function seedDepartments() {
  const defs = [
    { name: "Engineering", managerName: "John Smith", budget: 500000 },
    { name: "Design", managerName: "Sarah Lee", budget: 200000 },
    { name: "Marketing", managerName: "Mike Johnson", budget: 150000 },
    { name: "Finance", managerName: "Lisa Brown", budget: 100000 },
    { name: "Sales", managerName: "Tom Wilson", budget: 300000 },
    { name: "IT", managerName: "David Chen", budget: 400000 },
    { name: "Management", managerName: "Robert Kim", budget: 600000 },
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

async function seedEmployees(deptByName) {
  const defs = [
    { employeeId: "EMP001", name: "John Doe", department: "Engineering", designation: "Software Engineer", contractType: "full-time", status: "active", age: 28, gender: "male", email: "john.doe@hrms.com", address: "123 Main St, New York, NY", annualSalary: 85000 },
    { employeeId: "EMP002", name: "Jane Smith", department: "Design", designation: "UI Designer", contractType: "full-time", status: "active", age: 32, gender: "female", email: "jane.smith@hrms.com", address: "456 Oak Ave, Los Angeles, CA", annualSalary: 75000 },
    { employeeId: "EMP003", name: "Bob Johnson", department: "Marketing", designation: "Marketing Manager", contractType: "full-time", status: "on-leave", age: 45, gender: "male", email: "bob.johnson@hrms.com", address: "789 Pine Rd, Chicago, IL", annualSalary: 95000 },
    { employeeId: "EMP004", name: "Alice Brown", department: "Finance", designation: "HR Specialist", contractType: "part-time", status: "active", age: 29, gender: "female", email: "alice.brown@hrms.com", address: "321 Elm St, Houston, TX", annualSalary: 45000 },
    { employeeId: "EMP005", name: "Mike Wilson", department: "Sales", designation: "Sales Manager", contractType: "contract", status: "active", age: 38, gender: "male", email: "mike.wilson@hrms.com", address: "654 Maple Dr, Phoenix, AZ", annualSalary: 80000 },
    { employeeId: "EMP006", name: "Sarah Lee", department: "IT", designation: "DevOps Engineer", contractType: "part-time", status: "active", age: 26, gender: "female", email: "sarah.lee@hrms.com", address: "987 Cedar Ln, Seattle, WA", annualSalary: 55000 },
    { employeeId: "EMP007", name: "Tom Davis", department: "Management", designation: "Product Manager", contractType: "full-time", status: "active", age: 42, gender: "male", email: "tom.davis@hrms.com", address: "147 Birch Blvd, Boston, MA", annualSalary: 110000 },
    { employeeId: "EMP008", name: "Lisa Chen", department: "Design", designation: "UX Designer", contractType: "contract", status: "on-leave", age: 31, gender: "female", email: "lisa.chen@hrms.com", address: "258 Spruce Way, San Francisco, CA", annualSalary: 90000 },
  ];
  const created = [];
  for (const def of defs) {
    let emp = await EmployeeModel.findOne({ employeeId: def.employeeId });
    if (!emp) {
      const dept = deptByName[def.department];
      emp = await EmployeeModel.create({ ...def, department: dept ? dept._id : undefined });
      console.log("✓ Created employee:", def.employeeId, def.name);
    }
    created.push(emp);
  }
  return created;
}

async function seedJobs(deptByName) {
  const defs = [
    { title: "Senior Software Engineer", department: "Engineering", location: "Remote", type: "full-time", status: "open" },
    { title: "UI/UX Designer", department: "Design", location: "New York", type: "full-time", status: "open" },
    { title: "Product Manager", department: "Management", location: "San Francisco", type: "full-time", status: "filled" },
    { title: "DevOps Engineer", department: "IT", location: "Remote", type: "contract", status: "open" },
    { title: "Marketing Intern", department: "Marketing", location: "Hanoi", type: "intern", status: "open" },
    { title: "Sales Associate", department: "Sales", location: "Ho Chi Minh City", type: "full-time", status: "closed" },
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

async function seedCandidates(jobs) {
  const byTitle = Object.fromEntries(jobs.map((j) => [j.title, j]));
  const defs = [
    { name: "Mike Wilson", jobTitle: "Senior Software Engineer", stage: "interview", rating: 4.5, email: "mike.wilson.cand@example.com", phone: "+84 90 123 4567", notes: "Strong backend experience." },
    { name: "Sarah Lee", jobTitle: "UI/UX Designer", stage: "screening", rating: 4.0, email: "sarah.lee.cand@example.com", phone: "+84 91 234 5678", notes: "Great portfolio." },
    { name: "Tom Brown", jobTitle: "DevOps Engineer", stage: "offer", rating: 4.8, email: "tom.brown@example.com", phone: "+84 92 345 6789", notes: "Offer extended." },
    { name: "Emily Davis", jobTitle: "Senior Software Engineer", stage: "applied", rating: 3.8, email: "emily.davis@example.com", phone: "+84 93 456 7890", notes: "" },
    { name: "James Nguyen", jobTitle: "Marketing Intern", stage: "hired", rating: 4.2, email: "james.nguyen@example.com", phone: "+84 94 567 8901", notes: "Starts soon." },
  ];
  for (const def of defs) {
    const job = byTitle[def.jobTitle];
    if (!job) continue;
    const exists = await CandidateModel.findOne({ email: def.email });
    if (!exists) {
      await CandidateModel.create({
        name: def.name,
        email: def.email,
        phone: def.phone,
        job: job._id,
        stage: def.stage,
        rating: def.rating,
        notes: def.notes,
        resumeUrl: "#",
      });
      console.log("✓ Created candidate:", def.name);
    }
  }
}

async function seedHolidays() {
  const defs = [
    { name: "New Year's Day", date: "2026-01-01", type: "public" },
    { name: "Tet Holiday (Lunar New Year)", date: "2026-02-17", type: "public" },
    { name: "Hung Kings' Temple Festival", date: "2026-04-26", type: "public" },
    { name: "Reunification Day", date: "2026-04-30", type: "public" },
    { name: "International Labor Day", date: "2026-05-01", type: "public" },
    { name: "Company Anniversary", date: "2026-06-15", type: "company" },
    { name: "National Day", date: "2026-09-02", type: "public" },
    { name: "Year-End Wellness Day", date: "2026-12-24", type: "optional" },
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

async function seedAttendance(employees) {
  const date = new Date("2026-01-15");
  const statuses = [
    { checkIn: "09:00", checkOut: "18:00", status: "present" },
    { checkIn: "09:15", checkOut: "18:30", status: "present" },
    { checkIn: null, checkOut: null, status: "on-leave" },
    { checkIn: "08:45", checkOut: "17:30", status: "present" },
    { checkIn: "09:30", checkOut: null, status: "present" },
    { checkIn: "09:45", checkOut: "18:00", status: "present" },
    { checkIn: "08:30", checkOut: "17:00", status: "present" },
    { checkIn: null, checkOut: null, status: "on-leave" },
  ];
  for (let i = 0; i < employees.length; i++) {
    const emp = employees[i];
    const def = statuses[i % statuses.length];
    const exists = await AttendanceModel.findOne({ employee: emp._id, date });
    if (!exists) {
      await AttendanceModel.create({ employee: emp._id, date, ...def });
    }
  }
  console.log("✓ Seeded attendance for", employees.length, "employees on", date.toISOString().slice(0, 10));
}

async function seedNotifications() {
  const defs = [
    { category: "leave", title: "New leave request", message: "John Doe requested 3 days off" },
    { category: "hiring", title: "Interview scheduled", message: "Candidate interview for Design role" },
    { category: "payroll", title: "Payroll processed", message: "May payroll has been processed" },
    { category: "employee", title: "New employee added", message: "Sarah Smith has joined the team" },
    { category: "holiday", title: "Upcoming holiday", message: "Company Anniversary is coming up on Jun 15" },
    { category: "system", title: "System maintenance", message: "Scheduled maintenance this weekend" },
  ];
  for (const def of defs) {
    const exists = await NotificationModel.findOne({ title: def.title, user: null });
    if (!exists) {
      await NotificationModel.create({ ...def, user: null });
      console.log("✓ Created notification:", def.title);
    }
  }
}

async function main() {
  await connectDB();
  await upsertAdmin();
  const deptByName = await seedDepartments();
  const employees = await seedEmployees(deptByName);
  const jobs = await seedJobs(deptByName);
  await seedCandidates(jobs);
  await seedHolidays();
  await seedAttendance(employees);
  await seedNotifications();
  console.log("\n✅ Seed complete. Login with admin@hrms.com / admin123\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
