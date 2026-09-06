/**
 * desktopNotify.js — OS-level toasts for live notifications (Level 2).
 *
 * Sits on top of the SSE feed from Level 1: the stream decides *what*
 * arrived, this decides whether the operating system should say so.
 *
 * Two independent switches, both of which must be on:
 *
 *   allowed — `Notification.permission`, owned by the browser. The user
 *             grants it once per origin and we cannot revoke it in code.
 *   wanted  — a localStorage flag, owned by us. Someone who granted
 *             permission months ago must still be able to turn toasts off
 *             without digging through browser settings.
 *
 * Both live per-device on purpose, which is why there is no server-side
 * preference for this. A toggle stored on the User document would claim
 * desktop notifications are "on" for a phone that never granted permission
 * and cannot show them — the state and the truth would silently disagree.
 * Push subscriptions (Level 3) are per-device for the same reason.
 *
 * Never prompts on load. Chrome penalises origins that ask unprompted, and
 * users reflexively click Block — which is unrecoverable in-page. The
 * request happens only from the Settings toggle, i.e. a real user gesture.
 */

const WANTED_KEY = "hrms-desktop-notifications";

/**
 * Categories that never raise an OS toast, per the urgency map in
 * HRMS_REALTIME_NOTIFICATIONS_PLAN.md §0.4.
 *
 * These are CLIENT category values, which are not always the database ones
 * — hrms-backend/utils/mappers.js maps db "hiring" to client "interview".
 * "system" happens to be identical on both sides.
 *
 * Only the desktop column of that table is enforced here, because desktop
 * is the only channel the browser decides. When a channel the SERVER sends
 * (email, Telegram) arrives, the rest of the table has to live server-side
 * — a client cannot decline an email that was already sent.
 */
const SILENT_CATEGORIES = new Set(["system"]);

export function isSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

/** "granted" | "denied" | "default" | "unsupported" */
export function permissionState() {
  return isSupported() ? Notification.permission : "unsupported";
}

export function isWanted() {
  try {
    return localStorage.getItem(WANTED_KEY) === "true";
  } catch {
    // Private windows and "block site data" both throw on access rather
    // than returning null. Treat an unreadable preference as "off".
    return false;
  }
}

export function setWanted(value) {
  try {
    if (value) localStorage.setItem(WANTED_KEY, "true");
    else localStorage.removeItem(WANTED_KEY);
  } catch {
    // Not persistable here — the toggle still works for this session.
  }
  return Boolean(value);
}

/** Both switches on. The single check every caller should use. */
export function isEnabled() {
  return isSupported() && Notification.permission === "granted" && isWanted();
}

/**
 * Ask the browser for permission. MUST be called from a user gesture.
 *
 * Returns the resulting permission without changing the `wanted` flag —
 * granting permission and wanting toasts are separate decisions, and the
 * caller records the second one.
 */
export async function ensurePermission() {
  if (!isSupported()) return "unsupported";
  // Already decided, in either direction. Asking again is a no-op in every
  // browser, and "denied" can only be undone in browser settings.
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/**
 * Should this notification raise an OS toast right now?
 *
 * `hidden` is injectable so this stays testable without driving real
 * document visibility.
 */
export function shouldNotify(notification, { hidden } = {}) {
  if (!notification || !isEnabled()) return false;

  // If they are looking at the app, the in-app list already updated live.
  // An OS toast on top of that is just noise.
  const isHidden = hidden ?? (typeof document !== "undefined" && document.hidden);
  if (!isHidden) return false;

  return !SILENT_CATEGORIES.has(notification.category);
}

/**
 * Show the toast. Returns the Notification, or null if it could not be shown.
 *
 * `tag` should be the notification id: two open tabs both receive the same
 * SSE event, and a shared tag makes the OS collapse them into one toast
 * instead of showing duplicates.
 */
export function showDesktopNotification({ title, body, tag, onActivate }) {
  if (!isSupported() || Notification.permission !== "granted") return null;

  try {
    const toast = new Notification(title, { body, tag });
    toast.onclick = () => {
      try {
        window.focus();
      } catch {
        // Focus can be refused; opening the target still works.
      }
      onActivate?.();
      toast.close();
    };
    return toast;
  } catch {
    // Some browsers throw on construction (notably Android Chrome, which
    // requires a service worker). Failing to toast must never break the
    // in-app notification that triggered it.
    return null;
  }
}

export default showDesktopNotification;
