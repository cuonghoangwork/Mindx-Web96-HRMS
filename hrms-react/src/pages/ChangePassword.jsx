import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Button from "../components/Button";
import AuthBrandPanel from "../components/AuthBrandPanel";
import AuthThemeToggle from "../components/AuthThemeToggle";

function ChangePassword() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { changePassword, mustChangePassword, user, logout } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const validate = () => {
    if (!currentPassword) return t("auth.changePassword.errors.currentRequired", { defaultValue: "Enter your current password." });
    if (newPassword.length < 8) return t("auth.changePassword.errors.tooShort", { defaultValue: "New password must be at least 8 characters." });
    if (newPassword === currentPassword) return t("auth.changePassword.errors.sameAsCurrent", { defaultValue: "New password must be different from the current one." });
    if (newPassword !== confirmPassword) return t("auth.changePassword.errors.mismatch", { defaultValue: "The two new passwords do not match." });
    return "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const localError = validate();
    if (localError) {
      setError(localError);
      return;
    }

    setError("");
    setIsSaving(true);
    const result = await changePassword(currentPassword, newPassword);
    setIsSaving(false);

    if (result.success) {
      navigate("/dashboard", { replace: true });
    } else {
      setError(result.error);
    }
  };

  return (
    <div className="login-page">
      <AuthBrandPanel />

      <div className="login-form-panel">
        <AuthThemeToggle />

        <div className="login-card">
        <div className="login-header">
          <h1>{mustChangePassword ? t("auth.changePassword.setPasswordHeading", { defaultValue: "Set your password" }) : t("auth.changePassword.changePasswordHeading", { defaultValue: "Change password" })}</h1>
        </div>
        <p className="login-subtitle">
          {mustChangePassword
            ? t("auth.changePassword.mustChangeSubtitle", { defaultValue: "Your account uses a temporary password. Choose a new one to continue." })
            : t("auth.changePassword.subtitle", { defaultValue: "Choose a new password for your account." })}
        </p>

        {user?.email && (
          <div
            style={{
              marginBottom: "20px",
              padding: "var(--sp-3) var(--sp-4)",
              background: "var(--bg-surface-alt)",
              border: "1px solid var(--bdr-subtle)",
              borderRadius: "var(--radius-md)",
              fontSize: "var(--fs-sm)",
              color: "var(--txt-secondary)",
            }}
          >
            {t("auth.changePassword.signedInAsPrefix", { defaultValue: "Signed in as" })} <strong style={{ color: "var(--txt-primary)" }}>{user.email}</strong>
          </div>
        )}

        {error && (
          <div className="form-error" style={{ marginBottom: "20px" }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="currentPassword">{t("auth.changePassword.currentPasswordLabel", { defaultValue: "Current password" })}</label>
            <input
              type="password"
              id="currentPassword"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>

          <div className="form-group">
            <label htmlFor="newPassword">{t("auth.changePassword.newPasswordLabel", { defaultValue: "New password" })}</label>
            <input
              type="password"
              id="newPassword"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t("auth.common.atLeast8CharsHint", { defaultValue: "At least 8 characters" })}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">{t("auth.changePassword.confirmNewPasswordLabel", { defaultValue: "Confirm new password" })}</label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t("auth.changePassword.confirmPlaceholder", { defaultValue: "Repeat the new password" })}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>

          <Button
            variant="primary"
            type="submit"
            style={{ width: "100%" }}
            disabled={isSaving}
          >
            {isSaving ? t("auth.changePassword.savingButton", { defaultValue: "Saving..." }) : t("auth.changePassword.submitButton", { defaultValue: "Update password" })}
          </Button>
        </form>

        <p style={{ textAlign: "center", marginTop: "24px", fontSize: "14px" }}>
          <button
            type="button"
            onClick={logout}
            className="link-primary"
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              font: "inherit",
            }}
          >
            {t("auth.changePassword.signOutLink", { defaultValue: "Sign out" })}
          </button>
        </p>
        </div>
      </div>
    </div>
  );
}

export default ChangePassword;
