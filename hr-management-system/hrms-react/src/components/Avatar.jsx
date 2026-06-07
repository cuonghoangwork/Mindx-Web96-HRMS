/**
 * Avatar — HRMS Design System
 *
 * Variants:
 *   initials  — tự lấy initials từ name (default)
 *   image     — hiển thị ảnh từ src
 *   icon      — icon fallback khi không có ảnh
 *
 * Props:
 *   name      — full name, dùng để lấy initials và aria-label
 *   src       — URL ảnh (optional)
 *   size      — xs(24) | sm(32) | md(40, default) | lg(56) | xl(80)
 *   shape     — circle (default) | square
 *   color     — override màu nền (nếu không truyền thì tự pick từ name)
 *   status    — "active" | "leave" | "remote" | "terminated" — hiện dot góc
 *   className, style
 *
 * Extras:
 *   AvatarGroup  — stack nhiều Avatar lại
 *
 * Usage:
 *   <Avatar name="John Doe" />
 *   <Avatar name="Jane Smith" src="/photos/jane.jpg" size="lg" status="active" />
 *   <Avatar name="Bob" size="sm" shape="square" />
 *   <AvatarGroup avatars={employees.slice(0,4)} max={3} />
 */

/* ─── Color palette (pick by name hash) ─── */
const PALETTE = [
  ["linear-gradient(135deg,#7152f3,#9880f4)"],   // purple
  ["linear-gradient(135deg,#10b981,#34d399)"],   // green
  ["linear-gradient(135deg,#f59e0b,#fbbf24)"],   // amber
  ["linear-gradient(135deg,#3b82f6,#60a5fa)"],   // blue
  ["linear-gradient(135deg,#ef4444,#f87171)"],   // red
  ["linear-gradient(135deg,#a78bfa,#c4b5fd)"],   // violet
  ["linear-gradient(135deg,#0ea5e9,#38bdf8)"],   // sky
  ["linear-gradient(135deg,#d946ef,#e879f9)"],   // fuchsia
  ["linear-gradient(135deg,#f43f5e,#fb7185)"],   // rose
  ["linear-gradient(135deg,#06b6d4,#22d3ee)"],   // cyan
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
  active:     "#10b981",
  leave:      "#f59e0b",
  remote:     "#3b82f6",
  terminated: "#ef4444",
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
      aria-label={name || "Avatar"}
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
          aria-label={`+${overflow} more`}
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
