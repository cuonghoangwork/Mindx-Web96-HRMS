import mongoose from "mongoose";

export const NOTIFICATION_AUDIENCES = ["all", "employees", "hr"];

/**
 * Every category a notification may carry. Exported because utils/notifyPolicy.js
 * is keyed on these values and tests/notifyI18n.test.js derives its coverage
 * check from this list — a category added here with out-of-app channels but no
 * mirrored copy would otherwise ship an English Telegram message to a
 * Vietnamese reader, silently.
 *
 * "overtime" is separate from "leave" despite the identical review workflow,
 * because the two need to be tunable apart in notifyPolicy and because the
 * Notifications page filters on this value — folding overtime into "leave"
 * would hide it behind a tab labelled for something else.
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
 * Which broadcast audiences each role reads.
 *
 * Lives next to the enum on purpose: adding a fifth role, or a fourth
 * audience, forces a decision here about who receives it — one map so the
 * write side ("who is this for") and the read side ("what do I see") can't
 * drift into notices nobody ever receives.
 *
 * "hr" means the UNSCOPED company-wide tier, not "everyone who approves
 * things". MANAGER is deliberately excluded: it is department-scoped
 * (utils/managerScope.js) and a broadcast carries no department, so a
 * MANAGER reading "hr" would see every other department's hires, removals
 * and payroll runs. Notices a MANAGER genuinely needs are written as
 * targeted per-user documents instead, which can be scoped — see
 * leaveRequestController.create and jobs/performanceReminders.js.
 *
 * Exported from the model rather than the controller so the read path, the
 * write path and any future transport can share it without importing a
 * controller (an SSE hub that did would close an import cycle).
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

/**
 * The inverse: which roles read a given audience.
 *
 * Needed by out-of-app delivery, which has to turn a broadcast into an actual
 * list of people (utils/notify.js). DERIVED from the same map rather than
 * written out a second time — two hand-maintained tables facing opposite
 * directions is precisely how "the email went to the wrong people" happens.
 */
export function rolesForAudience(audience) {
  return Object.keys(AUDIENCES_BY_ROLE).filter((role) =>
    AUDIENCES_BY_ROLE[role].includes(audience),
  );
}

const notificationSchema = new mongoose.Schema(
  {
    // null = broadcast to all users, per hrms_schema_docs.md.
    // For targeted single-recipient notices, set this to that user's _id.
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    // When `user` is null (broadcast), `audience` narrows who it's for.
    // "all" = everyone (default/legacy behavior), "employees" = EMPLOYEE and
    // MANAGER, "hr" = HR and ADMIN. Ignored when `user` is set.
    // See AUDIENCES_BY_ROLE above for why MANAGER reads "employees", not "hr".
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
    // Optional translation keys for system-generated notifications — when set,
    // the frontend renders notifications.generated.<titleKey>.title /
    // <messageKey>.message (interpolated with `params`) instead of the literal
    // title/message above. title/message are still always populated as the
    // English fallback for old data and for anything reading them directly.
    titleKey: { type: String, default: null },
    messageKey: { type: String, default: null },
    params: { type: mongoose.Schema.Types.Mixed, default: null },
    read: { type: Boolean, default: false },
    // In-app navigation target for click-to-open notices, e.g. "/employees/64f..."
    link: { type: String, default: null },
    linkLabel: { type: String, default: null },
    // Who authored a manually-composed notice (null for system-generated ones)
    sender: {
      id:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      name: { type: String, default: null },
    },
    // True for notices an Admin/HR composed by hand, vs system-generated events
    isCustom: { type: Boolean, default: false },
  },
  { timestamps: true },
);

notificationSchema.index({ user: 1, read: 1, category: 1 });

export default mongoose.model("Notification", notificationSchema, "notifications");
