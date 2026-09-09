/**
 * Recognises the failure a stale lazy-loaded chunk produces after a deploy.
 *
 * See components/ChunkErrorBoundary.jsx for the full explanation of why this
 * happens at all (render.yaml answers a missing .js file with index.html and
 * HTTP 200). This file exists separately so the predicate can be unit tested
 * and so the boundary stays a component-only module — exporting a plain
 * function beside a component is what react-refresh/only-export-components
 * warns about, and npm run lint runs --max-warnings 0.
 */

// Chrome, Firefox and Safari each word this differently, and not one of them
// names the actual cause. Match all of them rather than betting on a browser.
const CHUNK_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i, // Chrome / Edge
  /error loading dynamically imported module/i, // Firefox
  /Importing a module script failed/i, // Safari
  /Loading chunk \S+ failed/i, // webpack-style wording, harmless to keep
  /Unexpected token '</i, // the HTML-parsed-as-JS SyntaxError itself
];

export function isChunkLoadError(error) {
  const message = String(error?.message ?? error ?? "");
  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}
