/**
 * EmployeeStatusBadge — HRMS Design System v3 "Navy Signal Blue"
 * (No structural changes needed for v3 — fully token-driven via var(--...)
 * references, no hardcoded colors; reskin was a token-value swap only.)
 *
 * Dedicated status badge for employee records.
 * More opinionated than the generic Badge — includes
 * status-specific icons, pulse animation for Active,
 * and a standalone dot-only mode for table cells.
 *
 * Statuses: Active | On Leave | Remote | Terminated
 *
 * Props:
 *   status   — "Active" | "On Leave" | "Remote" | "Terminated" (required)
 *   size     — "sm" | "md" (default) | "lg"
 *   variant  — "badge" (default) | "dot" | "pill"
 *              badge → icon + label  (standard)
 *              dot   → coloured dot only (compact, e.g. Avatar corner)
 *              pill  → dot + label, no border (lighter weight)
 *   pulse    — boolean, animates dot for Active (default true)
 *   className, style
 *
 * Usage:
 *   <EmployeeStatusBadge status="Active" />
 *   <EmployeeStatusBadge status="On Leave" size="lg" />
 *   <EmployeeStatusBadge status="Remote" variant="pill" />
 *   <EmployeeStatusBadge status="Active" variant="dot" />
 *   <EmployeeStatusBadge status="Terminated" pulse={false} />
 *
 * Drop-in for StatusBadge:
 *   Replace  <StatusBadge status={emp.status} dot />
 *   With     <EmployeeStatusBadge status={emp.status} />
 */

/* ─── Status config ─── */
const CONFIG = {
  "Active": {
    color:      "var(--clr-success-500)",
    bg:         "var(--bg-success-subtle)",
    border:     "var(--bdr-success)",
    text:       "var(--txt-success)",
    darkText:   "var(--clr-success-400)",
    icon: (
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
        <circle cx="4" cy="4" r="3" fill="currentColor" />
      </svg>
    ),
  },
  "On Leave": {
    color:    "var(--clr-warning-500)",
    bg:       "var(--bg-warning-subtle)",
    border:   "var(--bdr-warning)",
    text:     "var(--txt-warning)",
    darkText: "var(--clr-warning-400)",
    icon: (
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
        <path d="M5 1v4l2.5 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2"/>
      </svg>
    ),
  },
  "Remote": {
    color:    "var(--clr-info-500)",
    bg:       "var(--bg-info-subtle)",
    border:   "var(--bdr-info)",
    text:     "var(--txt-info)",
    darkText: "var(--clr-info-400)",
    icon: (
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
        <rect x="1" y="3" width="8" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
        <path d="M3 3V2.5a2 2 0 0 1 4 0V3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        <circle cx="5" cy="5.5" r="1" fill="currentColor"/>
      </svg>
    ),
  },
  "Terminated": {
    color:    "var(--clr-danger-500)",
    bg:       "var(--bg-danger-subtle)",
    border:   "var(--bdr-danger)",
    text:     "var(--txt-danger)",
    darkText: "var(--clr-danger-400)",
    icon: (
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
        <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2"/>
        <path d="M3 3l4 4M7 3l-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
    ),
  },
};

/* ─── Size scale ─── */
const SIZE = {
  sm: { fontSize: "10px", padding: "2px 7px",   gap: "4px",  dotSize: "6px",  iconSize: 8 },
  md: { fontSize: "12px", padding: "3px 10px",  gap: "5px",  dotSize: "7px",  iconSize: 10 },
  lg: { fontSize: "13px", padding: "5px 13px",  gap: "6px",  dotSize: "8px",  iconSize: 11 },
};

/* ═══════════════════════════════════════════════ */
function EmployeeStatusBadge({
  status,
  size    = "md",
  variant = "badge",
  pulse   = true,
  className = "",
  style,
}) {
  const cfg  = CONFIG[status] ?? CONFIG["Active"];
  const sz   = SIZE[size]     ?? SIZE.md;
  const isActive = status === "Active";

  /* ── dot only ── */
  if (variant === "dot") {
    return (
      <span
        role="img"
        aria-label={status}
        className={className}
        style={{
          display:       "inline-block",
          width:         sz.dotSize,
          height:        sz.dotSize,
          borderRadius:  "50%",
          background:    cfg.color,
          flexShrink:    0,
          animation:     (isActive && pulse) ? "status-pulse 2s ease-in-out infinite" : "none",
          ...style,
        }}
      />
    );
  }

  /* ── pill (dot + label, no bg/border) ── */
  if (variant === "pill") {
    return (
      <span
        className={className}
        style={{
          display:    "inline-flex",
          alignItems: "center",
          gap:        sz.gap,
          fontSize:   sz.fontSize,
          fontWeight: 500,
          color:      cfg.text,
          lineHeight: 1,
          ...style,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width:      sz.dotSize,
            height:     sz.dotSize,
            borderRadius: "50%",
            background: cfg.color,
            flexShrink: 0,
            animation:  (isActive && pulse) ? "status-pulse 2s ease-in-out infinite" : "none",
          }}
        />
        {status}
      </span>
    );
  }

  /* ── badge (default) ── */
  return (
    <span
      className={className}
      style={{
        display:       "inline-flex",
        alignItems:    "center",
        gap:           sz.gap,
        padding:       sz.padding,
        borderRadius:  "var(--radius-full)",
        border:        `1px solid ${cfg.border}`,
        background:    cfg.bg,
        color:         cfg.text,
        fontSize:      sz.fontSize,
        fontWeight:    500,
        lineHeight:    1,
        whiteSpace:    "nowrap",
        userSelect:    "none",
        ...style,
      }}
    >
      {/* Animated dot for Active, icon for others */}
      {isActive ? (
        <span
          aria-hidden="true"
          style={{
            width:        sz.dotSize,
            height:       sz.dotSize,
            borderRadius: "50%",
            background:   cfg.color,
            flexShrink:   0,
            animation:    pulse ? "status-pulse 2s ease-in-out infinite" : "none",
          }}
        />
      ) : (
        <span
          aria-hidden="true"
          style={{
            display:    "inline-flex",
            alignItems: "center",
            fontSize:   sz.iconSize,
            flexShrink: 0,
          }}
        >
          {cfg.icon}
        </span>
      )}
      {status}
    </span>
  );
}

EmployeeStatusBadge.displayName = "EmployeeStatusBadge";
export default EmployeeStatusBadge;
