
export const DEPT_COLORS = [
  "var(--clr-primary-400)",
  "var(--clr-info-500)",
  "var(--clr-success-500)",
  "var(--clr-warning-500)",
  "var(--clr-danger-500)",
  "var(--clr-primary-300)",
  "var(--clr-info-400)",
];

export function colorForName(name, palette) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

export function csvCell(value) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
