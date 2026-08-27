import { LEAVE_TYPES, leaveTypeLabel } from "./leaveTypes";
import { positionLevelLabel } from "./positionLevels";

function translateJoinedList(value, translateOne) {
  return value.split(", ").map(translateOne).join(", ");
}

// Translates a backend error into the current UI language. `err.code` is a
// stable machine-readable code the backend attaches alongside its English
// `message` (see hrms-backend/utils/appError.js); we look it up under
// common.errors.<code> and fall back to the raw English message when the
// code is missing or not yet translated — same defaultValue safety net used
// by every other t() call in this app.
export function translateApiError(err, t) {
  if (!err) return "";
  if (err.code) {
    const params = { ...(err.params || {}) };
    // A handful of error codes carry the raw leave-type enum key (e.g.
    // INSUFFICIENT_LEAVE_BALANCE) rather than plain data — translate it
    // before interpolating, same as notifications.js's localizeParams does
    // for the `leaveType` notification param.
    if (LEAVE_TYPES.includes(params.type)) params.type = leaveTypeLabel(params.type, t);
    if (typeof params.level === "string") params.level = positionLevelLabel(params.level, t);
    if (typeof params.status === "string") {
      params.status = t(`common.payrollStatus.${params.status}`, { defaultValue: params.status });
    }
    // A few error codes carry a comma-joined list of raw enum/field keys
    // rather than a single value — translate each entry too.
    if (typeof params.types === "string") {
      params.types = translateJoinedList(params.types, (v) => leaveTypeLabel(v, t));
    }
    if (typeof params.levels === "string") {
      params.levels = translateJoinedList(params.levels, (v) => positionLevelLabel(v, t));
    }
    if (typeof params.fields === "string") {
      params.fields = translateJoinedList(params.fields, (v) => t(`common.fieldLabels.${v}`, { defaultValue: v }));
    }
    if (typeof params.statuses === "string") {
      params.statuses = translateJoinedList(params.statuses, (v) => t(`common.payrollStatus.${v}`, { defaultValue: v }));
    }
    if (typeof params.capabilities === "string") {
      params.capabilities = translateJoinedList(params.capabilities, (v) =>
        t(`settings.permissions.capabilities.${v}`, { defaultValue: v }),
      );
    }
    return t(`common.errors.${err.code}`, { ...params, defaultValue: err.message });
  }
  return err.message || "";
}
