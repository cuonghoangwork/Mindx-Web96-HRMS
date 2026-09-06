/**
 * notificationStream.js — the live notification feed (Level 1).
 *
 * Wraps EventSource with the three things it does not do for you:
 *
 * 1. **Auth.** EventSource cannot send an Authorization header, so each
 *    connection starts by fetching a single-use ticket over the normal
 *    authenticated fetch and putting that in the query string. See
 *    hrms-backend/utils/tokens.js for why a ticket rather than the access
 *    token itself.
 *
 * 2. **Reconnection.** EventSource retries on its own, but it replays the
 *    SAME url — and the ticket is single-use, so its retry is guaranteed to
 *    401 forever. Every reconnect here has to go back for a fresh ticket,
 *    which means owning the retry loop rather than letting the browser do it.
 *
 * 3. **Catching up.** A stream delivers nothing while it is down. On every
 *    successful RE-connect (not the first connect — the initial page load
 *    already fetched) the caller is told to refetch, which is what makes
 *    "you never miss a notification" actually true rather than nearly true.
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
  // Server-rendered or test environments without EventSource: degrade to
  // "no live updates" rather than throwing on import.
  if (typeof EventSource === "undefined") {
    return { close: () => {} };
  }

  let source = null;
  let retryTimer = null;
  let attempt = 0;
  let closed = false;

  function scheduleRetry() {
    if (closed || retryTimer) return;
    // 1s, 2s, 4s … capped at 30s. The cap matters more than the curve: a
    // backend that is down should not be getting a request per second from
    // every open tab.
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
      // Includes the 401 path, where apiFetch has already tried a token
      // refresh and redirected to /login if that failed. Nothing to add.
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
        // A malformed frame must not kill the connection.
      }
    });

    source.onopen = () => {
      const wasReconnect = attempt > 0;
      attempt = 0;
      if (wasReconnect) onReconnect?.();
    };

    source.onerror = () => {
      // Fires for a dropped connection, a 401 on a spent ticket, and the
      // server's own 15-minute connection cap. All three want the same
      // thing: drop this source and come back with a new ticket.
      teardownSource();
      scheduleRetry();
    };
  }

  // A laptop waking from sleep leaves a dead socket that fires no error
  // until something touches it. Reconnect immediately on becoming visible
  // rather than waiting out a backoff that may already be at 30s.
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
