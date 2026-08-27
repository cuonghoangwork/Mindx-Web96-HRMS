import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    // null = broadcast to all users, per hrms_schema_docs.md.
    // For targeted single-recipient notices, set this to that user's _id.
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    // When `user` is null (broadcast), `audience` narrows who it's for.
    // "all" = everyone (default/legacy behavior), "employees" = EMPLOYEE role only,
    // "hr" = MANAGER + ADMIN only. Ignored when `user` is set.
    audience: {
      type: String,
      enum: ["all", "employees", "hr"],
      default: "all",
    },
    category: {
      type: String,
      enum: ["leave", "hiring", "payroll", "employee", "holiday", "system", "announcement", "performance"],
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
