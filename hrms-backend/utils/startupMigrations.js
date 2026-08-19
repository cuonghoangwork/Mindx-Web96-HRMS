/**
 * startupMigrations.js — idempotent data fixes that must have run before the
 * app serves traffic, so a deploy can never race a manual migration step
 * (both of these were previously "run this script by hand," which left a
 * window where stale data could hit code that assumes the migration already
 * happened). Guarded by a persisted marker (see MIGRATION_KEY below) so the
 * real work — a full collection scan on every restart — runs exactly once,
 * not on every boot forever.
 */
import mongoose from "mongoose";
import LeaveRequestModel from "../model/LeaveRequest.js";
import AttendanceModel from "../model/Attendance.js";
import UserModel from "../model/User.js";
import { resolveEmployeeForUser } from "./managerScope.js";
import { logAction } from "./auditLog.js";

const MIGRATION_KEY = "2026-startup-migrations-v1";

/**
 * Leave-type rename ("paid" -> "annual"; also called standalone from
 * scripts/migrateLeaveTypes.js so it can be run manually without a full
 * server boot). Without this, a pre-existing "paid" document fails
 * Mongoose's full-document validation the next time it's saved for any
 * unrelated reason (e.g. reviewQueue.js's review(), attendanceController's
 * checkOut()), and un-migrated documents are silently excluded from
 * leaveBalance.js's per-type usage totals.
 */
export async function migratePaidLeaveType() {
  const leaveResult = await LeaveRequestModel.updateMany({ type: "paid" }, { $set: { type: "annual" } });
  const attendanceResult = await AttendanceModel.updateMany(
    { lateHalfDayType: "paid" },
    { $set: { lateHalfDayType: "annual" } },
  );
  return { leaveResult, attendanceResult };
}

export async function runStartupMigrations() {
  const marker = mongoose.connection.db.collection("_migrations");
  if (await marker.findOne({ key: MIGRATION_KEY })) return;

  await migratePaidLeaveType();

  // MANAGER/HR role split: a MANAGER account whose linked Employee has no
  // department can't function as a department-scoped manager under the new
  // model (see managerScope.js, which 403s in that case), so it was
  // necessarily using the old combined role as unscoped HR — promote it. A
  // MANAGER whose Employee does have a department is left alone as a real
  // department-scoped manager. This is a one-time cleanup of legacy
  // accounts (guarded by the marker above), not an ongoing invariant check —
  // a MANAGER created after this migration runs keeps that role even before
  // their department is linked, since re-running this on every boot would
  // silently overwrite a fresh, intentional admin decision mid-onboarding.
  const staleManagers = await UserModel.find({ role: "MANAGER" }, "_id employee email");
  for (const user of staleManagers) {
    const employee = await resolveEmployeeForUser(user, "department");
    if (!employee?.department) {
      const result = await UserModel.updateOne(
        { _id: user._id, role: "MANAGER" },
        { $set: { role: "HR" } },
      );
      if (result.modifiedCount) {
        await logAction(null, {
          action: "role_migrated",
          resource: "user",
          resourceId: user._id,
          label: `${user.email}: MANAGER -> HR (linked employee has no department)`,
        });
      }
    }
  }

  await marker.updateOne({ key: MIGRATION_KEY }, { $set: { appliedAt: new Date() } }, { upsert: true });
}
