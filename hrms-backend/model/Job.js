import mongoose from "mongoose";

/**
 * Job — task 5.1: expand fields beyond the original title/department/
 * location/status/type/description/postedDate so a posting can carry a
 * full JD instead of living entirely in `description`.
 *
 * Additive only — every new field is optional with a safe default, so
 * existing postings (and the Job.jsx list / candidate pipeline, which
 * never read these) keep working unchanged.
 */
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
    // Job description (JD) — already existed pre-5.1, now actually
    // settable from AddJobModal (it wasn't wired to the form before).
    description: { type: String },
    // Requirements/qualifications, stored as one entry per bullet rather
    // than a single free-text blob so the frontend can render a real list.
    requirements: { type: [String], default: [] },
    // Perks/benefits, same one-entry-per-bullet shape as requirements.
    benefits: { type: [String], default: [] },
    // Pay range shown to candidates. All three optional/independent —
    // a posting can give a range, a single figure (min === max), or
    // omit pay entirely ("commensurate with experience").
    salaryMin: { type: Number, default: null, min: 0 },
    salaryMax: { type: Number, default: null, min: 0 },
    salaryCurrency: { type: String, default: "USD" },
    // Free-text "about the company" blurb shown on the posting.
    companyInfo: { type: String, default: "" },
    // How/where to apply — a URL, an email, or plain instructions. A full
    // form-builder is out of scope for this task's effort size; this is
    // the field HR fills in once and candidates see on the posting.
    applicationInstructions: { type: String, default: "" },
    // Application deadline. Purely informational today — nothing auto-closes
    // the posting when this passes; HR still flips `status` manually.
    deadline: { type: Date, default: null },
    postedDate: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export default mongoose.model("Job", jobSchema, "jobs");
