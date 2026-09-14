/**
 * The one holiday-matching idiom: an exact match on the UTC-midnight date
 * stored on Attendance and OvertimeRequest. Attendance and overtime both
 * resolve holidays through here so they cannot drift apart.
 */

import HolidayModel from "../model/Holiday.js";

export async function isHolidayOn(date) {
  return Boolean(await HolidayModel.findOne({ date }, "_id"));
}

export default isHolidayOn;
