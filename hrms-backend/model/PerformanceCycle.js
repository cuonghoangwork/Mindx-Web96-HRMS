import mongoose from "mongoose";

export const CYCLE_KINDS = ["standard", "custom"];
export const CYCLE_STATUSES = ["Open", "Closed"];

const performanceCycleSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    label: { type: String, required: true, trim: true },
    kind: { type: String, enum: CYCLE_KINDS, default: "standard" },
    status: { type: String, enum: CYCLE_STATUSES, default: "Open" },
    start: { type: Date, default: null },
    end: { type: Date, default: null },
    statusOverriddenAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

performanceCycleSchema.index({ kind: 1, start: -1 });

export default mongoose.model("PerformanceCycle", performanceCycleSchema, "performanceCycles");
