import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    // HR is company-wide; MANAGER is department-scoped (DECISIONS.md D12).
    role: { type: String, enum: ["ADMIN", "HR", "MANAGER", "EMPLOYEE"], default: "EMPLOYEE" },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", default: null },
    refreshToken: { type: String, default: null },
    mustChangePassword: { type: Boolean, default: false },
    // For copy rendered server-side (email, Telegram); in-app copy uses the UI toggle.
    language: { type: String, enum: ["en", "vi"], default: "vi" },
    // Out-of-app preferences. Desktop and push are per-device and live
    // elsewhere. A toggle here can only narrow notifyPolicy.js, never widen it (D7).
    notify: {
      // Opt-in: email reaches broadcasts, so `true` by default would mail the whole roster.
      email: { type: Boolean, default: false },
      telegram: { type: Boolean, default: false },
      telegramChatId: { type: String, default: null },
    },
  },
  { timestamps: true },
);

export default mongoose.model("User", userSchema, "users");
