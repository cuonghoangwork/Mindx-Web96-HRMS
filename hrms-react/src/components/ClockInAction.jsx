import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import { idsMatch } from "../utils/id";
import { translateApiError } from "../utils/apiError";

/**
 * ClockInAction — topbar "Clock in" quick action, matching the mockup's
 * button.brand-style Clock in chip. Reuses the exact same clockIn() call
 * ClockInOutWidget (Attendance.jsx) already uses — not a new endpoint,
 * just a shortcut to the same real action from the topbar.
 *
 * Resolves the logged-in user's own employee record by email (same
 * pattern as ClockInOutWidget), so it only ever clocks in the current
 * user, never picks an employee on their behalf.
 */
function ClockInAction() {
  const { t } = useTranslation();
  const { employees, attendance, getAppNow, clockIn } = useStore();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const myEmployee = employees.find(
    (e) => e.email && user?.email && e.email.toLowerCase() === user.email.toLowerCase()
  ) || null;

  // No linked employee record (e.g. a pure admin account) — the mockup
  // still always shows this chip in the topbar, so render it disabled
  // with an explanatory title instead of hiding it entirely.
  if (!myEmployee) {
    return (
      <button type="button" className="clock-in-btn" disabled title={t("clockIn.noProfileTitle", { defaultValue: "No employee profile is linked to your account" })}>
        {t("clockIn.buttonDefault", { defaultValue: "Clock in" })}
      </button>
    );
  }

  const now = getAppNow();
  const todayStr = now.toISOString().split("T")[0];
  const todayRecord = attendance.find(
    (r) => idsMatch(r.employeeId, myEmployee.id) && r.date === todayStr
  );
  const hasCheckedIn = Boolean(todayRecord?.checkIn);

  const handleClick = async () => {
    if (hasCheckedIn || loading) return;
    setLoading(true);
    setError("");
    const currentTimeHHMM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    try {
      await clockIn(myEmployee.id, todayStr, currentTimeHHMM);
    } catch (err) {
      setError(translateApiError(err, t) || t("clockIn.failedGeneric", { defaultValue: "Failed to clock in" }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      className="clock-in-btn"
      onClick={handleClick}
      disabled={hasCheckedIn || loading}
      title={error || (hasCheckedIn ? t("clockIn.clockedInAtTitle", { defaultValue: "Clocked in at {{time}}", time: todayRecord.checkIn }) : t("clockIn.clockInTodayTitle", { defaultValue: "Clock in for today" }))}
    >
      {hasCheckedIn ? t("clockIn.clockedIn", { defaultValue: "Clocked in {{time}}", time: todayRecord.checkIn }) : loading ? t("clockIn.inProgress", { defaultValue: "Clocking in…" }) : t("clockIn.buttonDefault", { defaultValue: "Clock in" })}
    </button>
  );
}

export default ClockInAction;
