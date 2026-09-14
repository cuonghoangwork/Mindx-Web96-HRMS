import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import { idsMatch } from "../utils/id";
import { translateApiError } from "../utils/apiError";
import { hhmmOf, hhmmToMinutes, isoOf } from "../utils/attendance";

/** Topbar "Clock in" chip — the same clockIn() the Attendance widget uses, always for the current user. */
function ClockInAction() {
  const { t } = useTranslation();
  const { employees, attendance, overtimeRequests, getAppNow, clockIn } = useStore();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const myEmployee = employees.find(
    (e) => e.email && user?.email && e.email.toLowerCase() === user.email.toLowerCase()
  ) || null;

  // No linked employee record: render disabled with a title rather than hide.
  if (!myEmployee) {
    return (
      <button type="button" className="clock-in-btn" disabled title={t("clockIn.noProfileTitle", { defaultValue: "No employee profile is linked to your account" })}>
        {t("clockIn.buttonDefault", { defaultValue: "Clock in" })}
      </button>
    );
  }

  const now = getAppNow();
  const todayStr = isoOf(now);
  const todayRecord = attendance.find(
    (r) => idsMatch(r.employeeId, myEmployee.id) && r.date === todayStr
  );
  const hasCheckedIn = Boolean(todayRecord?.checkIn);

  // Inside an approved overtime window the chip says how late they are
  // approved until. The window comes from the request, not a fixed 18:00 —
  // on a rest day overtime can start at any hour.
  const nowMinutes = hhmmToMinutes(hhmmOf(now));
  const activeOvertime =
    hasCheckedIn && nowMinutes !== null
      ? (overtimeRequests ?? []).find((r) => {
          if (r.status !== "approved" || r.date !== todayStr) return false;
          if (!idsMatch(r.employeeId, myEmployee.id)) return false;
          const start = hhmmToMinutes(r.plannedStart);
          const end = hhmmToMinutes(r.plannedEnd, { allowEndOfDay: true });
          return start !== null && end !== null && nowMinutes >= start && nowMinutes < end;
        })
      : null;

  const handleClick = async () => {
    if (hasCheckedIn || loading) return;
    setLoading(true);
    setError("");
    // hhmmOf, not getHours(): company time, not the browser's.
    const currentTimeHHMM = hhmmOf(now);
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
      title={
        error ||
        (activeOvertime
          ? t("clockIn.overtimeUntilTitle", {
              defaultValue: "Approved overtime until {{time}}",
              time: activeOvertime.plannedEnd,
            })
          : hasCheckedIn
            ? t("clockIn.clockedInAtTitle", { defaultValue: "Clocked in at {{time}}", time: todayRecord.checkIn })
            : t("clockIn.clockInTodayTitle", { defaultValue: "Clock in for today" }))
      }
    >
      {activeOvertime
        ? t("clockIn.overtimeUntil", { defaultValue: "OT until {{time}}", time: activeOvertime.plannedEnd })
        : hasCheckedIn
          ? t("clockIn.clockedIn", { defaultValue: "Clocked in {{time}}", time: todayRecord.checkIn })
          : loading
            ? t("clockIn.inProgress", { defaultValue: "Clocking in…" })
            : t("clockIn.buttonDefault", { defaultValue: "Clock in" })}
    </button>
  );
}

export default ClockInAction;
