import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import FormField from "../components/FormField";
import { useAuth } from "../context/AuthContext";
import Button from "../components/Button";
import AuthBrandPanel from "../components/AuthBrandPanel";
import AuthThemeToggle from "../components/AuthThemeToggle";

/* ─────────────────────────────────
   Validation rules
───────────────────────────────── */
function validateField(name, value, form, t) {
  switch (name) {
    case "name":
      return !value.trim() ? t("auth.register.errors.nameRequired", { defaultValue: "Full name is required" }) : value.trim().length < 2 ? t("auth.register.errors.nameTooShort", { defaultValue: "Name is too short" }) : "";
    case "email":
      return !value.trim() ? t("auth.register.errors.emailRequired", { defaultValue: "Email is required" }) : !/\S+@\S+\.\S+/.test(value) ? t("auth.register.errors.emailInvalid", { defaultValue: "Enter a valid email address" }) : "";
    case "password":
      return !value ? t("auth.register.errors.passwordRequired", { defaultValue: "Password is required" }) : value.length < 8 ? t("auth.register.errors.passwordTooShort", { defaultValue: "Use at least 8 characters" }) : "";
    case "confirmPassword":
      return !value ? t("auth.register.errors.confirmRequired", { defaultValue: "Please confirm your password" }) : value !== form.password ? t("auth.register.errors.passwordsMismatch", { defaultValue: "Passwords don't match" }) : "";
    default:
      return "";
  }
}

