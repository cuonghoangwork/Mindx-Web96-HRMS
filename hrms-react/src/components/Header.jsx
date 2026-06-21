import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useStore } from "../context/StoreContext";
import { useLocation, Link } from "react-router-dom";
import HeaderDateTime from "./HeaderDateTime";

function Header({ onMenuToggle }) {
  const { user, logout } = useAuth();
  const { unreadNotificationCount } = useStore();
  const location = useLocation();
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  // Get page title from current route
  const getPageTitle = () => {
    const path = location.pathname;
    if (path === "/" || path === "/dashboard") return "Dashboard";
    if (path === "/employees") return "All Employees";
    if (path.startsWith("/employees/add")) return "Add Employee";
    if (path.startsWith("/employees/")) return "Employee Details";
    if (path === "/departments") return "All Departments";
    if (path.startsWith("/departments/")) return "Department Details";
    if (path === "/attendance") return "Attendance";
    if (path === "/payroll") return "Payroll";
    if (path === "/jobs") return "Jobs";
    if (path === "/candidates") return "Candidates";
    if (path === "/holidays") return "Holidays";
    if (path === "/settings") return "Settings";
    if (path === "/notifications") return "Notifications";
    return "Dashboard";
  };

  const handleLogout = () => {
    logout();
  };

  return (
    <header className="dash-header">
      <button
        type="button"
        className="menu-toggle"
        aria-label="Open navigation menu"
        onClick={onMenuToggle}
      >
        <span aria-hidden="true">☰</span>
      </button>
      <div className="dash-title">
        <div className="dash-title-main">{getPageTitle()}</div>
        <div className="dash-title-sub">Human Resource Management System</div>
      </div>

      <HeaderDateTime />

      <Link
        to="/notifications"
        className="dash-notif"
        aria-label={`Notifications${unreadNotificationCount > 0 ? `, ${unreadNotificationCount} unread` : ""}`}
        style={{ position: "relative" }}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadNotificationCount > 0 && (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: "-4px",
              right: "-4px",
              minWidth: "16px",
              height: "16px",
              padding: "0 4px",
              borderRadius: "var(--radius-full)",
              background: "var(--clr-danger-500)",
              color: "var(--clr-neutral-0)",
              fontSize: "var(--fs-2xs)",
              fontWeight: "var(--fw-semibold)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
            }}
          >
            {unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}
          </span>
        )}
      </Link>

      <div style={{ position: "relative" }}>
        <button
          className="dash-profile"
          type="button"
          aria-label="My Profile"
          onClick={() => setShowProfileMenu(!showProfileMenu)}
          style={{ cursor: "pointer" }}
        >
          <span
            className="dash-avatar"
            aria-hidden="true"
            style={{
              display: "grid",
              placeItems: "center",
              fontSize: "14px",
              fontWeight: "600",
              color: "white",
            }}
          >
            {user?.avatar || "AU"}
          </span>
          <span className="dash-profile-text">
            <span className="dash-profile-name">
              {user?.name || "Admin User"}
            </span>
            <span className="dash-profile-role">
              {user?.role || "Administrator"}
            </span>
          </span>
          <span>⌄</span>
        </button>

        {showProfileMenu && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              right: 0,
              width: "180px",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              boxShadow: "var(--shadow)",
              zIndex: 100,
              overflow: "hidden",
            }}
          >
            <Link
              to="/settings"
              style={{
                display: "block",
                padding: "12px 16px",
                color: "var(--text-main)",
                textDecoration: "none",
                fontSize: "14px",
                borderBottom: "1px solid var(--border)",
              }}
              onClick={() => setShowProfileMenu(false)}
            >
              ⚙️ Settings
            </Link>
            <button
              onClick={handleLogout}
              style={{
                display: "block",
                width: "100%",
                padding: "12px 16px",
                background: "none",
                border: "none",
                color: "#dc2626",
                cursor: "pointer",
                fontSize: "14px",
                textAlign: "left",
                fontFamily: "inherit",
              }}
            >
              🚪 Logout
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

export default Header;
