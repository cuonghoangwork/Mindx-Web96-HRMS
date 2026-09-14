/**
 * IDs are opaque: route params are strings, mock rows are numbers, real
 * records are ObjectId strings. Every generation/comparison/hash goes
 * through here so no call site assumes a type.
 */

let counter = 0;

/** New id for client-only mock data. */
export function generateId() {
  counter += 1;
  return `${Date.now()}-${counter}`;
}

/** Loose equality across number / string ids. */
export function idsMatch(a, b) {
  if (a === undefined || a === null || b === undefined || b === null) return false;
  return String(a) === String(b);
}

/** Sort comparator: numeric when both are numeric, else string order. */
export function compareIds(a, b) {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return String(a).localeCompare(String(b));
}

/** Small deterministic integer from an id, for the mock attendance generator's seed. */
export function numericSeed(id) {
  const n = Number(id);
  if (!Number.isNaN(n)) return n;
  const str = String(id);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 1000;
}
