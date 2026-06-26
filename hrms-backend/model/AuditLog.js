import mongoose from "mongoose";

/**
 * AuditLog — records every mutating action performed through the API.
 *
 * Each document captures:
 *   actor     — who did it (User ObjectId + name snapshot)
 *   action    — verb: "created" | "updated" | "deleted" | "uploaded_avatar" |
 *               "checked_in" | "checked_out" | "status_changed" | "budget_updated"
 *   resource  — which collection was touched
 *   resourceId — the _id of the affected document (string so it survives deletions)
 *   label     — human-readable summary, e.g. "John Doe (EMP001)"
 *   changes   — optional before/after snapshot for updates
 *   timestamp — from Mongoose timestamps (createdAt)
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
