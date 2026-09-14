/**
 * Capability matrix. hasCapability() is a second gate after authorize(): it
 * can only narrow MANAGER further. ADMIN always passes; other roles always
 * fail here (authorize() already decided them). No caching — a findOne on a
 * 4-row collection.
 */

import RolePermissionModel from "../model/RolePermission.js";

export const MANAGER_CAPABILITIES = [
  "approveLeaveRequests",
  "reviewProfileEdits",
  "manageAttendanceRecords",
  "proposePromotions",
  "approveOvertimeRequests",
];

export const CAPABILITY_DISABLED_MESSAGE =
  "This action has been disabled for your role by an administrator.";

export async function hasCapability(role, capability) {
  if (role === "ADMIN") return true;
  if (role !== "MANAGER") return false;

  const row = await RolePermissionModel.findOne({ role, capability });
  // No row yet → permissive, so nothing changes until an admin flips a switch.
  return row ? row.enabled : true;
}

/** Per-row upsert at boot so a capability added later seeds itself; defaults to enabled. */
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
