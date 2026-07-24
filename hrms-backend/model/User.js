import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    role: { type: String, enum: ["ADMIN", "MANAGER", "EMPLOYEE"], default: "EMPLOYEE" },
    // Optional link to an Employee profile record (1:1)
    employee: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", default: null },
    refreshToken: { type: String, default: null },
    mustChangePassword: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export default mongoose.model("User", userSchema, "users");
