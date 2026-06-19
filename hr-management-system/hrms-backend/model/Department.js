import mongoose from "mongoose";

const departmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    manager: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", default: null },
    // Not in hrms_schema_docs.md - added because the frontend's AddDepartmentModal collects
    // the manager as free text with no employee picker. See utils/refResolvers.js.
    managerName: { type: String, default: null, trim: true },
    budget: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export default mongoose.model("Department", departmentSchema, "departments");
