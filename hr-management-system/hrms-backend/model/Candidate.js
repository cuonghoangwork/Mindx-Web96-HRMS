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
    notes: { type: String },
    appliedDate: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export default mongoose.model("Candidate", candidateSchema, "candidates");
