/**
 * RolePermission.js — Solo Gaps Milestone 3 (permissions matrix).
 *
 * A second, additional gate on top of authorize()'s coarse role-set check —
 * one row per (role, capability), toggleable by ADMIN. Deliberately can
 * only make a role STRICTER than authorize() already allows, never grant
 * anything wider: role's enum is restricted to "MANAGER" only, since
 * ADMIN is always full access and EMPLOYEE/HR are already excluded by
 * authorize() on every capability-gated route (see utils/permissions.js).
 */

import mongoose from "mongoose";

const rolePermissionSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ["MANAGER"], required: true },
    capability: { type: String, required: true },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

rolePermissionSchema.index({ role: 1, capability: 1 }, { unique: true });

export default mongoose.model("RolePermission", rolePermissionSchema, "rolePermissions");
