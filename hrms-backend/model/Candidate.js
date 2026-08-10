import mongoose from "mongoose";

const candidateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String },
    job: { type: mongoose.Schema.Types.ObjectId, ref: "Job", required: true },
    stage: {
      type: String,
      enum: ["applied", "screening", "interview", "offer", "hired", "rejected"],
      default: "applied",
    },
    rating: { type: Number, min: 0, max: 5, default: 0 },
    resumeUrl: { type: String },
    // Task 5.3 — real PDF CV upload (reuses the Cloudinary + multer pattern
    // from employee contract uploads, task 1.4). resumeUrl still doubles as
    // a manually-settable link (see candidateFromClient) for seed/back-compat,
    // but a real upload additionally stamps this timestamp so the UI can
    // tell "someone pasted a link" apart from "a file was actually uploaded".
    resumeUploadedAt: { type: Date, default: null },
    notes: { type: String },
    appliedDate: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export default mongoose.model("Candidate", candidateSchema, "candidates");
