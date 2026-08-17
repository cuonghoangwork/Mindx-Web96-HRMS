/**
 * startupMigrations.js — idempotent data fixes that must have run before the
 * app serves traffic, so a deploy can never race a manual migration step
 * (both of these were previously "run this script by hand," which left a
 * window where stale data could hit code that assumes the migration already
 * happened). Each fix only touches documents still holding the stale value,
 * so re-running on every boot is a cheap no-op once it's already applied.
 */
import LeaveRequestModel from "../model/LeaveRequest.js";
import AttendanceModel from "../model/Attendance.js";
import UserModel from "../model/User.js";
import EmployeeModel from "../model/Employee.js";

export async function runStartupMigrations() {
  // Leave-type rename ("paid" -> "annual"; see scripts/migrateLeaveTypes.js
  // for the standalone/manual version of this same fix). Without this, a
  // pre-existing "paid" document fails Mongoose's full-document validation
  // the next time it's saved for any unrelated reason (e.g. reviewQueue.js's
  // review(), attendanceController's checkOut()), and un-migrated documents
  // are silently excluded from leaveBalance.js's per-type usage totals.
  await LeaveRequestModel.updateMany({ type: "paid" }, { $set: { type: "annual" } });
  await AttendanceModel.updateMany({ lateHalfDayType: "paid" }, { $set: { lateHalfDayType: "annual" } });

  // MANAGER/HR role split: a MANAGER account whose linked Employee has no
  // department can't function as a department-scoped manager under the new
  // model (see managerScope.js, which 403s in that case), so it was
  // necessarily using the old combined role as unscoped HR — promote it. A
  // MANAGER whose Employee does have a department is left alone as a real
  // department-scoped manager.
  const staleManagers = await UserModel.find({ role: "MANAGER" }, "_id employee email");
  for (const user of staleManagers) {
    const employee = user.employee
      ? await EmployeeModel.findById(user.employee, "department")
      : await EmployeeModel.findOne({ email: user.email }, "department");
    if (!employee?.department) {
      await UserModel.updateOne({ _id: user._id }, { $set: { role: "HR" } });
    }
  }
}
