import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import { useLocation, useMatch, Link } from "react-router-dom";
import { idsMatch } from "../utils/id";
import HeaderDateTime from "./HeaderDateTime";
import GlobalSearch from "./GlobalSearch";
import ClockInAction from "./ClockInAction";

function Header({ onMenuToggle }) {
  const { unreadNotificationCount, employees } = useStore();
  const { isHRTier, isManager, user } = useAuth();
  const isPlainManager = isManager && !isHRTier;
  // Mirrors SideMenu.jsx's isPlainEmployee — role is EMPLOYEE exactly.
  const isPlainEmployee = !isManager && !isHRTier;
  const { currency, toggleCurrency } = useCurrency();
  const location = useLocation();

  // /employees/:id also matches the literal "/employees/add" path (useMatch
  // is pure pattern-matching against the URL, unaware of route priority),
  // so explicitly exclude that id value below.
  const employeeDetailMatch = useMatch("/employees/:id");
  const viewingEmployeeId =
    employeeDetailMatch && employeeDetailMatch.params.id !== "add"
      ? employeeDetailMatch.params.id
      : null;
  const viewingEmployee = viewingEmployeeId
    ? employees.find((e) => idsMatch(e.id, viewingEmployeeId))
    : null;
  const isOwnRecord = Boolean(
    user?.email && viewingEmployee?.email && user.email.toLowerCase() === viewingEmployee.email.toLowerCase(),
  );

  // Get page title from current route
  const getPageTitle = () => {
    const path = location.pathname;
    if (path === "/" || path === "/dashboard") return "Dashboard";
    if (path === "/employees") return isPlainManager || isPlainEmployee ? "Directory" : "All Employees";
    if (path.startsWith("/employees/add")) return "Add Employee";
    if (viewingEmployee) return isOwnRecord ? "My Profile" : viewingEmployee.name;
    if (path.startsWith("/employees/")) return "Employee Details";
    if (path === "/departments/me") return "My Department";
    if (path === "/departments") return "All Departments";
    if (path.startsWith("/departments/")) return isPlainManager || isPlainEmployee ? "My Department" : "Department Details";
    if (path === "/org-chart") return "Org Chart";
    if (path === "/attendance") return "Attendance";
    if (path === "/payroll") return "Payroll";
    if (path === "/jobs") return "Jobs";
    if (path === "/candidates") return "Candidates";
    if (path === "/holidays") return "Holidays";
    if (path === "/settings") return "Settings";
    if (path === "/notifications") return "Notifications";
    return "Dashboard";
  };

  // Small uppercase "kicker" above the page title — matches mockup's
  // topbarKickerStyle, which shows the nav group the current page
  // belongs to (same grouping as SideMenu's numbered sections). Employee
  // detail gets the mockup's compound "People / Profile" kicker instead
  // of the plain group name.
  const getPageKicker = () => {
    const path = location.pathname;
    const peopleKicker = isPlainManager || isPlainEmployee ? "My Info" : "People";
    if (path === "/dashboard" || path === "/") return "Overview";
    if (path.startsWith("/employees/add")) return "People / New";
    if (viewingEmployee) return `${peopleKicker} / Profile`;
    if (path.startsWith("/employees") || path.startsWith("/departments") || path === "/org-chart") return peopleKicker;
    if (path === "/attendance" || path === "/payroll" || path === "/holidays") return "Time & Pay";
    if (path === "/jobs" || path === "/candidates") return "Hiring";
    if (path === "/settings" || path === "/notifications") return "System";
    return "Overview";
  };

  return (
    <header className="dash-header">
      <button
        type="button"
        className="menu-toggle"
        aria-label="Open navigation menu"
        onClick={onMenuToggle}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </button>
      <div className="dash-title">
        <div className="dash-title-sub">{getPageKicker()}</div>
        <div className="dash-title-main">{getPageTitle()}</div>
      </div>

      {/* Global search matches the mockup's isAdminRole gate, which is
          isSystemAdmin || isHrRole — i.e. HR (MANAGER) gets it too, same as
          the rest of the full nav. Plain Employee gets the compact
          self-service shell and doesn't need company-wide search. */}
      {isHRTier && <GlobalSearch />}

      <button
        type="button"
        className="currency-toggle-btn"
        onClick={toggleCurrency}
        title="Toggle payroll display currency"
      >
        {currency === "VND" ? "VND → USD" : "USD → VND"}
      </button>

      <ClockInAction />

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

    </header>
  );
}

export default Header;
