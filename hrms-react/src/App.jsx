import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import ChunkErrorBoundary from "./components/ChunkErrorBoundary";
import Login from "./pages/Login";

// Login stays a static import: it is what an unauthenticated visitor sees
// first, so route-splitting it would only add a network round trip to the one
// page that cannot afford it. Every other page is loaded on navigation.
//
// The chunks these produce are content-hashed, which is what makes
// ChunkErrorBoundary above a requirement rather than a nicety — see that file
// for why a redeploy can otherwise white-screen an already-open tab.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const AllEmployees = lazy(() => import("./pages/AllEmployees"));
const ViewEmployee = lazy(() => import("./pages/ViewEmployee"));
const AddEmployee = lazy(() => import("./pages/AddEmployee"));
const Attendance = lazy(() => import("./pages/Attendance"));
const Performance = lazy(() => import("./pages/Performance"));
const Payroll = lazy(() => import("./pages/Payroll"));
const Jobs = lazy(() => import("./pages/Jobs"));
const Candidates = lazy(() => import("./pages/Candidates"));
const Holidays = lazy(() => import("./pages/Holidays"));
const Settings = lazy(() => import("./pages/Settings"));
const Notifications = lazy(() => import("./pages/Notifications"));
const AllDepartments = lazy(() => import("./pages/AllDepartments"));
const ViewDepartment = lazy(() => import("./pages/ViewDepartment"));
const MyDepartmentRedirect = lazy(() => import("./pages/MyDepartmentRedirect"));
const OrgChart = lazy(() => import("./pages/OrgChart"));
const Register = lazy(() => import("./pages/Register"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const EnterOTP = lazy(() => import("./pages/EnterOTP"));
const LoginSuccessful = lazy(() => import("./pages/LoginSuccessful"));
const ChangePassword = lazy(() => import("./pages/ChangePassword"));

function FullPageLoading() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg-page)" }}>
      <span style={{ color: "var(--txt-secondary)", fontSize: "var(--fs-md)" }}>Loading…</span>
    </div>
  );
}

function RegisterRoute() {
  const { isAuthenticated, publicRegistration, configLoading } = useAuth();
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  if (configLoading) return <FullPageLoading />;
  if (!publicRegistration) return <Navigate to="/login" replace />;
  return <Register />;
}

function App() {
  const { isAuthenticated } = useAuth();

  return (
    // This Suspense serves the public auth routes. Pages inside the app shell
    // resolve against a nearer boundary in Layout.jsx, which keeps the sidebar
    // and header mounted while a route chunk loads instead of blanking the
    // whole window on every navigation.
    <ChunkErrorBoundary>
      <Suspense fallback={<FullPageLoading />}>
        <Routes>
          {/* Public auth routes */}
          <Route
            path="/login"
            element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />}
          />
          <Route path="/register" element={<RegisterRoute />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/enter-otp" element={<EnterOTP />} />
          <Route path="/login-successful" element={<LoginSuccessful />} />

          <Route
            path="/change-password"
            element={
              <ProtectedRoute>
                <ChangePassword />
              </ProtectedRoute>
            }
          />

          {/* Protected app shell */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />

            {/* ── All authenticated users ── */}
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="attendance" element={<Attendance />} />
            {/* Performance Reviews: every role has at least their own review
                (ADMIN/HR/MANAGER also review reports), so no ProtectedRoute
                guard — same as attendance/notifications above. Roster/review
                visibility itself is scoped server-side (see the API contract). */}
            <Route path="performance" element={<Performance />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="settings" element={<Settings />} />

            {/* View own profile — ProtectedRoute with no extra role; controller enforces own-only for EMPLOYEE */}
            <Route path="employees/:id" element={<ViewEmployee />} />

            {/* Directory — company-wide roster, open to every authenticated
                role (employeeController.getAll's read has always been
                unscoped for everyone, see its comment); AllEmployees.jsx's
                isPlainManager/isPlainEmployee checks degrade write actions and
                the Salary field down to what each role can actually do/see. */}
            <Route path="employees" element={<AllEmployees />} />

            {/* "My Department" — MANAGER's and EMPLOYEE's demo-parity route to
                their own department's page. Resolves their department id then
                redirects into the same departments/:id route HR/Admin use.
                Open to any authenticated user (like employees/:id above) —
                departmentController's getDetail enforces the real
                own-department-only scoping for both MANAGER and EMPLOYEE
                server-side, and ViewDepartment.jsx's edit/promote/delete
                controls already degrade to read-only below isHRTier/
                isManagerTier/isAdmin. */}
            <Route path="departments/me" element={<MyDepartmentRedirect />} />
            <Route path="departments/:id" element={<ViewDepartment />} />

            {/* Payroll: MANAGER also gets in (read-only, own department — see
                payrollController.js), so this uses requireManager not requireHR. */}
            <Route
              path="payroll"
              element={<ProtectedRoute requireManager><Payroll /></ProtectedRoute>}
            />

            {/* Holidays: company holiday list is unscoped/view-only for MANAGER;
                leave requests + balances are backend-scoped to their own
                department automatically (leaveRequestController/reviewQueue.js
                and employeeController's department scoping) — see Holidays.jsx's
                canManageLeave/canManageHolidays split. */}
            <Route
              path="holidays"
              element={<ProtectedRoute requireManager><Holidays /></ProtectedRoute>}
            />

            {/* ── HR (company-wide) + Admin only — matches the demo's role
                model: MANAGER's nav has no Add Employee, Org Chart, or full
                Departments-list capability. ── */}
            <Route
              path="employees/add"
              element={<ProtectedRoute requireHR><AddEmployee /></ProtectedRoute>}
            />
            <Route
              path="org-chart"
              element={<ProtectedRoute requireHR><OrgChart /></ProtectedRoute>}
            />
            <Route
              path="departments"
              element={<ProtectedRoute requireHR><AllDepartments /></ProtectedRoute>}
            />
            <Route
              path="jobs"
              element={<ProtectedRoute requireHR><Jobs /></ProtectedRoute>}
            />
            <Route
              path="candidates"
              element={<ProtectedRoute requireHR><Candidates /></ProtectedRoute>}
            />
          </Route>
        </Routes>
      </Suspense>
    </ChunkErrorBoundary>
  );
}

export default App;
