/**
 * FormField — HRMS Design System
 *
 * Universal input wrapper component for HRMS.
 * Standardises label + helper text + error/success message
 * replaces 3 scattered patterns (form-group className,
 * inline Field in AddEmployee, and manual span in EmployeeModal).
 *
 * Props:
 *   label       — text label (string, required)
 *   htmlFor     — id of the inner input, used for <label>
 *   required    — shows red * after label
 *   hint        — muted helper text, shown below label
 *   error       — error message (string). If set → red border + message
 *   success     — boolean. If true and no error → green border + "Valid"
 *   touched     — boolean. Only shows error/success after user interaction
 *   disabled    — dims the entire field
 *   className   — extra class on wrapper div
 *   style       — extra style on wrapper div
 *   children    — input/select/textarea element
 *
 * Variants (passed via type prop):
 *   "default"   — label above, input below (default)
 *   "inline"    — label left, input right (for Settings toggle)
 *
 * Usage:
 *   // Basic
 *   <FormField label="Full Name" required htmlFor="name">
 *     <input id="name" ... />
 *   </FormField>
 *
 *   // With validation
 *   <FormField label="Email" htmlFor="email"
 *     error={errors.email} touched={touched.email}
 *     hint="Used for system login">
 *     <input id="email" type="email" ... />
 *   </FormField>
 *
 *   // Inline (Settings page)
 *   <FormField label="Dark Mode" type="inline">
 *     <Toggle ... />
 *   </FormField>
 */

import { useId } from "react";

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
  /* Auto-generate id if htmlFor is not provided */
  const autoId  = useId();
  const fieldId = htmlFor ?? autoId;

  const showError   = !!(error && touched);
  const showSuccess = !!(success && touched && !error);

  /* ── Inject id + aria attrs into child input if not already set ── */
  let child = children;
  if (children && !children?.props?.id) {
    try {
      const React = require("react");
      child = React.cloneElement(children, {
        id: fieldId,
        "aria-describedby": showError ? `${fieldId}-msg` : showSuccess ? `${fieldId}-ok` : hint ? `${fieldId}-hint` : undefined,
        "aria-invalid": showError ? "true" : undefined,
        "aria-required": required ? "true" : undefined,
      });
    } catch {
      child = children;
    }
  }

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
            <div id={`${fieldId}-hint`} style={{
              fontSize: "var(--fs-sm)", color: "var(--txt-secondary)", marginTop: "2px",
            }}>
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
      {/* Label */}
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

      {/* Helper text */}
      {hint && (
        <span
          id={`${fieldId}-hint`}
          style={{
            fontSize: "var(--fs-xs)", color: "var(--txt-secondary)",
            marginTop: "-4px", lineHeight: 1.4,
          }}
        >
          {hint}
        </span>
      )}

      {/* Input */}
      {child}

      {/* Error message */}
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

      {/* Success message */}
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
          Valid
        </span>
      )}
    </div>
  );
}

FormField.displayName = "FormField";
export default FormField;
