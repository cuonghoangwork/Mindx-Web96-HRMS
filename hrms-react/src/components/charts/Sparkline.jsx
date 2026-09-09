
/* ─────────────────────────────────────────
   SVG Sparkline (pure SVG, no lib needed)
───────────────────────────────────────── */
export function Sparkline({ data = [], color = "var(--clr-primary-400)", height = 44 }) {
  if (data.length < 2) return null;
  const W = 160, H = height, pad = 4;
  const max = Math.max(...data, 1);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (W - pad * 2);
    const y = H - pad - ((v - min) / range) * (H - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = pts[pts.length - 1];
  const areaPath = `${pts.join(" ")} ${W - pad},${H - pad} ${pad},${H - pad}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height, display: "block", overflow: "visible" }}>
      <polygon points={areaPath} fill={color} fillOpacity="0.08" />
      <polyline points={pts.join(" ")} fill="none" stroke={color}
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {last && (
        <circle cx={last.split(",")[0]} cy={last.split(",")[1]}
          r="3.5" fill={color} />
      )}
    </svg>
  );
}
