import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    // null = broadcast to all users, per hrms_schema_docs.md
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    category: {
      type: String,
      enum: ["leave", "hiring", "payroll", "employee", "holiday", "system"],
      required: true,
    },
    title: { type: String, required: true },
    message: { type: String },
    read: { type: Boolean, default: false },
  },
  { timestamps: true },
);

notificationSchema.index({ user: 1, read: 1, category: 1 });

export default mongoose.model("Notification", notificationSchema, "notifications");
