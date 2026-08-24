/**
 * Badge — HRMS Design System v3 "Navy Signal Blue"
 * (No structural changes needed for v3 — fully token/class-driven via
 * .badge/.badge-* in index.css; reskin was a token-value swap only.)
 *
 * Variants (semantic):
 *   status  : active | leave | remote | terminated | pending
 *   type    : full-time | part-time | contract | intern
 *   generic : primary | success | warning | danger | info | neutral
 *
 * Props:
 *   variant   — variant name (default: "neutral")
 *   size      — sm | md (default) | lg
 *   dot       — boolean, shows dot before label
 *   icon      — ReactNode, icon before label
 *   pill      — boolean, fully rounded (default true)
 *   children  — label text
 *
 * Usage:
 *   <Badge variant="active">Active</Badge>
 *   <Badge variant="leave" dot>On Leave</Badge>
 *   <Badge variant="full-time" size="sm">Full-time</Badge>
 *   <StatusBadge status={employee.status} />
 *   <TypeBadge type={employee.type} />
 */

import { useTranslation } from "react-i18next";

/* ─── Variant → CSS class mapping ─── */
const VARIANT_CLASS = {
  // Employee status
  active:      "badge badge-active",
  leave:       "badge badge-leave",
  "on leave":  "badge badge-leave",
  remote:      "badge badge-remote",
  terminated:  "badge badge-terminated",
  pending:     "badge badge-pending",

  // Contract type — matches mockup's typeTagStyleFor exactly: Full-time
  // = accent tint, Part-time = purple, Contract = teal (same value as
  // Info in the mockup's own token object), Intern falls into the
  // neutral tint (its "else" branch).
  "full-time":  "badge badge-primary",
  "part-time":  "badge badge-purple",
  contract:     "badge badge-info",
  intern:       "badge badge-pending",

  // Generic semantic
  primary:  "badge badge-primary",
  success:  "badge badge-active",
  warning:  "badge badge-leave",
  danger:   "badge badge-terminated",
  info:     "badge badge-remote",
  neutral:  "badge badge-pending",
};

const SIZE_STYLE = {
  sm: { fontSize: "10px", padding: "2px 8px" },
  md: {},
  lg: { fontSize: "var(--fs-sm)",  padding: "5px 14px" },
};

function Badge({
  variant = "neutral",
  size = "md",
  dot = false,
  icon,
  pill = false,
  className = "",
  style,
  children,
}) {
  const baseClass = VARIANT_CLASS[variant?.toLowerCase()] ?? "badge badge-pending";
  const cls = [baseClass, className].filter(Boolean).join(" ");

  return (
    <span
      className={cls}
      style={{
        // mockup's status/type tags carry no border-radius at all (flat
        // rectangular tags); `pill` stays available for any one-off
        // caller that explicitly wants a rounded dot-style badge.
        borderRadius: pill ? "var(--radius-full)" : "0",
        ...SIZE_STYLE[size],
        ...style,
      }}
    >
      {dot && (
        <span
          aria-hidden="true"
          style={{
            display: "inline-block",
            width: "6px", height: "6px",
            borderRadius: "50%",
            background: "currentColor",
            opacity: 0.7,
            flexShrink: 0,
          }}
        />
      )}
      {icon && (
        <span aria-hidden="true" style={{ display: "inline-flex", alignItems: "center", lineHeight: 1 }}>
          {icon}
        </span>
      )}
      {children}
    </span>
  );
}

/* ─── StatusBadge: auto-selects variant from status string ─── */
export function StatusBadge({ status, size, dot = false, ...rest }) {
  const map = {
    "Active":     "active",
    "On Leave":   "leave",
    "Remote":     "remote",
    "Terminated": "terminated",
  };
  return (
    <Badge variant={map[status] ?? "neutral"} size={size} dot={dot} {...rest}>
      {status}
    </Badge>
  );
}

/* ─── TypeBadge: contract type badge ─── */
export function TypeBadge({ type, size, ...rest }) {
  const map = {
    "Full-time": "full-time",
    "Part-time": "part-time",
    "Contract":  "contract",
    "Intern":    "intern",
  };
  return (
    <Badge variant={map[type] ?? "neutral"} size={size} {...rest}>
      {type}
    </Badge>
  );
}

/* ─── CandidateStageBadge: hiring pipeline stage badge ─── */
export function CandidateStageBadge({ stage, size, ...rest }) {
  const { t } = useTranslation();
  const map = {
    Applied:   "neutral",
    Screening: "info",
    Interview: "warning",
    Offer:     "primary",
    Hired:     "success",
    Rejected:  "danger",
  };
  return (
    <Badge variant={map[stage] ?? "neutral"} size={size} {...rest}>
      {t(`common.candidateStages.${stage}`, { defaultValue: stage })}
    </Badge>
  );
}

Badge.displayName = "Badge";
export default Badge;
