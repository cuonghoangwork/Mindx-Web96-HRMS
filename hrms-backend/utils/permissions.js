/**
 * permissions.js — Solo Gaps Milestone 3 (permissions matrix).
 *
 * hasCapability(role, capability) is a second gate, checked AFTER
 * authorize() has already coarse-allowed the request — it can only narrow
 * MANAGER further, never widen anything authorize()'s role list doesn't
 * already permit. ADMIN always passes; every other role always fails (they
 * either already passed authorize() with no capability check needed, or
 * authorize() already rejected them before this is ever called).
 *
 * No caching here — a plain findOne on a 4-row collection isn't worth a new
 * caching pattern this codebase doesn't otherwise have (getManagerDepartmentId,
 * called just as often per-request, does a fresh lookup every time too).
 */

import RolePermissionModel from "../model/RolePermission.js";

export const MANAGER_CAPABILITIES = [
  "approveLeaveRequests",
  "reviewProfileEdits",
  "manageAttendanceRecords",
  "proposePromotions",
];

export const CAPABILITY_DISABLED_MESSAGE =
  "This action has been disabled for your role by an administrator.";

export async function hasCapability(role, capability) {
  if (role === "ADMIN") return true;
  if (role !== "MANAGER") return false;

  const row = await RolePermissionModel.findOne({ role, capability });
  // No row yet (not seeded) — permissive default, so nothing changes until
  // an admin actually flips a switch.
  return row ? row.enabled : true;
}

/**
 * Ensures a row exists for every MANAGER_CAPABILITIES entry, defaulting to
 * enabled: true — nothing changes behaviorally until an admin flips one.
 * Idempotent per-row upsert (not a single global marker like
 * startupMigrations.js) so a capability added later just gets seeded on
 * the next boot without needing its own migration bump. Called from
 * index.js's boot sequence.
 */
export async function seedRolePermissions() {
  await Promise.all(
    MANAGER_CAPABILITIES.map((capability) =>
      RolePermissionModel.findOneAndUpdate(
        { role: "MANAGER", capability },
        { $setOnInsert: { enabled: true } },
        { upsert: true },
      ),
    ),
  );
}
