import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import ChunkErrorBoundary from "./components/ChunkErrorBoundary";
import Login from "./pages/Login";

// Login stays static — it is the first page an unauthenticated visitor sees.
// Every other page is a content-hashed chunk, which is why ChunkErrorBoundary exists.
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
    // Serves the public routes; pages inside the shell use Layout.jsx's nearer
    // boundary so the sidebar stays mounted while a chunk loads.
    <ChunkErrorBoundary>
      <Suspense fallback={<FullPageLoading />}>
        <Routes>
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
            <Route path="performance" element={<Performance />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="settings" element={<Settings />} />

            <Route path="employees/:id" element={<ViewEmployee />} />

            <Route path="employees" element={<AllEmployees />} />

            {/* Resolves the caller's department and redirects to departments/:id. */}
            <Route path="departments/me" element={<MyDepartmentRedirect />} />
            <Route path="departments/:id" element={<ViewDepartment />} />

            <Route
              path="payroll"
              element={<ProtectedRoute requireManager><Payroll /></ProtectedRoute>}
            />

            <Route
              path="holidays"
              element={<ProtectedRoute requireManager><Holidays /></ProtectedRoute>}
            />

            {/* ── HR + Admin only ── */}
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
