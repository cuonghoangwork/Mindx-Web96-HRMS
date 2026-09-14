/** Fire-and-forget audit writes. Never throws — a failed audit row must not break the request. */

import AuditLog from "../model/AuditLog.js";

/**
 * @param {import("express").Request | null} req  null or {} for request-less writes (jobs, migrations, the seeder) — recorded as the "system" actor
 * @param {{ action: string, resource: string, resourceId?: string|object, label?: string, changes?: object }} entry  `action` must be in AuditLog's enum
 */
export async function logAction(req, { action, resource, resourceId, label, changes } = {}) {
  try {
    const actor = req?.user
      ? { id: req.user.id, name: req.user.name, role: req.user.role }
      : { id: null, name: "system", role: "system" };

    await AuditLog.create({
      actor,
      action,
      resource,
      resourceId: resourceId ? String(resourceId) : undefined,
      label,
      changes,
    });
  } catch (err) {
    console.error("[AuditLog] Failed to write audit entry:", err.message);
  }
}

/** Shallow before/after diff of two flat client-shaped objects; undefined when nothing changed. */
export function diffChanges(before, after) {
  if (!before || !after) return undefined;
  const diff = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    const a = before[key];
    const b = after[key];
    if (String(a ?? "") !== String(b ?? "")) {
      diff[key] = { from: a ?? null, to: b ?? null };
    }
  }
  return Object.keys(diff).length ? diff : undefined;
}
