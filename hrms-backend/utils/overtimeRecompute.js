/**
 * Derives every ot* field on an attendance record (DECISIONS.md D5). Used by
 * the close job, the approval hook and manual check-out edits, so it must be
 * idempotent: an approval can land the morning after the close, a request can
 * be approved, rejected and approved again. Every field is assigned from
 * scratch — there is no `+=` in this file, deliberately.
 */

import OvertimeRequestModel from "../model/OvertimeRequest.js";
import { OT_WORKDAY_START } from "./overtime.js";
import { parseHHMM, utcDateKey } from "./workday.js";
import { isHolidayOn } from "./holidayLookup.js";
import { parseHHMMEnd, resolveDayType, splitDayNightMinutes } from "./overtimeRate.js";

/**
 * @param {object} record   Mutable Attendance document.
 * @param {object|null} request  Anything not `status: "approved"` counts as no request.
 * @param {"normal"|"restDay"|"holiday"} options.dayType  Resolved by the caller (once per run for the close job).
 * @param {"clocked"|"planned"|"manual"} [options.evidence]  Set only by attendanceController.update, for hand-edited rows.
 * @returns {object} the same record, mutated.
 */
export function applyOvertimeToRecord(record, request, { dayType, evidence } = {}) {
  record.otMinutes = 0;
  record.otNightMinutes = 0;
  record.otUnapprovedMinutes = 0;
  record.otDayType = null;
  record.otEvidence = null;
  record.otRequest = null;

  const approved = request && request.status === "approved" ? request : null;

  // On a rest day or holiday there is no normal shift: overtime starts at check-in.
  const otWindowStart = dayType === "normal" ? OT_WORKDAY_START : record.checkIn;

  // Clock evidence beats the plan: checkOut may have been written by the close
  // job, so it cannot distinguish "stayed until 21:30" from "closed at 18:00".
  const evidencedEnd = record.rawCheckOut ?? record.checkOut;

  if (!otWindowStart || !evidencedEnd) return record;

  const otWindowStartMinutes = parseHHMM(otWindowStart);
  const evidencedEndMinutes = parseHHMMEnd(evidencedEnd);

  const workedOtMinutes = Math.max(0, evidencedEndMinutes - otWindowStartMinutes);
  if (workedOtMinutes === 0) return record;

  record.otDayType = dayType;

  if (!approved) {
    // Recorded, never paid, never counted against the caps.
    record.otUnapprovedMinutes = workedOtMinutes;
    return record;
  }

  // Paid overtime = approved window ∩ time actually worked.
  const windowStartMinutes = parseHHMM(approved.plannedStart);
  const windowEndMinutes = parseHHMMEnd(approved.plannedEnd);

  const paidStart = Math.max(otWindowStartMinutes, windowStartMinutes);
  const paidEnd = Math.min(evidencedEndMinutes, windowEndMinutes);

  const { dayMinutes, nightMinutes } = splitDayNightMinutes(paidStart, paidEnd);
  record.otMinutes = dayMinutes + nightMinutes;
  record.otNightMinutes = nightMinutes;

  // Worked past the boundary but outside the approved window (stayed later than approved, or started early on a rest day).
  record.otUnapprovedMinutes = workedOtMinutes - record.otMinutes;

  record.otRequest = approved._id ?? null;
  record.otEvidence = evidence ?? (record.rawCheckOut ? "clocked" : "planned");

  return record;
}

/**
 * Single-record wrapper that resolves day type and approved request itself.
 * The close job does not use it — it resolves both once for the whole batch.
 * Pass `request` when the caller already holds it (the approval hook does:
 * mid-review the in-memory document is authoritative, not the committed one).
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
