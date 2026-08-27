import { Link, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { getRoleLabel } from "../utils/roles";

function SideMenu({ isOpen = false, onNavigate }) {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const { isAdmin, isHR, isHRTier, isManager, user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Plain MANAGER (not also HR/Admin) gets a distinct "My Info"-style nav
  // shape matching the design (My Profile / Directory / My Department),
  // rather than the People-group HR/Admin nav with a couple of items
  // swapped — see below.
  const isPlainManager = isManager && !isHRTier;

  // Plain EMPLOYEE (not Manager/HR/Admin) gets the same "My Info" shape as
  // isPlainManager, plus further trims the design calls for that MANAGER
  // doesn't need: no Hiring group (Candidates/Jobs are requireHR — MANAGER
  // passes that gate, EMPLOYEE doesn't), no Holidays in Time & Pay
  // (requireManager, same reason), and "Payroll"/"Leave" there point into
  // My Profile's Salary/Leave tabs (?tab=salary / ?tab=leave, see
  // ViewEmployee.jsx) instead of the admin /payroll page EMPLOYEE can't
  // reach — that data already lives on those tabs, this just gives it a
  // direct sidebar shortcut matching the design.
  const isPlainEmployee = !isManager && !isHRTier;

  // Same nav list for every authenticated role by default — restricted
  // destinations (Payroll, Jobs, Candidates — see App.jsx/
  // ProtectedRoute.jsx's requireHR/requireManager) still resolve to the
  // app's existing "Access Denied" screen rather than a broken page, so
  // showing the item is a pure discoverability choice, not a permissions
  // change. MANAGER and EMPLOYEE are the exception: their nav items are
  // swapped/trimmed below to match what each can actually reach, rather
  // than pointing at pages they'd immediately get denied on.
  //
  // Grouping below mirrors the mockup's NAV_RAW — numbered sections
  // (01 Overview, 02 People, ...) instead of one flat list. Icons are kept
  // per an explicit product decision (mockup itself is icon-free, but the
  // current app deliberately keeps its outline-SVG icon system). Group
  // index numbers are assigned by position after filtering (below), not
  // hardcoded, since EMPLOYEE drops the Hiring group entirely.
  const rawGroups = [
    { key: "overview", title: t("sideMenu.overview", { defaultValue: "Overview" }), items: [
      { path: "/dashboard", title: t("sideMenu.dashboard", { defaultValue: "Dashboard" }), icon: dashboardIcon },
    ]},
    { key: "people", title: isPlainManager || isPlainEmployee ? t("sideMenu.myInfo", { defaultValue: "My Info" }) : t("sideMenu.people", { defaultValue: "People" }), items: [
      // "My Profile" — every role's own record (ViewEmployee.jsx's
      // /employees/:id route is open to any authenticated user, not just
      // MANAGER). user.employeeId comes straight off the JWT-derived
      // /auth/me response, no extra fetch needed; every seeded role
      // (including ADMIN) now has a linked Employee record, see seed.js.
      ...(user?.employeeId
        ? [{ path: `/employees/${user.employeeId}`, title: t("sideMenu.myProfile", { defaultValue: "My Profile" }), icon: employeesIcon }]
        : []),
      // Directory read is company-wide for every role (see
      // employeeController.getAll) — only the label changes for MANAGER/
      // EMPLOYEE, matching the design's "Directory" wording; the page
      // itself already hides management actions (bulk select, Promote,
      // Add Employee) for a plain viewer.
      { path: "/employees", title: isPlainManager || isPlainEmployee ? t("sideMenu.directory", { defaultValue: "Directory" }) : t("sideMenu.allEmployees", { defaultValue: "All Employees" }), icon: employeesIcon },
      // Add Employee: HR/Admin only (App.jsx gates employees/add requireHR)
      // — previously only reachable via the "+ Add Employee" button on the
      // All Employees page; the design lists it as its own People-group
      // nav item, so it gets a direct sidebar shortcut too.
      ...(isHRTier ? [{ path: "/employees/add", title: t("sideMenu.addEmployee", { defaultValue: "Add Employee" }), icon: addEmployeeIcon }] : []),
      // MANAGER/EMPLOYEE get a "My Department" shortcut instead of the
      // full company Departments list — matches the demo's role model
      // (neither has a general Departments browser, only their own via
      // MyDepartmentRedirect.jsx), and App.jsx gates /departments requireHR.
      isPlainManager || isPlainEmployee
        ? { path: "/departments/me", title: t("sideMenu.myDepartment", { defaultValue: "My Department" }), icon: departmentsIcon }
        : { path: "/departments", title: t("sideMenu.allDepartments", { defaultValue: "All Departments" }), icon: departmentsIcon },
      // Org Chart: HR/Admin only (matches the demo — no such nav item for
      // MANAGER/EMPLOYEE), so it's omitted from their nav below instead of
      // just relying on the Access Denied fallback.
      ...(isPlainManager || isPlainEmployee ? [] : [{ path: "/org-chart", title: t("sideMenu.orgChart", { defaultValue: "Org Chart" }), icon: orgChartIcon }]),
    ]},
    { key: "timepay", title: t("sideMenu.timePay", { defaultValue: "Time & Pay" }), items: [
      { path: "/attendance", title: t("sideMenu.attendance", { defaultValue: "Attendance" }), icon: attendanceIcon },
      // Every role has at least their own review (ADMIN/HR/MANAGER also
      // review reports) — always present, no isPlainManager/isPlainEmployee
      // branching needed, matching /attendance above.
      { path: "/performance", title: t("sideMenu.performanceReviews", { defaultValue: "Performance Reviews" }), icon: performanceIcon },
      ...(isPlainEmployee && user?.employeeId
        // EMPLOYEE: "Payroll"/"Leave" deep-link into My Profile's own tabs
        // (see ViewEmployee.jsx's ?tab= handling) rather than the
        // requireManager-gated /payroll or the nonexistent standalone
        // /leave page — same underlying self-service data, just reachable
        // directly from the sidebar like the design shows.
        ? [
            { path: `/employees/${user.employeeId}?tab=salary`, title: t("sideMenu.payroll", { defaultValue: "Payroll" }), icon: payrollIcon },
            { path: `/employees/${user.employeeId}?tab=leave`,  title: t("sideMenu.leave", { defaultValue: "Leave" }),   icon: holidaysIcon },
          ]
        // MANAGER/HR/Admin: both requireManager (App.jsx) — all three pass
        // that gate, so they keep the full admin pages.
        : isPlainEmployee ? [] : [
            { path: "/payroll",  title: t("sideMenu.payroll", { defaultValue: "Payroll" }),  icon: payrollIcon },
            { path: "/holidays", title: t("sideMenu.holidays", { defaultValue: "Holidays" }), icon: holidaysIcon },
          ]),
    ]},
    // Hiring: requireHR (App.jsx), so MANAGER hits Access Denied here too
    // — pre-existing behavior, unchanged, matching both the demo and the
    // live app's current Manager sidebar (out of scope to revisit here).
    // Only EMPLOYEE, which never had a Hiring group in the design, drops
    // it from its own nav.
    ...(isPlainEmployee ? [] : [{ key: "hiring", title: t("sideMenu.hiring", { defaultValue: "Hiring" }), items: [
      { path: "/candidates", title: t("sideMenu.candidates", { defaultValue: "Candidates" }), icon: candidatesIcon },
      { path: "/jobs",       title: t("sideMenu.jobOpenings", { defaultValue: "Job Openings" }), icon: jobsIcon },
    ]}]),
    { key: "system", title: isPlainEmployee ? t("sideMenu.account", { defaultValue: "Account" }) : t("sideMenu.system", { defaultValue: "System" }), items: [
      { path: "/notifications", title: t("sideMenu.notifications", { defaultValue: "Notifications" }), icon: notifIcon },
      { path: "/settings",      title: t("sideMenu.settings", { defaultValue: "Settings" }),      icon: settingsIcon },
    ]},
  ];
  const navGroups = rawGroups.map((group, i) => ({ ...group, index: String(i + 1).padStart(2, "0") }));

  const goToHome = () => navigate("/dashboard");

  return (
    <aside className={`side-menu${isOpen ? " open" : ""}`}>
      <button
        className="brand"
        onClick={goToHome}
        type="button"
        style={{
          cursor: "pointer", background: "none",
          textAlign: "left", fontFamily: "inherit",
        }}
        title={t("sideMenu.goToDashboard", { defaultValue: "Go to Dashboard" })}
      >
        <div className="logo-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
            <circle cx="9.5" cy="7" r="3.5" />
            <path d="M19.5 21v-1.5a3.5 3.5 0 0 0-2.5-3.36" />
            <path d="M15.5 3.6a3.5 3.5 0 0 1 0 6.8" />
          </svg>
        </div>
        <h1>HRMS</h1>
        {/* codename tag — matches mockup's sidebarCodenameStyle ("/ LEDGER") */}
        <span className="brand-codename">/ LEDGER</span>
      </button>

      <div className="side-menu-nav-scroll">
        {navGroups.map((group) => (
          <div className="nav-group" key={group.index}>
            <div className="nav-group-header">
              <span className="nav-group-index">{group.index}</span>
              {group.title}
            </div>
            <nav className="menu-list">
              {group.items.map((item) => {
                // Exact pathname+query match rather than NavLink's default
                // fuzzy/prefix matching — needed now that "Payroll" and
                // "Leave" (EMPLOYEE nav) point at the same /employees/:id
                // path as "My Profile", distinguished only by ?tab=, which
                // NavLink's isActive ignores entirely.
                const [itemPathname, itemQuery = ""] = item.path.split("?");
                const isItemActive =
                  location.pathname === itemPathname &&
                  location.search === (itemQuery ? `?${itemQuery}` : "");
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`menu-item ${isItemActive ? "active" : ""}`}
                    onClick={onNavigate}
                  >
                    <span className="menu-icon">{item.icon}</span>
                    <span className="menu-text">{item.title}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}
      </div>

      <div className="side-menu-footer">
        {/* Role badge — real-auth indicator (no demo role switcher, per 8.0d) */}
        {isAdmin && (
          <div style={{
            margin: "0 0 var(--sp-4) 0",
            padding: "var(--sp-2) var(--sp-3)",
            background: "var(--bg-primary-subtle)",
            border: "1px solid var(--bdr-brand)",
            display: "flex", alignItems: "center", gap: "var(--sp-2)",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ color: "var(--clr-primary-400)", flexShrink: 0 }} aria-hidden="true">
              <path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
            <span style={{ fontSize: "var(--fs-xs)", color: "var(--txt-primary-brand)", fontWeight: "var(--fw-medium)" }}>
              {t("common.roles.ADMIN", { defaultValue: "Administrator" })}
            </span>
          </div>
        )}

        {isHR && (
          <div style={{
            margin: "0 0 var(--sp-4) 0",
            padding: "var(--sp-2) var(--sp-3)",
            background: "var(--bg-info-subtle)",
            border: "1px solid var(--bdr-info)",
            display: "flex", alignItems: "center", gap: "var(--sp-2)",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ color: "var(--txt-info)", flexShrink: 0 }} aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M8 4v3M16 4v3M3 10h18" />
              <path d="M9 15l2 2 4-4" />
            </svg>
            <span style={{ fontSize: "var(--fs-xs)", color: "var(--txt-info)", fontWeight: "var(--fw-medium)" }}>
              {t("common.roles.HR", { defaultValue: "HR" })}
            </span>
          </div>
        )}

        {isManager && (
          <div style={{
            margin: "0 0 var(--sp-4) 0",
            padding: "var(--sp-2) var(--sp-3)",
            background: "var(--bg-info-subtle)",
            border: "1px solid var(--bdr-info)",
            display: "flex", alignItems: "center", gap: "var(--sp-2)",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ color: "var(--txt-info)", flexShrink: 0 }} aria-hidden="true">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span style={{ fontSize: "var(--fs-xs)", color: "var(--txt-info)", fontWeight: "var(--fw-medium)" }}>
              {t("common.roles.MANAGER", { defaultValue: "Manager" })}
            </span>
          </div>
        )}

        {!isAdmin && !isHR && !isManager && (
          <div style={{
            margin: "0 0 var(--sp-4) 0",
            padding: "var(--sp-2) var(--sp-3)",
            background: "var(--bg-surface-alt)",
            border: "1px solid var(--bdr-default)",
            display: "flex", alignItems: "center", gap: "var(--sp-2)",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ color: "var(--clr-primary-400)", flexShrink: 0 }} aria-hidden="true">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
            </svg>
            <span style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)" }}>
              {t("sideMenu.employeeAccessBadge", { defaultValue: "Employee access" })}
            </span>
          </div>
        )}

        <div className="theme-switch" role="tablist" aria-label={t("sideMenu.themeSwitcherLabel", { defaultValue: "Theme switcher" })}>
          <button
            className={`theme-option ${theme === "light" ? "active" : ""}`}
            onClick={() => theme !== "light" && toggleTheme()}
            type="button"
          >
            <span>☀</span>
            <span>{t("sideMenu.themeLight", { defaultValue: "Light" })}</span>
          </button>
          <button
            className={`theme-option ${theme === "dark" ? "active" : ""}`}
            onClick={() => theme !== "dark" && toggleTheme()}
            type="button"
          >
            <span>◐</span>
            <span>{t("sideMenu.themeDark", { defaultValue: "Dark" })}</span>
          </button>
        </div>

        {/* User identity chip — moved here from the topbar, matching the
            mockup's sidebarFooterStyle layout (userChipWrapStyle above
            signOutStyle). */}
        <button
          type="button"
          className="user-chip"
          onClick={() => navigate("/settings")}
          title={t("sideMenu.goToSettings", { defaultValue: "Go to Settings" })}
        >
          <span className="user-chip-avatar" aria-hidden="true">
            {user?.avatar || "AU"}
          </span>
          <span className="user-chip-text">
            <span className="user-chip-name">{user?.name || "Admin User"}</span>
            <span className="user-chip-role">{getRoleLabel(user?.role, t) || t("common.roles.ADMIN", { defaultValue: "Administrator" })}</span>
          </span>
        </button>

        <button type="button" className="sign-out-link" onClick={logout}>
          {t("sideMenu.signOut", { defaultValue: "Sign Out" })}
        </button>
      </div>
    </aside>
  );
}

/* ── SVG Icons ── */
const dashboardIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z" />
  </svg>
);

const employeesIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
  </svg>
);

const addEmployeeIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M19 8v6M22 11h-6" />
  </svg>
);

const departmentsIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
  </svg>
);

const attendanceIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-4.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" />
  </svg>
);

const performanceIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z" />
  </svg>
);

const payrollIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z" />
  </svg>
);

const jobsIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z" />
  </svg>
);

const candidatesIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
  </svg>
);

const holidaysIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM9 10H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm-8 4H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z" />
  </svg>
);

const settingsIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L5.08 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
  </svg>
);

const notifIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

const orgChartIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="5" r="2.5" />
    <circle cx="5" cy="19" r="2.5" />
    <circle cx="19" cy="19" r="2.5" />
    <path d="M12 7.5v4M12 11.5H5v5M12 11.5h7v5" />
  </svg>
);

export default SideMenu;
