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
      // "no-show" is set by the close job; "absent" is entered by HR and is the one payroll deducts (DECISIONS.md D4).
      enum: ["present", "late", "on-leave", "absent", "no-show"],
      default: "present",
    },
    // Which balance a late day was charged to; set by the close job, null unless status is "late".
    lateHalfDayType: { type: String, enum: ["annual", "unpaid"], default: null },

    /* ── Overtime (DECISIONS.md D5) — every ot* field is derived by utils/overtimeRecompute.js ── */

    // The employee's genuine clock-out; never written by the close job, which
    // overwrites `checkOut`. A late approval reads this to credit real hours.
    rawCheckOut: { type: String, default: null },

    otMinutes: { type: Number, default: 0 },
    otNightMinutes: { type: Number, default: 0 },
    // Worked outside any approved window: recorded, never paid, never counted against the caps.
    otUnapprovedMinutes: { type: Number, default: 0 },
    otDayType: { type: String, enum: ["normal", "restDay", "holiday"], default: null },
    // "clocked" = a real clock-out backs it, "planned" = trusting the approved plan, "manual" = HR edited it.
    otEvidence: { type: String, enum: ["clocked", "planned", "manual"], default: null },

    otRequest: { type: mongoose.Schema.Types.ObjectId, ref: "OvertimeRequest", default: null },
  },
  { timestamps: true },
);

attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });

export default mongoose.model("Attendance", attendanceSchema, "attendance");
