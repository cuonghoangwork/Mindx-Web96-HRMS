/**
 * AuthThemeToggle — HRMS Design System v3 "Navy Signal Blue"
 *
 * Explicit Light/Dark switch shown in the top-right corner of the auth
 * form panel (Login, ForgotPassword, EnterOTP, LoginSuccessful) — same
 * ThemeContext as the in-app SideMenu switch, just laid out as two
 * buttons instead of a toggle, matching the redesign's login shell.
 */
import { useTranslation } from "react-i18next";
import { useTheme } from "../context/ThemeContext";

function AuthThemeToggle() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();

  return (
    <div className="login-theme-row" role="tablist" aria-label={t("sideMenu.themeSwitcherLabel", { defaultValue: "Theme switcher" })}>
      <button
        type="button"
        className={`login-theme-btn ${theme === "light" ? "active" : ""}`}
        onClick={() => setTheme("light")}
      >
        {t("sideMenu.themeLight", { defaultValue: "Light" })}
      </button>
      <button
        type="button"
        className={`login-theme-btn ${theme === "dark" ? "active" : ""}`}
        onClick={() => setTheme("dark")}
      >
        {t("sideMenu.themeDark", { defaultValue: "Dark" })}
      </button>
    </div>
  );
}

export default AuthThemeToggle;
