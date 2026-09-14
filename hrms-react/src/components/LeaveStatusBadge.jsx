import { useTranslation } from "react-i18next";
import Badge from "./Badge";

function capitalizeFirst(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * Leave-request status badge — pending / approved / rejected, translated.
 * The i18n keys are shared with edit-request statuses (same three words);
 * if the two ever diverge, this needs its own keys.
 */
export function LeaveStatusBadge({ status }) {
  const { t } = useTranslation();
  const variant = status === "approved" ? "success" : status === "rejected" ? "danger" : "warning";
  const label = status
    ? capitalizeFirst(t(`employees.allEmployees.editRequests.tabs.${status}`, { defaultValue: status }))
    : "—";
  return <Badge variant={variant} size="sm" dot>{label}</Badge>;
}

export default LeaveStatusBadge;
