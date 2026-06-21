import mongoose from "mongoose";

const employeeSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    age: { type: Number },
    gender: { type: String, enum: ["male", "female", "other"] },
    phone: { type: String },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    address: { type: String },
    department: { type: mongoose.Schema.Types.ObjectId, ref: "Department" },
    designation: { type: String },
    startDate: { type: Date },
    contractType: {
      type: String,
      enum: ["full-time", "part-time", "contract", "intern"],
      default: "full-time",
    },
    status: { type: String, enum: ["active", "on-leave", "terminated"], default: "active" },
    annualSalary: { type: Number, default: 0 },
    avatar: { type: String },
  },
  { timestamps: true },
);

employeeSchema.index({ department: 1, status: 1 });

export default mongoose.model("Employee", employeeSchema, "employees");
