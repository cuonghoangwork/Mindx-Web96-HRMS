import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    // HR = company-wide HR staff (unscoped). MANAGER = department-scoped line
    // manager (see utils/managerScope.js). Historically MANAGER did double
    // duty as both; HR was split out to give the department-scoping work a
    // real unscoped tier above it.
    role: { type: String, enum: ["ADMIN", "HR", "MANAGER", "EMPLOYEE"], default: "EMPLOYEE" },
    // Optional link to an Employee profile record (1:1)
    employee: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", default: null },
    refreshToken: { type: String, default: null },
    mustChangePassword: { type: Boolean, default: false },
    // Language for anything rendered SERVER-side and sent out of the app —
    // today just Telegram (utils/notifyI18n.js). In-app copy is translated in
    // the browser from the live UI toggle and never reads this; a Telegram
    // message has no browser to ask, so the preference has to be stored.
    language: { type: String, enum: ["en", "vi"], default: "vi" },
    /**
     * Out-of-app delivery preferences.
     *
     * Only channels the SERVER sends belong here. Desktop notifications are
     * deliberately absent: the browser owns that permission, so a flag on this
     * document would claim "on" for a device that never granted it (see
     * hrms-react/src/utils/desktopNotify.js). Web Push subscriptions get their
     * own collection for the same reason — they are per-device, not per-user.
     *
     * A user's toggle can only ever NARROW utils/notifyPolicy.js, never widen
     * it: that table decides what is allowed to leave the app at all.
     */
    notify: {
      telegram: { type: Boolean, default: false },
      telegramChatId: { type: String, default: null },
    },
  },
  { timestamps: true },
);

export default mongoose.model("User", userSchema, "users");
