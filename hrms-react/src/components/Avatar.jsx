/**
 * Props: name (initials + aria-label), src, size xs|sm|md|lg|xl, shape
 * circle|square, color (auto-picked from name if omitted), status (corner
 * dot). AvatarGroup stacks several with a +N overflow.
 */

import { useTranslation } from "react-i18next";
import { getInitials } from "../utils/initials";

/* ─── Palette, picked by name hash. Deliberately theme-independent. ─── */
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
            e.currentTarget.style.display = "none";
            e.currentTarget.nextSibling.style.display = "flex";
          }}
        />
      ) : null}

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
Avatar.displayName = "Avatar";
export default Avatar;
