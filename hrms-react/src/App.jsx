import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import Dashboard from "./pages/Dashboard";
import AllEmployees from "./pages/AllEmployees";
import ViewEmployee from "./pages/ViewEmployee";
import AddEmployee from "./pages/AddEmployee";
import Attendance from "./pages/Attendance";
import Payroll from "./pages/Payroll";
import Jobs from "./pages/Jobs";
import Candidates from "./pages/Candidates";
import Holidays from "./pages/Holidays";
import Settings from "./pages/Settings";
import Notifications from "./pages/Notifications";
import AllDepartments from "./pages/AllDepartments";
import ViewDepartment from "./pages/ViewDepartment";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import EnterOTP from "./pages/EnterOTP";
import LoginSuccessful from "./pages/LoginSuccessful";

function App() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      {/* Public auth routes */}
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />}
      />
      <Route
        path="/register"
        element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Register />}
      />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/enter-otp" element={<EnterOTP />} />
      <Route path="/login-successful" element={<LoginSuccessful />} />

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
        <Route path="notifications" element={<Notifications />} />
        <Route path="settings" element={<Settings />} />

        {/* View own profile — ProtectedRoute with no extra role; controller enforces own-only for EMPLOYEE */}
        <Route path="employees/:id" element={<ViewEmployee />} />

        {/* ── HR / Manager + Admin only ── */}
        <Route
          path="employees"
          element={<ProtectedRoute requireHR><AllEmployees /></ProtectedRoute>}
        />
        <Route
          path="employees/add"
          element={<ProtectedRoute requireHR><AddEmployee /></ProtectedRoute>}
        />
        <Route
          path="departments"
          element={<ProtectedRoute requireHR><AllDepartments /></ProtectedRoute>}
        />
        <Route
          path="departments/:id"
          element={<ProtectedRoute requireHR><ViewDepartment /></ProtectedRoute>}
        />
        <Route
          path="payroll"
          element={<ProtectedRoute requireHR><Payroll /></ProtectedRoute>}
        />
        <Route
          path="jobs"
          element={<ProtectedRoute requireHR><Jobs /></ProtectedRoute>}
        />
        <Route
          path="candidates"
          element={<ProtectedRoute requireHR><Candidates /></ProtectedRoute>}
        />
        <Route
          path="holidays"
          element={<ProtectedRoute requireHR><Holidays /></ProtectedRoute>}
        />
      </Route>
    </Routes>
  );
}

export default App;
