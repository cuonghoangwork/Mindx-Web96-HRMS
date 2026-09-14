import mongoose from "mongoose";

export const NOTIFICATION_AUDIENCES = ["all", "employees", "hr"];

/**
 * Adding a category needs a delivery decision in utils/notifyPolicy.js and
 * mirrored copy in utils/notifyI18n.js — tests/notifyPolicy.test.js and
 * tests/notifyI18n.test.js both derive their coverage from this list.
 */
export const NOTIFICATION_CATEGORIES = [
  "leave",
  "overtime",
  "hiring",
  "payroll",
  "employee",
  "holiday",
  "system",
  "announcement",
  "performance",
];

/**
 * Which broadcast audiences each role reads — one map for both the write
 * side and the read side. "hr" is the unscoped company-wide tier; MANAGER
 * is excluded because a broadcast carries no department, so anything a
 * manager needs is written as an addressed document (DECISIONS.md D8).
 */
const AUDIENCES_BY_ROLE = {
  ADMIN:    ["all", "hr"],
  HR:       ["all", "hr"],
  MANAGER:  ["all", "employees"],
  EMPLOYEE: ["all", "employees"],
};

/** Broadcast audiences visible to `role`. Unknown roles get the least-privileged set. */
export function broadcastAudiencesFor(role) {
  return AUDIENCES_BY_ROLE[role] ?? AUDIENCES_BY_ROLE.EMPLOYEE;
}

/** The inverse, derived rather than hand-maintained — used to turn a broadcast into recipients. */
export function rolesForAudience(audience) {
  return Object.keys(AUDIENCES_BY_ROLE).filter((role) =>
    AUDIENCES_BY_ROLE[role].includes(audience),
  );
}

const notificationSchema = new mongoose.Schema(
  {
    // null = broadcast, narrowed by `audience`; a user id = addressed notice (audience ignored).
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    audience: {
      type: String,
      enum: NOTIFICATION_AUDIENCES,
      default: "all",
    },
    category: {
      type: String,
      enum: NOTIFICATION_CATEGORIES,
      required: true,
    },
    title: { type: String, required: true },
    message: { type: String },
    // When set, the client renders notifications.generated.<key> with `params`
    // instead of the literal title/message, which remain the English fallback.
    titleKey: { type: String, default: null },
    messageKey: { type: String, default: null },
    params: { type: mongoose.Schema.Types.Mixed, default: null },
    read: { type: Boolean, default: false },
    link: { type: String, default: null },
    linkLabel: { type: String, default: null },
    sender: {
      id:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      name: { type: String, default: null },
    },
    isCustom: { type: Boolean, default: false },
  },
  { timestamps: true },
);

notificationSchema.index({ user: 1, read: 1, category: 1 });

export default mongoose.model("Notification", notificationSchema, "notifications");
