import { useState } from "react";
import { useTranslation } from "react-i18next";
import Button from "../../components/Button";
import { roleLabel } from './formRules'

/* ─────────────────────────────────
   Success screen
───────────────────────────────── */
function CredentialRow({ label, value }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "var(--sp-3)",
      padding: "var(--sp-3) 0", borderBottom: "1px solid var(--bdr-subtle)",
    }}>
      <span style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)", width: "110px", flexShrink: 0, textAlign: "left" }}>
        {label}
      </span>
      <code style={{
        flex: 1, textAlign: "left", fontFamily: "monospace", fontSize: "var(--fs-md)",
        color: "var(--txt-primary)", wordBreak: "break-all",
      }}>{value}</code>
      <button
        type="button"
        onClick={copy}
        style={{
          flexShrink: 0, fontSize: "var(--fs-xs)", padding: "4px 10px",
          borderRadius: "var(--radius-sm)", cursor: "pointer",
          border: "1px solid var(--bdr-default)", background: "var(--bg-surface)",
          color: "var(--txt-primary)", fontFamily: "inherit",
        }}
      >{copied ? t("employees.addEmployee.successScreen.copied", { defaultValue: "Copied" }) : t("employees.addEmployee.successScreen.copy", { defaultValue: "Copy" })}</button>
    </div>
  );
}

export function SuccessScreen({ name, account, onDone }) {
  const { t } = useTranslation();
  const hasCredentials = Boolean(account?.tempPassword);

  return (
    <div style={{ textAlign: "center", padding: "var(--sp-12) var(--sp-6)" }}>
      <div style={{
        width: "80px", height: "80px", borderRadius: "50%",
        background: "var(--bg-success-subtle)", border: "2px solid var(--bdr-success)",
        display: "grid", placeItems: "center", fontSize: "36px",
        margin: "0 auto var(--sp-5)",
      }}>🎉</div>
      <h3 style={{ fontSize: "var(--fs-3xl)", fontWeight: "var(--fw-semibold)", color: "var(--txt-primary)", marginBottom: "var(--sp-2)" }}>
        {t("employees.addEmployee.successScreen.title", { defaultValue: "Added successfully!" })}
      </h3>
      <p style={{ fontSize: "var(--fs-md)", color: "var(--txt-secondary)" }}>
        <strong>{name}</strong> {t("employees.addEmployee.successScreen.addedToSystem", { defaultValue: "has been added to the system." })}
        {!hasCredentials && (
          <>
            <br />
            {t("employees.addEmployee.successScreen.redirecting", { defaultValue: "Redirecting to employee list..." })}
          </>
        )}
      </p>

      {account?.linked && (
        <p style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)", marginTop: "var(--sp-3)" }}>
          {t("employees.addEmployee.successScreen.linkedToExisting", { defaultValue: "Linked to the existing account" })} <strong>{account.email}</strong>.
        </p>
      )}

      {hasCredentials && (
        <>
          <div style={{
            maxWidth: "460px", margin: "var(--sp-7) auto 0",
            padding: "var(--sp-5)", textAlign: "left",
            background: "var(--bg-surface-alt)", border: "1px solid var(--bdr-subtle)",
            borderRadius: "var(--radius-lg)",
          }}>
            <div style={{
              fontSize: "var(--fs-xs)", fontWeight: "var(--fw-semibold)",
              textTransform: "uppercase", letterSpacing: "0.08em",
              color: "var(--txt-secondary)", marginBottom: "var(--sp-2)",
            }}>{t("employees.addEmployee.successScreen.loginDetailsTitle", { defaultValue: "Login details" })}</div>
            <CredentialRow label={t("common.fieldLabels.email", { defaultValue: "Email" })} value={account.email} />
            <CredentialRow label={t("employees.addEmployee.successScreen.tempPasswordLabel", { defaultValue: "Temp password" })} value={account.tempPassword} />
            <CredentialRow label={t("common.fieldLabels.role", { defaultValue: "Role" })} value={roleLabel(t, account.role) || account.role} />
          </div>

          <div style={{
            maxWidth: "460px", margin: "var(--sp-4) auto 0",
            padding: "var(--sp-4)", textAlign: "left",
            background: "var(--bg-warning-subtle, var(--bg-surface-alt))",
            border: "1px solid var(--bdr-warning, var(--bdr-subtle))",
            borderRadius: "var(--radius-md)",
            fontSize: "var(--fs-sm)", color: "var(--txt-warning, var(--txt-secondary))",
            display: "flex", gap: "var(--sp-3)", alignItems: "flex-start",
          }}>
            <span aria-hidden="true" style={{ flexShrink: 0 }}>⚠️</span>
            <span>
              {t("employees.addEmployee.successScreen.passwordWarning", { defaultValue: "This password is shown once only and is not stored anywhere. Copy it now and hand it over securely. The employee must change it at first sign-in." })}
            </span>
          </div>

          <Button
            variant="primary"
            onClick={onDone}
            style={{ marginTop: "var(--sp-6)" }}
          >
            {t("employees.addEmployee.successScreen.doneButton", { defaultValue: "Done" })}
          </Button>
        </>
      )}
    </div>
  );
}
