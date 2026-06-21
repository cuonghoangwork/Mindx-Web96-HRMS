/**
 * Button — HRMS Design System v2
 *
 * Variants : primary | secondary | ghost | danger | success | brand-outline
 * Sizes    : xs | sm | md (default) | lg | xl
 * States   : disabled, loading
 * Layout   : iconOnly, fullWidth
 * Extras   : leftIcon, rightIcon, ButtonGroup, as (polymorphic)
 *
 * Usage:
 *   <Button variant="primary" onClick={fn}>Save</Button>
 *   <Button variant="danger" size="sm" leftIcon="🗑">Delete</Button>
 *   <Button variant="primary" loading>Processing...</Button>
 *   <Button as={Link} to="/employees" variant="primary">List</Button>
 *   <Button variant="ghost" iconOnly aria-label="Delete">🗑</Button>
 *
 *   <ButtonGroup>
 *     <Button variant="secondary">Cancel</Button>
 *     <Button variant="primary">Save</Button>
 *   </ButtonGroup>
 */

import { forwardRef } from "react";

/* ─── Spinner ─── */
function Spinner({ size = 16 }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 16 16" fill="none"
      aria-hidden="true"
      style={{ animation: "btn-spin 0.7s linear infinite", flexShrink: 0 }}
    >
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <style>{`@keyframes btn-spin { to { transform: rotate(360deg) } }`}</style>
    </svg>
  );
}

/* ─── Class builder ─── */
const VARIANT_CLASS = {
  primary:        "btn btn-primary",
  secondary:      "btn btn-secondary",
  ghost:          "btn btn-ghost",
  danger:         "btn btn-danger",
  success:        "btn btn-success",
  "brand-outline":"btn btn-brand-outline",
};

const SIZE_CLASS = {
  xs: "btn-xs",
  sm: "btn-sm",
  md: "",
  lg: "btn-lg",
  xl: "btn-xl",
};

function cls(...parts) {
  return parts.filter(Boolean).join(" ").trim();
}

/* ═══════════════════════════════════════════════ */
const Button = forwardRef(function Button(
  {
    children,
    leftIcon,
    rightIcon,
    variant = "secondary",
    size = "md",
    loading = false,
    disabled = false,
    iconOnly = false,
    fullWidth = false,
    as: Tag = "button",
    type = "button",
    className,
    style,
    onClick,
    ...rest
  },
  ref
) {
  const isDisabled = disabled || loading;
  const iconPx = { xs: 12, sm: 14, md: 16, lg: 18, xl: 20 }[size] ?? 16;

  const classes = cls(
    VARIANT_CLASS[variant] ?? "btn btn-secondary",
    SIZE_CLASS[size],
    iconOnly   && "btn-icon",
    fullWidth  && "btn-full",
    loading    && "btn-loading",
    className
  );

  const iconWrap = (node) =>
    node ? (
      <span aria-hidden="true" style={{ display: "inline-flex", alignItems: "center", fontSize: iconPx, lineHeight: 1 }}>
        {node}
      </span>
    ) : null;

  return (
    <Tag
      ref={ref}
      type={Tag === "button" ? type : undefined}
      className={classes}
      disabled={Tag === "button" ? isDisabled : undefined}
      aria-disabled={isDisabled || undefined}
      aria-busy={loading || undefined}
      onClick={isDisabled ? undefined : onClick}
      style={{
        opacity:       disabled && !loading ? 0.45 : undefined,
        cursor:        isDisabled ? "not-allowed" : undefined,
        pointerEvents: isDisabled ? "none" : undefined,
        width:         fullWidth ? "100%" : undefined,
        ...style,
      }}
      {...rest}
    >
      {loading ? <Spinner size={iconPx} /> : iconWrap(leftIcon)}

      {iconOnly
        ? <span className="sr-only">{children}</span>
        : <span>{children}</span>
      }

      {!loading && iconWrap(rightIcon)}
    </Tag>
  );
});

Button.displayName = "Button";

/* ─── ButtonGroup ─── */
export function ButtonGroup({ children, gap = "var(--sp-3)", style, className }) {
  return (
    <div
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap, flexWrap: "wrap", ...style }}
    >
      {children}
    </div>
  );
}

export default Button;
