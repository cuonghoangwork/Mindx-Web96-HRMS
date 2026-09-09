import { Component } from "react";
import { isChunkLoadError } from "../utils/chunkErrors";

/**
 * ChunkErrorBoundary — recovers from a stale lazy-loaded chunk after a deploy.
 *
 * WHY THIS EXISTS. render.yaml ends with a catch-all rewrite:
 *
 *   routes: [{ type: rewrite, source: /*, destination: /index.html }]
 *
 * Files that exist are served first, so this is invisible while the app ships
 * as one bundle. Route-level React.lazy changes that. Vite emits content-hashed
 * chunk names, so every redeploy renames all of them. A user with the tab
 * already open then navigates, the browser requests the OLD chunk path, that
 * file no longer exists, and the rewrite answers with index.html carrying
 * HTTP 200 and Content-Type: text/html. The browser tries to parse HTML as
 * JavaScript and the dynamic import rejects.
 *
 * Nothing upstream can catch this: the status is 200, fetch resolves happily,
 * and the failure only surfaces in the module parser two hops later. Without a
 * boundary the rejection unmounts the whole tree to a blank white page, because
 * a rejected React.lazy throws past every Suspense boundary to the nearest
 * error boundary — and before this file there were none anywhere in src/.
 *
 * The fix is to reload once, which re-fetches index.html and picks up the new
 * chunk names. The reload is rate-limited through sessionStorage so a genuinely
 * broken deploy degrades to a readable error instead of an infinite refresh
 * loop. The timestamp expires on its own, so there is nothing to clean up on a
 * successful load.
 *
 * This trap is not Render-specific — any host with a `/* -> index.html` rule
 * (Netlify, Vercel, S3+CloudFront) behaves the same way.
 */

const RELOAD_KEY = "hrms-chunk-reload-at";
const RELOAD_COOLDOWN_MS = 10_000;

// sessionStorage throws outright in some privacy modes, which would turn a
// recoverable chunk error into an unrecoverable one. Fail open: if we cannot
// remember that we already reloaded, prefer reloading to showing a dead page.
function readLastReload() {
  try {
    return Number(sessionStorage.getItem(RELOAD_KEY)) || 0;
  } catch {
    return 0;
  }
}

function markReloaded() {
  try {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // Nothing to do — see readLastReload above.
  }
}

export class ChunkErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, reloading: false };
  }

  static getDerivedStateFromError(error) {
    return { error, reloading: isChunkLoadError(error) };
  }

  componentDidCatch(error) {
    if (!isChunkLoadError(error)) return;

    // Already reloaded once in the last few seconds: reloading again would
    // just loop. Fall through to the visible fallback instead.
    if (Date.now() - readLastReload() < RELOAD_COOLDOWN_MS) {
      this.setState({ reloading: false });
      return;
    }

    markReloaded();
    window.location.reload();
  }

  render() {
    const { error, reloading } = this.state;
    if (!error) return this.props.children;

    // A reload is already in flight — render nothing rather than flashing an
    // error the user will never finish reading.
    if (reloading) return null;

    const chunkFailed = isChunkLoadError(error);

    return (
      <div
        role="alert"
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "var(--sp-6)",
          background: "var(--bg-page)",
          textAlign: "center",
        }}
      >
        <div style={{ display: "grid", gap: "var(--sp-4)", maxWidth: "32rem" }}>
          <h1 style={{ color: "var(--txt-primary)", fontSize: "var(--fs-lg)", margin: 0 }}>
            {chunkFailed ? "This page needs a refresh" : "Something went wrong"}
          </h1>
          <p style={{ color: "var(--txt-secondary)", fontSize: "var(--fs-md)", margin: 0 }}>
            {chunkFailed
              ? "The app was updated while this tab was open, and reloading did not pick up the new version. Refreshing again usually fixes it."
              : "An unexpected error stopped this page from loading."}
          </p>
          <div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ChunkErrorBoundary;
