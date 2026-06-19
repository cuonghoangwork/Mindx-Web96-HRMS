/**
 * id.js — ID helpers
 *
 * The seed/mock data in StoreContext.jsx still uses small numeric IDs (1, 2, 3 ...),
 * but values arriving from the URL (useParams(), useSearchParams()) are always strings,
 * and newly-created records need an ID that's guaranteed unique without relying on
 * Date.now() / Math.max(...ids)+1 races. Routing every ID generation/comparison/hash
 * through these four functions means swapping in real API-issued IDs later (e.g. Mongo
 * ObjectId strings) only requires changing what generateId() returns — every call site
 * already treats IDs as opaque values rather than assuming they're numbers.
 */

let counter = 0;

/** Generates a new unique id for client-only mock data (no backend yet to issue one). */
export function generateId() {
  counter += 1;
  return `${Date.now()}-${counter}`;
}

/** Loose equality between two ids that might be a number, a string, or a route-param string. */
export function idsMatch(a, b) {
  if (a === undefined || a === null || b === undefined || b === null) return false;
  return String(a) === String(b);
}

/** Array.prototype.sort comparator - numeric order when both ids are numeric, else string order. */
export function compareIds(a, b) {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return String(a).localeCompare(String(b));
}

/**
 * Deterministic small non-negative integer derived from an id, for seeding the mock
 * attendance generator. Numeric ids pass through unchanged (preserves the original
 * mock data's exact seed values); non-numeric ids (future string IDs) get hashed.
 */
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
