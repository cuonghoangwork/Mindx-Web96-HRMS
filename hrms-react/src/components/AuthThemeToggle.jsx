/**
 * AuthThemeToggle — HRMS Design System v3 "Navy Signal Blue"
 *
 * Explicit Light/Dark switch shown in the top-right corner of the auth
 * form panel (Login, ForgotPassword, EnterOTP, LoginSuccessful) — same
 * ThemeContext as the in-app SideMenu switch, just laid out as two
 * buttons instead of a toggle, matching the redesign's login shell.
 */
import { useTheme } from "../context/ThemeContext";

function AuthThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="login-theme-row" role="tablist" aria-label="Theme switcher">
      <button
        type="button"
        className={`login-theme-btn ${theme === "light" ? "active" : ""}`}
        onClick={() => setTheme("light")}
      >
        Light
      </button>
      <button
        type="button"
        className={`login-theme-btn ${theme === "dark" ? "active" : ""}`}
        onClick={() => setTheme("dark")}
      >
        Dark
      </button>
    </div>
  );
}

export default AuthThemeToggle;