function passwordStrength(pw, t) {
  if (!pw) return { label: "", pct: 0, color: "var(--bg-surface-sub)" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  if (score <= 1) return { label: t("auth.register.strength.weak", { defaultValue: "Weak" }), pct: 25, color: "var(--clr-danger-400)" };
  if (score <= 2) return { label: t("auth.register.strength.fair", { defaultValue: "Fair" }), pct: 50, color: "var(--clr-warning-400)" };
  if (score <= 3) return { label: t("auth.register.strength.good", { defaultValue: "Good" }), pct: 75, color: "var(--clr-info-400)" };
  return { label: t("auth.register.strength.strong", { defaultValue: "Strong" }), pct: 100, color: "var(--clr-success-500)" };
}

/* ═══════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════ */
function Register() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { register } = useAuth();

  const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [errors, setErrors]   = useState({});
  const [touched, setTouched] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed]     = useState(false);
  const [agreedTouched, setAgreedTouched] = useState(false);
  const [serverError, setServerError] = useState("");

  const strength = passwordStrength(form.password, t);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => {
      const next = { ...prev, [name]: value };
      if (touched[name]) {
        setErrors((prevErr) => ({ ...prevErr, [name]: validateField(name, value, next, t) }));
      }
      if (name === "password" && touched.confirmPassword) {
        setErrors((prevErr) => ({ ...prevErr, confirmPassword: validateField("confirmPassword", next.confirmPassword, next, t) }));
      }
      return next;
    });
  };

  const handleBlur = (e) => {
    const { name, value } = e.target;
    setTouched((prev) => ({ ...prev, [name]: true }));
    setErrors((prev) => ({ ...prev, [name]: validateField(name, value, form, t) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const fields = ["name", "email", "password", "confirmPassword"];
    const allTouched = {};
    fields.forEach((f) => { allTouched[f] = true; });
    setTouched((prev) => ({ ...prev, ...allTouched }));
    setAgreedTouched(true);

    const newErrors = {};
    fields.forEach((f) => {
      const err = validateField(f, form[f], form, t);
      if (err) newErrors[f] = err;
    });
    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0 || !agreed) return;

    setIsLoading(true);
    setServerError("");
    const result = await register({ name: form.name, email: form.email, password: form.password });
    setIsLoading(false);

    if (!result.success) {
      setServerError(result.error || t("auth.register.genericError", { defaultValue: "Registration failed. Please try again." }));
      return;
    }

    navigate("/login", { state: { justRegistered: true } });
  };

  const inputStyle = (field) => ({
    borderColor:
      errors[field] && touched[field] ? "var(--bdr-danger)"
      : !errors[field] && touched[field] ? "var(--bdr-success)"
      : undefined,
  });

  return (
    <div className="login-page">
      <AuthBrandPanel />

      <div className="login-form-panel">
        <AuthThemeToggle />

        <div className="login-card" style={{ maxWidth: "440px" }}>
        <div className="login-header">
          <h1>{t("auth.register.heading", { defaultValue: "Create Account" })}</h1>
        </div>
        <p className="login-subtitle">{t("auth.register.subtitle", { defaultValue: "Set up your HRMS Employee account" })}</p>

        {serverError && (
          <div className="form-error" style={{ marginBottom: "20px" }}>
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <FormField
            label={t("auth.register.fullNameLabel", { defaultValue: "Full Name" })} htmlFor="reg-name" required
            error={errors.name} touched={touched.name}
            success={!errors.name && !!form.name}
          >
            <input
              id="reg-name" name="name" type="text"
              value={form.name} onChange={handleChange} onBlur={handleBlur}
              placeholder={t("auth.register.fullNamePlaceholder", { defaultValue: "Jane Doe" })} autoComplete="name"
              style={inputStyle("name")}
            />
          </FormField>

          <FormField
            label={t("auth.common.emailAddressLabel", { defaultValue: "Email Address" })} htmlFor="reg-email" required
            error={errors.email} touched={touched.email}
            success={!errors.email && !!form.email}
          >
            <input
              id="reg-email" name="email" type="email"
              value={form.email} onChange={handleChange} onBlur={handleBlur}
              placeholder={t("auth.register.emailPlaceholder", { defaultValue: "jane.doe@company.com" })} autoComplete="email"
              style={inputStyle("email")}
            />
          </FormField>

          <FormField
            label={t("auth.common.passwordLabel", { defaultValue: "Password" })} htmlFor="reg-password" required
            error={errors.password} touched={touched.password}
            success={!errors.password && !!form.password}
            hint={t("auth.common.atLeast8CharsHint", { defaultValue: "At least 8 characters" })}
          >
            <div style={{ position: "relative" }}>
              <input
                id="reg-password" name="password"
                type={showPassword ? "text" : "password"}
                value={form.password} onChange={handleChange} onBlur={handleBlur}
                placeholder="••••••••" autoComplete="new-password"
                style={{ ...inputStyle("password"), paddingRight: "44px" }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? t("auth.register.hidePasswordAria", { defaultValue: "Hide password" }) : t("auth.register.showPasswordAria", { defaultValue: "Show password" })}
                style={{
                  position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", cursor: "pointer",
                  color: "var(--txt-secondary)", display: "flex", padding: "4px",
                }}
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-10-7-10-7a17.4 17.4 0 0 1 4.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 7 10 7a17.5 17.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M1 12s3-7 11-7 11 7 11 7-3 7-11 7-11-7-11-7z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </FormField>

          {/* Password strength meter */}
          {form.password && (
            <div style={{ marginTop: "-10px", marginBottom: "var(--sp-5)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <span style={{ fontSize: "var(--fs-2xs)", color: "var(--txt-secondary)" }}>{t("auth.register.strengthLabel", { defaultValue: "Password strength" })}</span>
                <span style={{ fontSize: "var(--fs-2xs)", color: strength.color, fontWeight: "var(--fw-medium)" }}>{strength.label}</span>
              </div>
              <div style={{ height: "4px", background: "var(--bg-surface-sub)", borderRadius: "var(--radius-full)" }}>
                <div style={{
                  height: "4px", borderRadius: "var(--radius-full)",
                  background: strength.color, width: `${strength.pct}%`,
                  transition: "width 0.2s ease, background-color 0.2s ease",
                }} />
              </div>
            </div>
          )}

          <FormField
            label={t("auth.register.confirmPasswordLabel", { defaultValue: "Confirm Password" })} htmlFor="reg-confirm-password" required
            error={errors.confirmPassword} touched={touched.confirmPassword}
            success={!errors.confirmPassword && !!form.confirmPassword}
          >
            <input
              id="reg-confirm-password" name="confirmPassword"
              type={showPassword ? "text" : "password"}
              value={form.confirmPassword} onChange={handleChange} onBlur={handleBlur}
              placeholder="••••••••" autoComplete="new-password"
              style={inputStyle("confirmPassword")}
            />
          </FormField>

          {/* Role info — read-only, no selector */}
          <div style={{
            display: "flex", alignItems: "center", gap: "var(--sp-3)",
            padding: "var(--sp-3) var(--sp-4)",
            background: "var(--bg-surface-alt)",
            border: "1px solid var(--bdr-subtle)",
            borderRadius: "var(--radius-md)",
            marginBottom: "var(--sp-5)",
          }}>
            <span style={{
              width: "36px", height: "36px", flexShrink: 0, borderRadius: "var(--radius-md)",
              background: "var(--bg-primary-subtle)", color: "var(--clr-primary-400)",
              display: "grid", placeItems: "center",
            }} aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
              </svg>
            </span>
            <div>
              <div style={{ fontSize: "var(--fs-sm)", fontWeight: "var(--fw-medium)", color: "var(--txt-primary)" }}>
                {t("auth.register.roleInfoTitle", { defaultValue: "Employee Account" })}
              </div>
              <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", marginTop: "2px" }}>
                {t("auth.register.roleInfoDescription", { defaultValue: "All new accounts start as Employee. An Admin can promote you to HR/Manager." })}
              </div>
            </div>
          </div>

          {/* Terms agreement */}
          <div style={{ marginBottom: "var(--sp-6)" }}>
            <label style={{
              display: "flex", alignItems: "flex-start", gap: "var(--sp-2)",
              cursor: "pointer", fontSize: "var(--fs-sm)", color: "var(--txt-secondary)",
            }}>
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => { setAgreed(e.target.checked); setAgreedTouched(true); }}
                style={{ marginTop: "2px", width: "16px", height: "16px", flexShrink: 0, cursor: "pointer" }}
              />
              <span>
                {t("auth.register.termsPrefix", { defaultValue: "I agree to the " })}<span style={{ color: "var(--txt-primary-brand)" }}>{t("auth.register.termsOfService", { defaultValue: "Terms of Service" })}</span>{t("auth.register.termsAnd", { defaultValue: " and " })}{" "}
                <span style={{ color: "var(--txt-primary-brand)" }}>{t("auth.register.privacyPolicy", { defaultValue: "Privacy Policy" })}</span>
              </span>
            </label>
            {!agreed && agreedTouched && (
              <span role="alert" style={{
                fontSize: "var(--fs-xs)", color: "var(--txt-danger)",
                display: "flex", alignItems: "center", gap: "4px", marginTop: "6px", marginLeft: "24px",
              }}>
                {t("auth.register.termsRequiredError", { defaultValue: "Please accept the terms to continue" })}
              </span>
            )}
          </div>

          <Button
            variant="primary"
            type="submit"
            style={{ width: "100%" }}
            disabled={isLoading}
          >
            {isLoading ? t("auth.register.submittingButton", { defaultValue: "Creating Account..." }) : t("auth.register.heading", { defaultValue: "Create Account" })}
          </Button>
        </form>

        <p style={{ textAlign: "center", marginTop: "24px", fontSize: "14px" }}>
          {t("auth.register.alreadyHaveAccount", { defaultValue: "Already have an account?" })}{" "}
          <Link to="/login" className="link-primary">{t("auth.common.signIn", { defaultValue: "Sign in" })}</Link>
        </p>
        </div>
      </div>
    </div>
  );
}

export default Register;
