/**
 * overtimeRecompute.js — Attendance Overtime, milestone M3.
 *
 * One function, three call sites. The rule that makes the whole feature safe:
 * **overtime is always derived, never incremented.**
 *
 *   1. jobs/closeAttendanceDay.js  -> autoCheckOut()
 *   2. controller/overtimeRequestController.js -> onApprove
 *   3. controller/attendanceController.js -> checkOut() and update()
 *
 * Written inline three times these would drift, and the drift would be
 * invisible: every path produces *a* number, just not the same one.
 *
 * Idempotence is the property that matters. Calling this twice with the same
 * inputs must give the same result, because all three of these really happen:
 * an approval lands the morning after the close job already wrote the record; a
 * request is approved, rejected, and approved again; HR corrects a check-out by
 * hand. Every field below is assigned from scratch on every call — there is no
 * `+=` anywhere in this file, deliberately.
 */

import OvertimeRequestModel from "../model/OvertimeRequest.js";
import { OT_WORKDAY_START } from "./overtime.js";
import { parseHHMM, utcDateKey } from "./workday.js";
import { isHolidayOn } from "./holidayLookup.js";
import { parseHHMMEnd, resolveDayType, splitDayNightMinutes } from "./overtimeRate.js";

/**
 * Recomputes every ot* field on `record` from its own clock times plus the
 * approved request (or its absence).
 *
 * @param {object} record   A mutable Attendance document.
 * @param {object|null} request  The overtime request for that employee/date.
 *   Anything not `status: "approved"` is treated as no request at all — a
 *   pending request earns nothing, which is the entire point of the queue.
 * @param {object} options
 * @param {"normal"|"restDay"|"holiday"} options.dayType  Resolved once per date
 *   by the caller, not looked up here: this stays free of a DB dependency, and
 *   the close job would otherwise re-query the Holiday collection once per
 *   record instead of once per run.
 * @param {"clocked"|"planned"|"manual"} [options.evidence]  Overrides the
 *   derived evidence. Only attendanceController.update passes this, to mark a
 *   record a human edited by hand.
 * @returns {object} the same record, mutated.
 */
export function applyOvertimeToRecord(record, request, { dayType, evidence } = {}) {
  // Reset first. Derived, never incremented — this is what makes a second call
  // with the same inputs a no-op instead of a doubling.
  record.otMinutes = 0;
  record.otNightMinutes = 0;
  record.otUnapprovedMinutes = 0;
  record.otDayType = null;
  record.otEvidence = null;
  record.otRequest = null;

  const approved = request && request.status === "approved" ? request : null;

  // Where the overtime portion of the day begins (plan §1.1):
  //   normal day        -> 18:00; there is a normal shift before that
  //   rest day/holiday  -> check-in; there is no normal shift, so the whole
  //                        worked span is overtime
  //
  // Getting this branch wrong is what made the original otUnapprovedMinutes
  // formula read zero on exactly the days it was meant to catch.
  const otWindowStart = dayType === "normal" ? OT_WORKDAY_START : record.checkIn;

  // Clock evidence beats the plan. rawCheckOut is written only by a genuine
  // employee clock-out; checkOut may have been overwritten by the close job,
  // so on its own it cannot distinguish "stayed until 21:30" from "the job
  // closed this at 18:00 because nothing was approved yet".
  const evidencedEnd = record.rawCheckOut ?? record.checkOut;

  if (!otWindowStart || !evidencedEnd) return record;

  const otWindowStartMinutes = parseHHMM(otWindowStart);
  const evidencedEndMinutes = parseHHMMEnd(evidencedEnd);

  // Everything worked past the boundary, approved or not.
  const workedOtMinutes = Math.max(0, evidencedEndMinutes - otWindowStartMinutes);
  if (workedOtMinutes === 0) return record;

  record.otDayType = dayType;

  if (!approved) {
    // Recorded, never paid, never counted against the 40h/200h caps —
    // uncompensated time does not consume a legal allowance. This is the
    // number that shows HR who is working hours nobody signed off on.
    record.otUnapprovedMinutes = workedOtMinutes;
    return record;
  }

  // Paid overtime is the intersection of what was approved with what the clock
  // supports. The two clamps do different jobs: the window cannot pay for time
  // outside the approval, and the evidence cannot pay for time not worked.
  const windowStartMinutes = parseHHMM(approved.plannedStart);
  const windowEndMinutes = parseHHMMEnd(approved.plannedEnd);

  const paidStart = Math.max(otWindowStartMinutes, windowStartMinutes);
  const paidEnd = Math.min(evidencedEndMinutes, windowEndMinutes);

  const { dayMinutes, nightMinutes } = splitDayNightMinutes(paidStart, paidEnd);
  record.otMinutes = dayMinutes + nightMinutes;
  record.otNightMinutes = nightMinutes;

  // Whatever was worked past the boundary but outside the approved window.
  // Usually zero. It is non-zero when someone stayed later than approved, or
  // clocked in before an approved rest-day window started — both genuinely
  // unapproved overtime, and both worth surfacing rather than rounding away.
  record.otUnapprovedMinutes = workedOtMinutes - record.otMinutes;

  record.otRequest = approved._id ?? null;
  record.otEvidence = evidence ?? (record.rawCheckOut ? "clocked" : "planned");

  return record;
}

/**
 * The single-record convenience wrapper: resolves the day type and the approved
 * request for this record's own employee/date, then applies the pure function
 * above.
 *
 * jobs/closeAttendanceDay.js deliberately does NOT use this. It closes every
 * open record in the company at once and resolves both pieces of context a
 * single time for the whole batch; going through here would re-query the
 * Holiday collection and the request collection once per employee.
 *
 * @param {object} options.request  Pass the request explicitly when the caller
 *   already has it (the approval hook does) - both to save a query and because
 *   during a review the in-memory document is the authoritative one, not what
 *   is still committed in the collection.
 */
export async function recomputeRecordOvertime(record, { evidence, request } = {}) {
  const employeeId = record.employee?._id ?? record.employee;
  const dayType = resolveDayType(utcDateKey(record.date), {
    isHoliday: await isHolidayOn(record.date),
  });
  const approved =
    request !== undefined
      ? request
      : await OvertimeRequestModel.findOne({
          employee: employeeId,
          date: record.date,
          status: "approved",
        });

  return applyOvertimeToRecord(record, approved, { dayType, evidence });
}

export default applyOvertimeToRecord;
