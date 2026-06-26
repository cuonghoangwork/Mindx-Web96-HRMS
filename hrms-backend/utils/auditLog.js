/**
 * auditLog.js — fire-and-forget helper used by every mutating controller.
 *
 * Usage:
 *   import { logAction } from "../utils/auditLog.js";
 *
 *   // Inside a controller, after the DB write succeeds:
 *   await logAction(req, {
 *     action:     "created",
 *     resource:   "employee",
 *     resourceId: employee._id,
 *     label:      `${employee.name} (${employee.employeeId})`,
 *   });
 *
 * The function never throws — a failed audit write must never break the
 * main request. Errors are logged to stderr only.
 */

import AuditLog from "../model/AuditLog.js";

/**
 * @param {import("express").Request} req
 * @param {{
 *   action: string,
 *   resource: string,
 *   resourceId?: string | object,
 *   label?: string,
 *   changes?: object,
 * }} entry
 */
export async function logAction(req, { action, resource, resourceId, label, changes } = {}) {
  try {
    const actor = req.user
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
    // Non-fatal — log to stderr, never surface to the client
    console.error("[AuditLog] Failed to write audit entry:", err.message);
  }
}

/**
 * Build a `changes` object by comparing two plain objects (before / after).
 * Only fields that actually changed are included.
 *
 * @param {object} before  — original values (flat, client-shaped)
 * @param {object} after   — new values (flat, client-shaped)
 * @returns {object|undefined}  undefined when nothing changed
 */
export function diffChanges(before, after) {
  if (!before || !after) return undefined;
  const diff = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    const a = before[key];
    const b = after[key];
    // Simple shallow comparison — good enough for flat HR records
    if (String(a ?? "") !== String(b ?? "")) {
      diff[key] = { from: a ?? null, to: b ?? null };
    }
  }
  return Object.keys(diff).length ? diff : undefined;
}
