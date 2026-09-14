/**
 * Label + hint + error/success wrapper for any input.
 *
 *   <FormField label="Email" htmlFor="email" required
 *     error={errors.email} touched={touched.email} hint="Used for system login">
 *     <input id="email" type="email" ... />
 *   </FormField>
 *
 * `touched` gates the error/success display until the user has interacted;
 * `success` shows "Valid" only when there is no error. `type="inline"` puts
 * the label to the left (Settings toggle rows).
 */

import { useId, cloneElement, isValidElement } from "react";
import { useTranslation } from "react-i18next";

/* ─── Icons ─── */
function WarnIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M6 1L11 10H1L6 1Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
      <path d="M6 5V7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <circle cx="6" cy="8.5" r="0.6" fill="currentColor"/>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M3.5 6L5.5 8L8.5 4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

/* ═══════════════════════════════════════════════ */
function FormField({
  label,
  htmlFor,
  required  = false,
  hint,
  error,
  success   = false,
  touched   = false,
  disabled  = false,
  type      = "default",
  className = "",
  style,
  children,
}) {
  const { t } = useTranslation();
  const autoId  = useId();
  const fieldId = htmlFor ?? autoId;

  const showError   = !!(error && touched);
  const showSuccess = !!(success && touched && !error);

  /* ── Inject id + aria attrs into the child input ── */
  let child = children;
  if (isValidElement(children) && !children.props?.id) {
    child = cloneElement(children, {
      id: fieldId,
      "aria-describedby": showError
        ? `${fieldId}-msg`
        : showSuccess
        ? `${fieldId}-ok`
        : hint
        ? `${fieldId}-hint`
        : undefined,
      "aria-invalid":   showError  ? "true" : undefined,
      "aria-required":  required   ? "true" : undefined,
    });
  }

  /* ── Inline layout (Settings toggle rows) ── */
  if (type === "inline") {
    return (
      <div
        className={className}
        style={{
          display: "flex", justifyContent: "space-between",
          alignItems: "center", gap: "var(--sp-4)",
          opacity: disabled ? 0.5 : 1,
          ...style,
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: "var(--fs-md)", fontWeight: "var(--fw-medium)",
            color: "var(--txt-primary)",
          }}>
            {label}
            {required && (
              <span style={{ color: "var(--txt-danger)", marginLeft: "3px" }} aria-hidden="true">*</span>
            )}
          </div>
          {hint && (
            <div
              id={`${fieldId}-hint`}
              className="hint-sm"
            >
              {hint}
            </div>
          )}
        </div>
        {child}
      </div>
    );
  }

  /* ── Default layout ── */
  return (
    <div
      className={className}
      style={{
        display: "flex", flexDirection: "column", gap: "var(--sp-2)",
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      <label
        htmlFor={fieldId}
        style={{
          fontSize: "var(--fs-sm)", fontWeight: "var(--fw-medium)",
          color: "var(--txt-primary)", lineHeight: 1.4,
        }}
      >
        {label}
        {required && (
          <span style={{ color: "var(--txt-danger)", marginLeft: "3px" }} aria-hidden="true">*</span>
        )}
      </label>

      {/* Always reserves one line so inputs in the same grid row stay
          aligned whether or not they have a hint; hidden, not omitted, so
          nothing is announced when empty. */}
      <span
        id={hint ? `${fieldId}-hint` : undefined}
        aria-hidden={hint ? undefined : "true"}
        style={{
          fontSize: "var(--fs-xs)", color: "var(--txt-secondary)",
          marginTop: "-4px", lineHeight: 1.4,
          visibility: hint ? "visible" : "hidden",
        }}
      >
        {hint || " "}
      </span>

      {child}

      {showError && (
        <span
          id={`${fieldId}-msg`}
          role="alert"
          style={{
            fontSize: "var(--fs-xs)", color: "var(--txt-danger)",
            display: "flex", alignItems: "center", gap: "4px",
            lineHeight: 1.4,
          }}
        >
          <WarnIcon />
          {error}
        </span>
      )}

      {showSuccess && (
        <span
          id={`${fieldId}-ok`}
          style={{
            fontSize: "var(--fs-xs)", color: "var(--txt-success)",
            display: "flex", alignItems: "center", gap: "4px",
            lineHeight: 1.4,
          }}
        >
          <CheckIcon />
          {t("formField.valid", { defaultValue: "Valid" })}
        </span>
      )}
    </div>
  );
}

FormField.displayName = "FormField";
export default FormField;
