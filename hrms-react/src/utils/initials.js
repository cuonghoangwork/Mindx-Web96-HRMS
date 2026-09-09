/**
 * getInitials — one letter per word, capped at two, uppercased.
 *
 * Lived in components/Avatar.jsx until it was moved here: exporting a plain
 * function beside a component trips react-refresh/only-export-components,
 * which is the lint rule blocking `npm run lint` from gating CI. The
 * behaviour is unchanged — Avatar.test.jsx still covers it.
 */
export function getInitials(name = "") {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";
}
