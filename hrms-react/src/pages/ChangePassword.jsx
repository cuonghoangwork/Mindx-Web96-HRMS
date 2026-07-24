import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function ChangePassword() {
  const navigate = useNavigate();
  const { changePassword, mustChangePassword, user, logout } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const validate = () => {
    if (!currentPassword) return "Enter your current password.";
    if (newPassword.length < 8) return "New password must be at least 8 characters.";
    if (newPassword === currentPassword) return "New password must be different from the current one.";
    if (newPassword !== confirmPassword) return "The two new passwords do not match.";
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
      <div className="login-card">
        <div className="login-header">
          <h1>{mustChangePassword ? "Set your password" : "Change password"}</h1>
        </div>
        <p className="login-subtitle">
          {mustChangePassword
            ? "Your account uses a temporary password. Choose a new one to continue."
            : "Choose a new password for your account."}
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
            Signed in as <strong style={{ color: "var(--txt-primary)" }}>{user.email}</strong>
          </div>
        )}

        {error && (
          <div className="form-error" style={{ marginBottom: "20px" }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="currentPassword">Current password</label>
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
            <label htmlFor="newPassword">New password</label>
            <input
              type="password"
              id="newPassword"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm new password</label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat the new password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: "100%" }}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Update password"}
          </button>
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
            Sign out
          </button>
        </p>
      </div>
    </div>
  );
}

export default ChangePassword;
