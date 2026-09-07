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
import AuditLogModel from "../model/AuditLog.js";
import { resolveEmployeeForUser } from "./managerScope.js";
import { logAction } from "./auditLog.js";

const MIGRATION_KEY = "2026-startup-migrations-v1";
// A SEPARATE key, deliberately — not a bump of MIGRATION_KEY to "-v2". Bumping
// would re-run everything under that key, and the MANAGER -> HR block below is
// explicitly documented as unsafe to repeat: it would demote a MANAGER created
// after the first run whose department link is still pending. Each migration
// therefore carries its own marker and is applied by once() independently.
const AUDIT_ACTOR_NAME_KEY = "2026-audit-actor-name-backfill-v1";

/**
 * Run `fn` unless its marker says it already ran, then persist the marker.
 * Returns whether the work was actually performed (used by the tests, and by
 * scripts/backfillAuditActorNames.js to report "already applied").
 */
async function once(key, fn) {
  const marker = mongoose.connection.db.collection("_migrations");
  if (await marker.findOne({ key })) return false;
  await fn();
  await marker.updateOne({ key }, { $set: { appliedAt: new Date() } }, { upsert: true });
  return true;
}

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

/**
 * Fills in `actor.name` on audit rows written before controller/authController.js
 * started signing `name` into the JWT (2026-09-07). Until then `req.user.name`
 * was always undefined, so utils/auditLog.js stored the actor's id and role but
 * no name — and because a missing name renders as "—" in the Settings audit
 * table and simply drops the " by X" suffix in auditLogController's dashboard
 * feed, nothing ever looked broken. The id was recorded throughout, so the name
 * is recoverable by joining back to User.
 *
 * Also called standalone from scripts/backfillAuditActorNames.js.
 *
 * Two things it deliberately does NOT touch:
 *   - rows that already have a name. That name is a SNAPSHOT of who the actor
 *     was at the time of the action; overwriting it with User.name today would
 *     rewrite history for anyone who has since been renamed.
 *   - rows with `actor.id: null`, which are the request-less writes stamped
 *     `name: "system"` by auditLog.js.
 *
 * Safe to re-run: the filter only matches rows still missing a name, so a
 * second pass matches nothing.
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

  // actors - resolved = actors whose User row is gone (hard-deleted account).
  // Their rows keep a null name, which is the honest answer: the name was
  // never recorded and there is nothing left to recover it from.
  return { actors: actorIds.length, resolved: users.length, updated };
}

export async function runStartupMigrations() {
  await once(MIGRATION_KEY, runInitialMigrations);
  await once(AUDIT_ACTOR_NAME_KEY, backfillAuditActorNames);
}

async function runInitialMigrations() {
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
}
