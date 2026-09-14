import { Component } from "react";
import { isChunkLoadError } from "../utils/chunkErrors";

/**
 * Recovers from a stale lazy-loaded chunk after a deploy. Vite content-hashes
 * chunk names, so a tab open across a redeploy requests a path that now
 * 404s (measured against Render: the SPA rewrite skips paths with an
 * extension), the dynamic import rejects, and React.lazy throws past every
 * Suspense boundary. Reload once — that re-fetches index.html and the new
 * names — rate-limited through sessionStorage so a genuinely broken deploy
 * degrades to a readable error instead of a refresh loop.
 */

const RELOAD_KEY = "hrms-chunk-reload-at";
const RELOAD_COOLDOWN_MS = 10_000;

// sessionStorage throws in some privacy modes. Fail open: prefer reloading to a dead page.
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
    // see readLastReload
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

    // Already reloaded once: fall through to the visible fallback.
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

    // A reload is in flight; do not flash an error nobody will finish reading.
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
