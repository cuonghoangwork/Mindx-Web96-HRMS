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

    /* ── Attendance Overtime (M3) — additive; the status enum above is untouched ── */

    // The employee's own clock-out, written ONLY by a genuine clock-out
    // (attendanceController.checkOut) and never by the close job.
    //
    // This exists because the job overwrites `checkOut`. Without an approval on
    // file at 23:00 a record is auto-closed at 18:00, and if HR approves the
    // next morning the evidence that the employee actually stayed until 21:30
    // is already gone. `rawCheckOut` is what a late approval reads to credit
    // real hours instead of merely planned ones.
    rawCheckOut: { type: String, default: null },

    // All derived by utils/overtimeRecompute.js — never incremented in place.
    // Recomputing from the same inputs must always give the same answer, which
    // is what makes a late approval, a re-approval and a manual HR edit safe.
    otMinutes: { type: Number, default: 0 },
    otNightMinutes: { type: Number, default: 0 },

    // Time worked outside any approved window. Recorded, never paid, and never
    // counted toward the 40h/200h caps — uncompensated time does not consume a
    // legal allowance. It exists so HR can see who is working hours nobody
    // signed off on.
    otUnapprovedMinutes: { type: Number, default: 0 },

    otDayType: { type: String, enum: ["normal", "restDay", "holiday"], default: null },

    // What the credited overtime is based on: "clocked" = a real clock-out backs
    // it, "planned" = we are trusting the approved plan because the employee
    // never clocked out, "manual" = HR edited the record by hand. Lets the
    // approval queue distinguish clock proof from an assumption.
    otEvidence: { type: String, enum: ["clocked", "planned", "manual"], default: null },

    otRequest: { type: mongoose.Schema.Types.ObjectId, ref: "OvertimeRequest", default: null },
  },
  { timestamps: true },
);

attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });

export default mongoose.model("Attendance", attendanceSchema, "attendance");
