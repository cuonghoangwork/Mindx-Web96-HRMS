import { useTranslation } from "react-i18next";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import { useLocation, useMatch, Link } from "react-router-dom";
import { idsMatch } from "../utils/id";
import HeaderDateTime from "./HeaderDateTime";
import GlobalSearch from "./GlobalSearch";
import ClockInAction from "./ClockInAction";

function Header({ onMenuToggle }) {
  const { t } = useTranslation();
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
    if (path === "/" || path === "/dashboard") return t("sideMenu.dashboard", { defaultValue: "Dashboard" });
    if (path === "/employees") return isPlainManager || isPlainEmployee ? t("sideMenu.directory", { defaultValue: "Directory" }) : t("sideMenu.allEmployees", { defaultValue: "All Employees" });
    if (path.startsWith("/employees/add")) return t("sideMenu.addEmployee", { defaultValue: "Add Employee" });
    if (viewingEmployee) return isOwnRecord ? t("sideMenu.myProfile", { defaultValue: "My Profile" }) : viewingEmployee.name;
    if (path.startsWith("/employees/")) return t("header.pageTitle.employeeDetails", { defaultValue: "Employee Details" });
    if (path === "/departments/me") return t("sideMenu.myDepartment", { defaultValue: "My Department" });
    if (path === "/departments") return t("sideMenu.allDepartments", { defaultValue: "All Departments" });
    if (path.startsWith("/departments/")) return isPlainManager || isPlainEmployee ? t("sideMenu.myDepartment", { defaultValue: "My Department" }) : t("header.pageTitle.departmentDetails", { defaultValue: "Department Details" });
    if (path === "/org-chart") return t("sideMenu.orgChart", { defaultValue: "Org Chart" });
    if (path === "/attendance") return t("sideMenu.attendance", { defaultValue: "Attendance" });
    if (path === "/performance") return t("sideMenu.performanceReviews", { defaultValue: "Performance Reviews" });
    if (path === "/payroll") return t("sideMenu.payroll", { defaultValue: "Payroll" });
    if (path === "/jobs") return t("header.pageTitle.jobs", { defaultValue: "Jobs" });
    if (path === "/candidates") return t("sideMenu.candidates", { defaultValue: "Candidates" });
    if (path === "/holidays") return t("sideMenu.holidays", { defaultValue: "Holidays" });
    if (path === "/settings") return t("sideMenu.settings", { defaultValue: "Settings" });
    if (path === "/notifications") return t("sideMenu.notifications", { defaultValue: "Notifications" });
    return t("sideMenu.dashboard", { defaultValue: "Dashboard" });
  };

  // Small uppercase "kicker" above the page title — matches mockup's
  // topbarKickerStyle, which shows the nav group the current page
  // belongs to (same grouping as SideMenu's numbered sections). Employee
  // detail gets the mockup's compound "People / Profile" kicker instead
  // of the plain group name.
  const getPageKicker = () => {
    const path = location.pathname;
    const peopleKicker = isPlainManager || isPlainEmployee ? t("sideMenu.myInfo", { defaultValue: "My Info" }) : t("sideMenu.people", { defaultValue: "People" });
    if (path === "/dashboard" || path === "/") return t("sideMenu.overview", { defaultValue: "Overview" });
    if (path.startsWith("/employees/add")) return t("header.kicker.withSuffix", { defaultValue: "{{group}} / {{suffix}}", group: t("sideMenu.people", { defaultValue: "People" }), suffix: t("header.kicker.newSuffix", { defaultValue: "New" }) });
    if (viewingEmployee) return t("header.kicker.withSuffix", { defaultValue: "{{group}} / {{suffix}}", group: peopleKicker, suffix: t("header.kicker.profileSuffix", { defaultValue: "Profile" }) });
    if (path.startsWith("/employees") || path.startsWith("/departments") || path === "/org-chart") return peopleKicker;
    if (path === "/attendance" || path === "/performance" || path === "/payroll" || path === "/holidays") return t("sideMenu.timePay", { defaultValue: "Time & Pay" });
    if (path === "/jobs" || path === "/candidates") return t("sideMenu.hiring", { defaultValue: "Hiring" });
    if (path === "/settings" || path === "/notifications") return t("sideMenu.system", { defaultValue: "System" });
    return t("sideMenu.overview", { defaultValue: "Overview" });
  };

  return (
    <header className="dash-header">
      <button
        type="button"
        className="menu-toggle"
        aria-label={t("header.openNavMenu", { defaultValue: "Open navigation menu" })}
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
        title={t("header.toggleCurrencyTitle", { defaultValue: "Toggle payroll display currency" })}
      >
        {currency === "VND" ? "VND → USD" : "USD → VND"}
      </button>

      <ClockInAction />

      <HeaderDateTime />

      <Link
        to="/notifications"
        className="dash-notif"
        aria-label={`${t("header.notifications", { defaultValue: "Notifications" })}${unreadNotificationCount > 0 ? t("header.notificationsUnreadSuffix", { defaultValue: ", {{count}} unread", count: unreadNotificationCount }) : ""}`}
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
