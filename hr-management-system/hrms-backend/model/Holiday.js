import mongoose from "mongoose";

const holidaySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    date: { type: Date, required: true },
    type: { type: String, enum: ["public", "company", "optional"], default: "public" },
  },
  { timestamps: true },
);

holidaySchema.index({ name: 1, date: 1 }, { unique: true });

export default mongoose.model("Holiday", holidaySchema, "holidays");
