import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";
import { EmployeesAPI, DepartmentsAPI } from "../api";
import { translateApiError } from "../utils/apiError";

/**
 * MyDepartmentRedirect — MANAGER's and EMPLOYEE's "My Department" nav
 * destination.
 *
 * The Employee record's `department` field is a display name, not an id
 * (see utils/mappers.js), so this resolves name -> department id via
 * DepartmentsAPI.list() (open to any authenticated user, unrestricted read
 * — same as Holidays/Jobs/Candidates) and redirects into the same
 * departments/:id route HR/Admin use. departmentController.getDetail
 * enforces the real "only your own department" scoping server-side, so
 * this redirect is a convenience, not the security boundary.
 */
function MyDepartmentRedirect() {
  const { t } = useTranslation();
  const [departmentId, setDepartmentId] = useState(undefined); // undefined = loading, null = not found
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [profileRes, deptsRes] = await Promise.all([
          EmployeesAPI.myProfile(),
          DepartmentsAPI.list(),
        ]);
        if (cancelled) return;
        const myDeptName = profileRes.data?.department;
        const match = (deptsRes.items ?? []).find((d) => d.name === myDeptName);
        setDepartmentId(match ? match.id : null);
      } catch (err) {
        if (!cancelled) {
          setError(translateApiError(err, t) || t("employees.myDepartmentRedirect.loadFailed", { defaultValue: "Could not load your department." }));
          setDepartmentId(null);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [t]);

  if (departmentId === undefined) {
    return (
      <div style={{ padding: "var(--sp-6)", textAlign: "center", color: "var(--txt-secondary)", fontSize: "var(--fs-sm)" }}>
        {t("employees.myDepartmentRedirect.loading", { defaultValue: "Loading your department…" })}
      </div>
    );
  }

  if (departmentId === null) {
    return (
      <div style={{ padding: "var(--sp-6)", textAlign: "center", color: "var(--txt-secondary)", fontSize: "var(--fs-sm)" }}>
        {error || t("employees.myDepartmentRedirect.notLinked", { defaultValue: "You aren't linked to a department yet. Ask an admin to fix this." })}
      </div>
    );
  }

  return <Navigate to={`/departments/${departmentId}`} replace />;
}

export default MyDepartmentRedirect;
