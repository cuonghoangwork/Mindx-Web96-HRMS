// One-off migration — renames the old 2-value LeaveRequest/Attendance leave
// type ("paid") to the new 5-type model's "annual" (same policy, 12 days/
// year, just renamed to make room for sick/parental/bereavement as their
// own distinct types). "unpaid" is unchanged in both models.
//
// Safe to re-run: only matches documents still holding the literal "paid"
// value, so a second run is a no-op.
//
// Usage:
//   cd hrms-backend
//   node scripts/migrateLeaveTypes.js            (uses .env.dev)
//   NODE_ENV=prod node scripts/migrateLeaveTypes.js

import dotenv from "dotenv";
const env = process.env.NODE_ENV || "dev";
dotenv.config({ path: `.env.${env}` });

import { connectDB } from "../config/db.js";
import LeaveRequestModel from "../model/LeaveRequest.js";
import AttendanceModel from "../model/Attendance.js";
import mongoose from "mongoose";

async function run() {
  await connectDB();

  const leaveResult = await LeaveRequestModel.updateMany(
    { type: "paid" },
    { $set: { type: "annual" } },
  );
  console.log(`LeaveRequest: ${leaveResult.modifiedCount} document(s) "paid" -> "annual"`);

  const attendanceResult = await AttendanceModel.updateMany(
    { lateHalfDayType: "paid" },
    { $set: { lateHalfDayType: "annual" } },
  );
  console.log(`Attendance: ${attendanceResult.modifiedCount} document(s) lateHalfDayType "paid" -> "annual"`);

  await mongoose.connection.close();
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
