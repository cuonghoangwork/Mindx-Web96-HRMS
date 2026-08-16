// Mirrors backend model/LeaveRequest.js's LEAVE_TYPES/LEAVE_TYPE_LABELS.
// Single source of truth for the frontend so the type picker and every
// display of a leave request's `type` use the same labels.
export const LEAVE_TYPES = ["annual", "sick", "parental", "bereavement", "unpaid"];

export const LEAVE_TYPE_LABELS = {
  annual: "Annual/PTO",
  sick: "Sick",
  parental: "Parental",
  bereavement: "Bereavement",
  unpaid: "Unpaid",
};

// Mirrors backend model/LeaveRequest.js's LEAVE_TYPE_ALLOWANCES. "unpaid" is
// intentionally absent — no cap, a missing key means "unlimited".
export const LEAVE_TYPE_ALLOWANCES = {
  annual: 12,
  sick: 10,
  parental: 90,
  bereavement: 5,
};

export const leaveTypeLabel = (type) => LEAVE_TYPE_LABELS[type] ?? type;
