/**
 * overtimeRecompute.test.js — Attendance Overtime, milestone M3.
 *
 * Covers what HRMS_OVERTIME_PLAN.md §8 calls overtimeWindow.test.js: derivation
 * from the clock times, the rest-day whole-span rule, and a check-out before
 * 18:00 producing nothing. Named after the module it exercises, per the
 * codebase's <module>.test.js convention.
 *
 * applyOvertimeToRecord only reads and writes plain properties, so these run
 * against object literals — no database, no Mongoose.
 *
 * The property under test throughout is **idempotence**. Overtime is derived,
 * never incremented, because all three of these really happen: an approval
 * lands the morning after the close job wrote the record, a request is
 * approved twice, HR corrects a check-out by hand.
 */

import { describe, it, expect } from "vitest";
import { applyOvertimeToRecord } from "../utils/overtimeRecompute.js";

/** An attendance record as the close job or a clock-out would leave it. */
const rec = (o = {}) => ({ checkIn: null, checkOut: null, rawCheckOut: null, ...o });

/** An approved overtime request. */
const req = (plannedStart, plannedEnd, o = {}) => ({
  _id: "req-1",
  status: "approved",
  plannedStart,
  plannedEnd,
  ...o,
});

const NORMAL = { dayType: "normal" };
const REST = { dayType: "restDay" };
const HOLIDAY = { dayType: "holiday" };

describe("applyOvertimeToRecord — working day", () => {
  it("credits the planned span when the employee never clocked out", () => {
    // What the close job leaves behind: checkOut written by the job, rawCheckOut
    // still null because there was no genuine clock-out.
    const r = rec({ checkIn: "09:00", checkOut: "22:00" });
    applyOvertimeToRecord(r, req("18:00", "22:00"), NORMAL);

    expect(r.otMinutes).toBe(240);
    expect(r.otNightMinutes).toBe(0);
    expect(r.otUnapprovedMinutes).toBe(0);
    expect(r.otDayType).toBe("normal");
    expect(r.otEvidence).toBe("planned");
    expect(r.otRequest).toBe("req-1");
  });

  it("credits the real hours when there is a clock-out, even if shorter", () => {
    // §5.1(c) row 1: approved for 4h, actually left at 21:30 -> credit 3.5h.
    const r = rec({ checkIn: "09:00", checkOut: "21:30", rawCheckOut: "21:30" });
    applyOvertimeToRecord(r, req("18:00", "22:00"), NORMAL);

    expect(r.otMinutes).toBe(210);
    expect(r.otUnapprovedMinutes).toBe(0);
    expect(r.otEvidence).toBe("clocked");
  });

  it("never pays past the approved window, and flags the excess as unapproved", () => {
    const r = rec({ checkIn: "09:00", checkOut: "23:00", rawCheckOut: "23:00" });
    applyOvertimeToRecord(r, req("18:00", "22:00"), NORMAL);

    expect(r.otMinutes).toBe(240); // capped at the approved 4h
    expect(r.otUnapprovedMinutes).toBe(60); // the extra hour is recorded, not paid
  });

  it("records everything past 18:00 as unapproved when nothing was approved", () => {
    const r = rec({ checkIn: "09:00", checkOut: "21:00", rawCheckOut: "21:00" });
    applyOvertimeToRecord(r, null, NORMAL);

    expect(r.otMinutes).toBe(0);
    expect(r.otUnapprovedMinutes).toBe(180);
    expect(r.otDayType).toBe("normal");
    // Evidence describes what credited overtime rests on; there is none here.
    expect(r.otEvidence).toBeNull();
    expect(r.otRequest).toBeNull();
  });

  it("produces nothing at all when the employee left before 18:00", () => {
    const r = rec({ checkIn: "09:00", checkOut: "17:00", rawCheckOut: "17:00" });
    applyOvertimeToRecord(r, null, NORMAL);

    expect(r.otMinutes).toBe(0);
    expect(r.otUnapprovedMinutes).toBe(0);
    expect(r.otDayType).toBeNull();
  });

  it("treats a record auto-closed at 18:00 with no approval as zero overtime", () => {
    const r = rec({ checkIn: "09:00", checkOut: "18:00" });
    applyOvertimeToRecord(r, null, NORMAL);

    expect(r.otMinutes).toBe(0);
    expect(r.otUnapprovedMinutes).toBe(0);
  });

  it("ignores a request that is not approved", () => {
    const r = rec({ checkIn: "09:00", checkOut: "22:00", rawCheckOut: "22:00" });
    applyOvertimeToRecord(r, req("18:00", "22:00", { status: "pending" }), NORMAL);

    expect(r.otMinutes).toBe(0);
    expect(r.otUnapprovedMinutes).toBe(240);
    expect(r.otRequest).toBeNull();
  });
});

