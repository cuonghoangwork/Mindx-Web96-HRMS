import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { EmployeesAPI, DepartmentsAPI } from "../api";

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
          setError(err.message || "Could not load your department.");
          setDepartmentId(null);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (departmentId === undefined) {
    return (
      <div style={{ padding: "var(--sp-6)", textAlign: "center", color: "var(--txt-secondary)", fontSize: "var(--fs-sm)" }}>
        Loading your department…
      </div>
    );
  }

  if (departmentId === null) {
    return (
      <div style={{ padding: "var(--sp-6)", textAlign: "center", color: "var(--txt-secondary)", fontSize: "var(--fs-sm)" }}>
        {error || "You aren't linked to a department yet. Ask an admin to fix this."}
      </div>
    );
  }

  return <Navigate to={`/departments/${departmentId}`} replace />;
}

export default MyDepartmentRedirect;
