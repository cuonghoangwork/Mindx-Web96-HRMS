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
import ForgotPassword from "./pages/ForgotPassword";
import EnterOTP from "./pages/EnterOTP";
import LoginSuccessful from "./pages/LoginSuccessful";

function App() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      {/* Public Auth Routes - redirect to dashboard if already logged in */}
      <Route
        path="/login"
        element={
          isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />
        }
      />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/enter-otp" element={<EnterOTP />} />
      <Route path="/login-successful" element={<LoginSuccessful />} />

      {/* Protected Main App Routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="employees" element={<AllEmployees />} />
        <Route path="employees/add" element={<AddEmployee />} />
        <Route path="employees/:id" element={<ViewEmployee />} />
        <Route path="attendance" element={<Attendance />} />
        <Route path="payroll" element={<Payroll />} />
        <Route path="jobs" element={<Jobs />} />
        <Route path="candidates" element={<Candidates />} />
        <Route path="holidays" element={<Holidays />} />
        <Route path="settings" element={<Settings />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="departments" element={<AllDepartments />} />
        <Route path="departments/:id" element={<ViewDepartment />} />
      </Route>
    </Routes>
  );
}

export default App;
