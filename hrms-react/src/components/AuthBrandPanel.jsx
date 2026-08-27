/**
 * AuthBrandPanel — HRMS Design System v3 "Navy Signal Blue"
 *
 * Full-bleed signal-blue brand panel shown on the left of every auth
 * screen (Login, ForgotPassword, EnterOTP, LoginSuccessful), so the
 * whole sign-in flow reads as one continuous shell instead of four
 * separate centered cards.
 *
 * Usage:
 *   <div className="login-page">
 *     <AuthBrandPanel />
 *     <div className="login-form-panel"> ... </div>
 *   </div>
 */
import { useTranslation } from "react-i18next";

function AuthBrandPanel() {
  const { t } = useTranslation();
  return (
    <div className="login-brand-panel">
      <div className="login-brand-top">
        <span className="login-wordmark">HRMS</span>
        <span className="login-codename">/ LEDGER</span>
      </div>

      <div>
        <div className="login-hero-number" aria-hidden="true">01</div>
        <h1 className="login-headline">{t("auth.brand.headline", { defaultValue: "One ledger for every person on the roster." })}</h1>
        <p className="login-hero-copy">
          {t("auth.brand.heroCopy", { defaultValue: "Headcount, attendance and pay in a single flat record — built for teams who read numbers, not dashboards." })}
        </p>
      </div>

      <div className="login-hero-foot">
        <div>{t("common.roles.HR", { defaultValue: "HR" })}</div>
        <div>{t("sideMenu.attendance", { defaultValue: "Attendance" })}</div>
        <div>{t("sideMenu.payroll", { defaultValue: "Payroll" })}</div>
      </div>
    </div>
  );
}

export default AuthBrandPanel;
