/**
 * Avatar — HRMS Design System v3 "Navy Signal Blue"
 *
 * Variants:
 *   initials  — auto-generates initials from name (default)
 *   image     — displays image from src
 *   icon      — icon fallback when no image
 *
 * Props:
 *   name      — full name, used to generate initials and aria-label
 *   src       — image URL (optional)
 *   size      — xs(24) | sm(32) | md(40, default) | lg(56) | xl(80)
 *   shape     — circle (default) | square
 *   color     — override background color (auto-picked from name if omitted)
 *   status    — "active" | "leave" | "remote" | "terminated" — shows corner dot
 *   className, style
 *
 * Extras:
 *   AvatarGroup  — stacks multiple Avatars together
 *
 * Usage:
 *   <Avatar name="John Doe" />
 *   <Avatar name="Jane Smith" src="/photos/jane.jpg" size="lg" status="active" />
 *   <Avatar name="Bob" size="sm" shape="square" />
 *   <AvatarGroup avatars={employees.slice(0,4)} max={3} />
 */

import { useTranslation } from "react-i18next";

/* ─── Color palette (auto-picked by name hash) ───
   v3 "Navy Signal Blue" — flat 5-color rotation lifted directly from
   the redesign mockup's avatar-chip palette (no gradients, matches the
   flat/border-forward aesthetic rather than v2's 10-color gradient set). */
const PALETTE = [
  ["#0b1f3a"],   // ink navy
  ["#2f6fed"],   // signal blue
  ["#4b5a6e"],   // slate
  ["#1d3f8f"],   // deep blue
  ["#334464"],   // navy-gray
];

function hashName(name = "") {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(h) % PALETTE.length;
}

function getInitials(name = "") {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";
}

/* ─── Size config ─── */
const SIZE = {
  xs: { px: 24, font: 10, dot: 7, dotPos: -1 },
  sm: { px: 32, font: 12, dot: 8, dotPos: -1 },
  md: { px: 40, font: 15, dot: 10, dotPos: -1 },
  lg: { px: 56, font: 20, dot: 12, dotPos: -1 },
  xl: { px: 80, font: 28, dot: 14, dotPos: -2 },
};

/* ─── Status dot color ─── */
const DOT_COLOR = {
  active:     "var(--clr-success-500)",
  leave:      "var(--clr-warning-500)",
  remote:     "var(--clr-info-500)",
  terminated: "var(--clr-danger-500)",
};

/* ─── Avatar ─── */
function Avatar({
  name = "",
  src,
  size = "md",
  shape = "circle",
  color,
  status,
  className = "",
  style,
  onClick,
}) {
  const { t } = useTranslation();
  const cfg = SIZE[size] ?? SIZE.md;
  const bg  = color ?? PALETTE[hashName(name)][0];
  const br  = shape === "circle" ? "50%" : "var(--radius-md)";

  const base = {
    width:    cfg.px,
    height:   cfg.px,
    borderRadius: br,
    flexShrink: 0,
    position: "relative",
    display:  "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: onClick ? "pointer" : "default",
    userSelect: "none",
    overflow: "visible",
    ...style,
  };

  const imgStyle = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    borderRadius: "inherit",
    display: "block",
  };

  const initialsStyle = {
    width:    "100%",
    height:   "100%",
    background: bg,
    borderRadius: br,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: cfg.font,
    fontWeight: 600,
    color: "#fff",
    letterSpacing: "0.02em",
  };

  const dotStyle = status && DOT_COLOR[status.toLowerCase()] ? {
    position: "absolute",
    bottom:  cfg.dotPos,
    right:   cfg.dotPos,
    width:   cfg.dot,
    height:  cfg.dot,
    borderRadius: "50%",
    background: DOT_COLOR[status.toLowerCase()],
    border: "2px solid var(--bg-surface, #fff)",
    zIndex: 1,
  } : null;

  return (
    <span
      className={className}
      style={base}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={name || t("avatar.fallbackLabel", { defaultValue: "Avatar" })}
      onClick={onClick}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick(e) : undefined}
    >
      {src ? (
        <img
          src={src}
          alt={name}
          style={imgStyle}
          onError={(e) => {
            // fallback to initials on image error
            e.currentTarget.style.display = "none";
            e.currentTarget.nextSibling.style.display = "flex";
          }}
        />
      ) : null}

      {/* Initials — shown when no src, or as fallback */}
      <span
        style={{
          ...initialsStyle,
          display: src ? "none" : "flex",
          position: src ? "absolute" : "relative",
          inset: src ? 0 : undefined,
        }}
        aria-hidden="true"
      >
        {getInitials(name)}
      </span>

      {dotStyle && <span aria-hidden="true" style={dotStyle} />}
    </span>
  );
}

/* ─── AvatarGroup ─── */
export function AvatarGroup({ avatars = [], max = 4, size = "sm", gap = -8 }) {
  const { t } = useTranslation();
  const visible = avatars.slice(0, max);
  const overflow = avatars.length - max;
  const cfg = SIZE[size] ?? SIZE.sm;

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
      }}
    >
      {visible.map((av, i) => (
        <span
          key={av.id ?? av.name ?? i}
          style={{
            marginLeft: i === 0 ? 0 : gap,
            zIndex: visible.length - i,
            display: "inline-flex",
            borderRadius: "50%",
            outline: "2px solid var(--bg-surface, #fff)",
          }}
        >
          <Avatar
            name={av.name}
            src={av.src}
            size={size}
            status={av.status?.toLowerCase()}
          />
        </span>
      ))}

      {overflow > 0 && (
        <span
          style={{
            marginLeft: gap,
            zIndex: 0,
            width:  cfg.px,
            height: cfg.px,
            borderRadius: "50%",
            background: "var(--bg-surface-alt, #f2f2f7)",
            border: "2px solid var(--bg-surface, #fff)",
            outline: "2px solid var(--bg-surface, #fff)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: cfg.font,
            fontWeight: 600,
            color: "var(--txt-secondary, #71707e)",
          }}
          aria-label={t("avatar.moreAriaLabel", { count: overflow, defaultValue_one: "+{{count}} more", defaultValue_other: "+{{count}} more" })}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}

/* ─── Exports ─── */
export { getInitials };
Avatar.displayName = "Avatar";
export default Avatar;
