import mongoose from "mongoose";

/** A job posting. Every field beyond title/department/location/status/type is optional with a safe default. */
const jobSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: "Department" },
    location: { type: String },
    status: { type: String, enum: ["open", "filled", "closed"], default: "open" },
    type: {
      type: String,
      enum: ["full-time", "part-time", "contract", "intern"],
      default: "full-time",
    },
    description: { type: String },
    // One entry per bullet, so the frontend renders a real list.
    requirements: { type: [String], default: [] },
    benefits: { type: [String], default: [] },
    // A range, a single figure (min === max), or nothing.
    salaryMin: { type: Number, default: null, min: 0 },
    salaryMax: { type: Number, default: null, min: 0 },
    salaryCurrency: { type: String, default: "USD" },
    companyInfo: { type: String, default: "" },
    // A URL, an email, or plain instructions.
    applicationInstructions: { type: String, default: "" },
    // Informational — nothing auto-closes the posting; HR flips `status`.
    deadline: { type: Date, default: null },
    postedDate: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export default mongoose.model("Job", jobSchema, "jobs");
