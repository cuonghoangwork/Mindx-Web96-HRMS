import mongoose from "mongoose";

/**
 * One row per mutating action: actor (id + name snapshot), action, resource,
 * resourceId (a string, so it survives deletion), label, optional
 * before/after `changes`. Adding an action needs an entry in the enum below.
 */
const auditLogSchema = new mongoose.Schema(
  {
    actor: {
      id:   { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      name: { type: String },
      role: { type: String },
    },
    action: {
      type: String,
      required: true,
      enum: [
        "created",
        "updated",
        "deleted",
        "uploaded_avatar",
        "checked_in",
        "checked_out",
        "status_changed",
        "budget_updated",
        "stage_changed",
        "login",
        "logout",
        "registered",
        // Written only by the startup MANAGER -> HR migration.
        "role_migrated",
      ],
    },
    resource: {
      type: String,
      required: true,
      enum: [
        "employee",
        "department",
        "job",
        "candidate",
        "holiday",
        "attendance",
        "notification",
        "user",
        "promotion",
        "payroll",
        "performance",
      ],
    },
    resourceId: { type: String },
    label:      { type: String },   // e.g. "Jane Smith (EMP002)" or "Engineering Dept"
    changes:    { type: mongoose.Schema.Types.Mixed }, // { field: { from, to } }
  },
  { timestamps: true },
);

// Indexes to support Dashboard feed (recent), filtered views, and cleanup
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ resource: 1, resourceId: 1 });
auditLogSchema.index({ "actor.id": 1 });

export default mongoose.model("AuditLog", auditLogSchema, "auditlogs");
