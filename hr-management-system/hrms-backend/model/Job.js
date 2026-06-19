import mongoose from "mongoose";

const jobSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: "Department" },
    // Not present in hrms_schema_docs.md, but the existing frontend (Jobs.jsx / AddJobModal)
    // already collects and displays a location string, so it's added here for compatibility.
    location: { type: String },
    status: { type: String, enum: ["open", "filled", "closed"], default: "open" },
    type: {
      type: String,
      enum: ["full-time", "part-time", "contract", "intern"],
      default: "full-time",
    },
    description: { type: String },
    postedDate: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export default mongoose.model("Job", jobSchema, "jobs");
