import { useTranslation } from "react-i18next";
import Badge from "./Badge";

function capitalizeFirst(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * Leave-request status badge — pending / approved / rejected.
 *
 * Promoted here from two copies (F7): pages/employee/LeaveTab.jsx and
 * pages/dashboard/SelfServiceDashboard.jsx, which rendered the same leave
 * statuses in the same table shape.
 *
 * The two copies had DIVERGED, and this is the LeaveTab one. The dashboard's
 * copy built its label with `status.charAt(0).toUpperCase() + status.slice(1)`
 * — raw English, never translated — so a Vietnamese user saw "Approved" on the
 * dashboard and "Đã duyệt" on the employee page for the same request. Adopting
 * the translated version fixes that; it is a deliberate behaviour change, not
 * a pure move.
 *
 * The i18n keys live under editRequests.tabs rather than anywhere leave-shaped
 * because both features share the same three status words. That is reuse of a
 * translation, not of a concept — if leave statuses ever diverge from edit
 * request statuses, this needs its own keys.
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
