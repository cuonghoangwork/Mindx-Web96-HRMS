/**
 * Idempotent data fixes that run before the app serves traffic. Each carries
 * its OWN marker in the `_migrations` collection: bumping a shared key would
 * re-run migrations that are unsafe to repeat (the MANAGER -> HR block below
 * would demote a MANAGER created since, whose department link is pending).
 */
import mongoose from "mongoose";
import LeaveRequestModel from "../model/LeaveRequest.js";
import AttendanceModel from "../model/Attendance.js";
import UserModel from "../model/User.js";
import AuditLogModel from "../model/AuditLog.js";
import { resolveEmployeeForUser } from "./managerScope.js";
import { logAction } from "./auditLog.js";

const MIGRATION_KEY = "2026-startup-migrations-v1";
const AUDIT_ACTOR_NAME_KEY = "2026-audit-actor-name-backfill-v1";

/** Runs `fn` unless its marker exists, then persists the marker. Returns whether it ran. */
async function once(key, fn) {
  const marker = mongoose.connection.db.collection("_migrations");
  if (await marker.findOne({ key })) return false;
  await fn();
  await marker.updateOne({ key }, { $set: { appliedAt: new Date() } }, { upsert: true });
  return true;
}

/**
 * "paid" -> "annual" leave-type rename. An unmigrated document fails
 * full-document validation on its next unrelated save, and is excluded from
 * per-type balance totals. Also run by scripts/migrateLeaveTypes.js.
 */
export async function migratePaidLeaveType() {
  const leaveResult = await LeaveRequestModel.updateMany({ type: "paid" }, { $set: { type: "annual" } });
  const attendanceResult = await AttendanceModel.updateMany(
    { lateHalfDayType: "paid" },
    { $set: { lateHalfDayType: "annual" } },
  );
  return { leaveResult, attendanceResult };
}

/**
 * Fills `actor.name` on audit rows written before the JWT carried a name, by
 * joining back to User. Never overwrites an existing name (it is a snapshot
 * of who the actor was at the time) and skips `actor.id: null` system rows.
 * Also run by scripts/backfillAuditActorNames.js.
 */
export async function backfillAuditActorNames() {
  const missingName = {
    "actor.id": { $ne: null },
    $or: [{ "actor.name": { $exists: false } }, { "actor.name": { $in: [null, ""] } }],
  };

  const actorIds = await AuditLogModel.distinct("actor.id", missingName);
  if (!actorIds.length) return { actors: 0, resolved: 0, updated: 0 };

  const users = await UserModel.find({ _id: { $in: actorIds }, name: { $nin: [null, ""] } }, "_id name");

  let updated = 0;
  for (const user of users) {
    const result = await AuditLogModel.updateMany(
      { ...missingName, "actor.id": user._id },
      { $set: { "actor.name": user.name } },
    );
    updated += result.modifiedCount;
  }

  // actors - resolved = hard-deleted accounts; their rows keep a null name.
  return { actors: actorIds.length, resolved: users.length, updated };
}

export async function runStartupMigrations() {
  await once(MIGRATION_KEY, runInitialMigrations);
  await once(AUDIT_ACTOR_NAME_KEY, backfillAuditActorNames);
}

async function runInitialMigrations() {
  await migratePaidLeaveType();

  // MANAGER/HR role split: a MANAGER whose Employee has no department cannot
  // be department-scoped (managerScope.js 403s), so it was the old combined
  // role acting as unscoped HR — promote it. One-time cleanup, not an
  // invariant: a MANAGER created later keeps the role while their department
  // link is pending.
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
}