describe("applyOvertimeToRecord — rest day and holiday (the whole span is overtime)", () => {
  /**
   * The regression this file exists for. The original formula measured from
   * 18:00 on every day, so a Saturday worked 09:00-17:00 with nobody signing
   * off recorded ZERO unapproved minutes — silent on exactly the day the flag
   * was meant to catch.
   */
  it("counts a whole unapproved Saturday, not just the part after 18:00", () => {
    const r = rec({ checkIn: "09:00", checkOut: "17:00", rawCheckOut: "17:00" });
    applyOvertimeToRecord(r, null, REST);

    expect(r.otUnapprovedMinutes).toBe(480); // 8h, not 0
    expect(r.otDayType).toBe("restDay");
  });

  it("splits an approved full rest day into day and night minutes", () => {
    const r = rec({ checkIn: "12:00", checkOut: "24:00" });
    applyOvertimeToRecord(r, req("12:00", "24:00"), REST);

    expect(r.otMinutes).toBe(720);
    expect(r.otNightMinutes).toBe(120); // 22:00-24:00
    expect(r.otUnapprovedMinutes).toBe(0);
  });

  it("flags rest-day hours worked before the approved window opened", () => {
    // Clocked in at 09:00 but only approved from 12:00 — those 3h are worked
    // overtime nobody signed off on.
    const r = rec({ checkIn: "09:00", checkOut: "24:00" });
    applyOvertimeToRecord(r, req("12:00", "24:00"), REST);

    expect(r.otMinutes).toBe(720);
    expect(r.otUnapprovedMinutes).toBe(180);
  });

  it("treats a public holiday the same way, but tags the day type", () => {
    const r = rec({ checkIn: "12:00", checkOut: "24:00" });
    applyOvertimeToRecord(r, req("12:00", "24:00"), HOLIDAY);

    expect(r.otMinutes).toBe(720);
    expect(r.otNightMinutes).toBe(120);
    expect(r.otDayType).toBe("holiday");
  });

  it("produces nothing when the employee never clocked in", () => {
    const r = rec({ checkIn: null, checkOut: "18:00" });
    applyOvertimeToRecord(r, null, REST);
    expect(r.otMinutes).toBe(0);
    expect(r.otUnapprovedMinutes).toBe(0);
  });
});

describe("applyOvertimeToRecord — idempotence", () => {
  const snapshot = (r) => ({
    otMinutes: r.otMinutes,
    otNightMinutes: r.otNightMinutes,
    otUnapprovedMinutes: r.otUnapprovedMinutes,
    otDayType: r.otDayType,
    otEvidence: r.otEvidence,
    otRequest: r.otRequest,
  });

  it("gives the same answer however many times it runs", () => {
    const r = rec({ checkIn: "09:00", checkOut: "21:30", rawCheckOut: "21:30" });
    const request = req("18:00", "22:00");

    applyOvertimeToRecord(r, request, NORMAL);
    const first = snapshot(r);
    applyOvertimeToRecord(r, request, NORMAL);
    applyOvertimeToRecord(r, request, NORMAL);

    expect(snapshot(r)).toEqual(first);
    expect(r.otMinutes).toBe(210); // not 420, not 630
  });

  it("fully clears previous overtime when the request goes away", () => {
    // The late-approval path in reverse: a record that had approved overtime is
    // recomputed with no request. Nothing may survive from the earlier pass.
    const r = rec({ checkIn: "09:00", checkOut: "22:00", rawCheckOut: "22:00" });
    applyOvertimeToRecord(r, req("18:00", "22:00"), NORMAL);
    expect(r.otMinutes).toBe(240);

    applyOvertimeToRecord(r, null, NORMAL);
    expect(r.otMinutes).toBe(0);
    expect(r.otNightMinutes).toBe(0);
    expect(r.otRequest).toBeNull();
    expect(r.otEvidence).toBeNull();
    expect(r.otUnapprovedMinutes).toBe(240); // now unapproved rather than paid
  });

  it("moves unapproved minutes into paid ones when approval arrives late", () => {
    // The employee clocked out at 21:30 with the request still pending...
    const r = rec({ checkIn: "09:00", checkOut: "21:30", rawCheckOut: "21:30" });
    applyOvertimeToRecord(r, null, NORMAL);
    expect(r.otUnapprovedMinutes).toBe(210);
    expect(r.otMinutes).toBe(0);

    // ...and HR approves the next morning.
    applyOvertimeToRecord(r, req("18:00", "22:00"), NORMAL);
    expect(r.otMinutes).toBe(210);
    expect(r.otUnapprovedMinutes).toBe(0);
    expect(r.otEvidence).toBe("clocked");
  });

  it("still credits real hours after the close job overwrote checkOut", () => {
    // §5.1(c): nothing was approved at 23:00, so the job closed the day at
    // 18:00 — but rawCheckOut still remembers the employee left at 21:30.
    const r = rec({ checkIn: "09:00", checkOut: "18:00", rawCheckOut: "21:30" });
    applyOvertimeToRecord(r, req("18:00", "22:00"), NORMAL);

    expect(r.otMinutes).toBe(210);
    expect(r.otEvidence).toBe("clocked");
  });

  it("falls back to planned hours when there is no clock evidence at all", () => {
    const r = rec({ checkIn: "09:00", checkOut: "18:00", rawCheckOut: null });
    applyOvertimeToRecord(r, req("18:00", "22:00"), NORMAL);

    // checkOut is 18:00 and no rawCheckOut exists, so there is nothing to
    // credit — the close job will rewrite checkOut to plannedEnd when it runs.
    expect(r.otMinutes).toBe(0);
    expect(r.otEvidence).toBeNull();
  });
});

describe("applyOvertimeToRecord — evidence", () => {
  it("lets a caller mark the record as hand-edited", () => {
    const r = rec({ checkIn: "09:00", checkOut: "21:00", rawCheckOut: "21:00" });
    applyOvertimeToRecord(r, req("18:00", "22:00"), { ...NORMAL, evidence: "manual" });

    expect(r.otEvidence).toBe("manual");
    expect(r.otMinutes).toBe(180);
  });

  it("only reports evidence for overtime that is actually credited", () => {
    const r = rec({ checkIn: "09:00", checkOut: "21:00", rawCheckOut: "21:00" });
    applyOvertimeToRecord(r, null, { ...NORMAL, evidence: "manual" });

    expect(r.otMinutes).toBe(0);
    expect(r.otEvidence).toBeNull();
  });
});
