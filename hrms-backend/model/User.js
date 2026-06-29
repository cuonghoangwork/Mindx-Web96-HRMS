import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    // EMPLOYEE  — default for all self-registered accounts
    // MANAGER   — promoted by ADMIN via /auth/users/:id/promote
    // ADMIN     — only via seed.js or direct DB entry; never self-assignable
    role: { type: String, enum: ["ADMIN", "MANAGER", "EMPLOYEE"], default: "EMPLOYEE" },
    // Optional link to an Employee profile record (1:1)
    employee: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", default: null },
    refreshToken: { type: String, default: null },
  },
  { timestamps: true },
);

export default mongoose.model("User", userSchema, "users");
