// One-off migration — renames the old 2-value LeaveRequest/Attendance leave
// type ("paid") to the new 5-type model's "annual" (same policy, 12 days/
// year, just renamed to make room for sick/parental/bereavement as their
// own distinct types). "unpaid" is unchanged in both models.
//
// Safe to re-run: only matches documents still holding the literal "paid"
// value, so a second run is a no-op. Also runs automatically on server boot
// (see utils/startupMigrations.js, which this script calls into) — this
// file exists for running the fix manually without a full server start.
//
// Usage:
//   cd hrms-backend
//   node scripts/migrateLeaveTypes.js            (uses .env.dev)
//   NODE_ENV=prod node scripts/migrateLeaveTypes.js

import dotenv from "dotenv";
const env = process.env.NODE_ENV || "dev";
dotenv.config({ path: `.env.${env}` });

import { connectDB } from "../config/db.js";
import { migratePaidLeaveType } from "../utils/startupMigrations.js";
import mongoose from "mongoose";

async function run() {
  await connectDB();

  const { leaveResult, attendanceResult } = await migratePaidLeaveType();
  console.log(`LeaveRequest: ${leaveResult.modifiedCount} document(s) "paid" -> "annual"`);
  console.log(`Attendance: ${attendanceResult.modifiedCount} document(s) lateHalfDayType "paid" -> "annual"`);

  await mongoose.connection.close();
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
