import mongoose from "mongoose";

const attendanceSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true },
    date: { type: Date, required: true },
    checkIn: { type: String, default: null },
    checkOut: { type: String, default: null },
    hours: { type: Number, default: 0 },
    status: {
      type: String,
      // "no-show" (task 4.6) is distinct from "absent": it's the status the end-of-day
      // closer assigns automatically when an employee has neither a check-in nor a
      // pending/approved LeaveRequest covering the date. "absent" remains available for
      // manual HR entry (e.g. backfilling a record, or a known-excused absence that
      // doesn't fit "on-leave"). 5 no-shows triggers an HR review flag (task 4.7).
      enum: ["present", "late", "on-leave", "absent", "no-show"],
      default: "present",
    },
    // Task 4.2: "late counts as half-day Annual/PTO leave or half-day unpaid leave". Set
    // only when status === "late", by the end-of-day closer (jobs/closeAttendanceDay.js),
    // based on whether the employee had >= 0.5 Annual/PTO days remaining at close time.
    // null for every other status.
    lateHalfDayType: { type: String, enum: ["annual", "unpaid"], default: null },
  },
  { timestamps: true },
);

attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });

export default mongoose.model("Attendance", attendanceSchema, "attendance");
