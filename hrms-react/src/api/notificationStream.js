/**
 * EventSource plus the three things it does not do: auth (a single-use
 * ticket in the query string — EventSource cannot send a header), our own
 * reconnect loop (the browser's retry replays the same spent ticket and
 * 401s forever), and a refetch on every RE-connect so nothing delivered
 * while the stream was down is missed.
 */

import { API_BASE } from "./client";
import { NotificationsAPI } from "./index";

const FIRST_RETRY_MS = 1000;
const MAX_RETRY_MS = 30000;

/**
 * @param {object} handlers
 * @param {(notification: object) => void} handlers.onNotification
 * @param {() => void} handlers.onReconnect  refetch — the stream was down
 * @returns {{ close: () => void }}
 */
export function connectNotificationStream({ onNotification, onReconnect } = {}) {
  // No EventSource (SSR, tests): no live updates rather than a throw.
  if (typeof EventSource === "undefined") {
    return { close: () => {} };
  }

  let source = null;
  let retryTimer = null;
  let attempt = 0;
  let closed = false;

  function scheduleRetry() {
    if (closed || retryTimer) return;
    // 1s, 2s, 4s … capped at 30s so a down backend is not hammered by every open tab.
    const delay = Math.min(MAX_RETRY_MS, FIRST_RETRY_MS * 2 ** attempt);
    attempt += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      open();
    }, delay);
  }

  function teardownSource() {
    if (!source) return;
    source.onopen = null;
    source.onerror = null;
    source.close();
    source = null;
  }

  async function open() {
    if (closed || source) return;

    let ticket;
    try {
      const res = await NotificationsAPI.streamTicket();
      ticket = res.data?.ticket;
    } catch {
      scheduleRetry();
      return;
    }
    if (closed || !ticket) {
      if (!closed) scheduleRetry();
      return;
    }

    const url = `${API_BASE}/notifications/stream?ticket=${encodeURIComponent(ticket)}`;
    source = new EventSource(url);

    source.addEventListener("notification", (event) => {
      try {
        onNotification?.(JSON.parse(event.data));
      } catch {
        // a malformed frame must not kill the connection
      }
    });

    source.onopen = () => {
      const wasReconnect = attempt > 0;
      attempt = 0;
      if (wasReconnect) onReconnect?.();
    };

    source.onerror = () => {
      // Dropped connection, spent ticket, or the server's 15-minute cap: all want a fresh ticket.
      teardownSource();
      scheduleRetry();
    };
  }

  // Waking from sleep leaves a dead socket that fires no error; reconnect on becoming visible.
  function onVisibility() {
    if (closed || document.visibilityState !== "visible" || source) return;
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    open();
  }
  document.addEventListener("visibilitychange", onVisibility);

  open();

  return {
    close() {
      closed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      teardownSource();
    },
  };
}

export default connectNotificationStream;
