/**
 * One toggleable row per (role, capability) — a second gate after
 * authorize() that can only make MANAGER stricter, never wider. The role
 * enum is MANAGER only: ADMIN is always full access, and EMPLOYEE/HR are
 * already excluded by authorize() on every gated route.
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
