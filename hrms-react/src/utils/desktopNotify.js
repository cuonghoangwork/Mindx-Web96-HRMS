/**
 * OS toasts for live notifications. Two switches, both required: `allowed`
 * (Notification.permission, owned by the browser, granted once per origin)
 * and `wanted` (a localStorage flag, so toasts can be turned off without
 * browser settings). Both are per-device on purpose — a server-side flag
 * would claim "on" for a phone that never granted permission.
 *
 * Never prompts on load: Chrome penalises unprompted asks and a reflexive
 * "Block" is unrecoverable in-page. The request happens from the Settings
 * toggle only.
 */

const WANTED_KEY = "hrms-desktop-notifications";

/**
 * Client category values that never raise a toast. The server-sent channels
 * decide their own list (hrms-backend/utils/notifyPolicy.js); the rule both
 * must agree on is that "system" never leaves the app.
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
    return false; // private windows and "block site data" throw on access
  }
}

export function setWanted(value) {
  try {
    if (value) localStorage.setItem(WANTED_KEY, "true");
    else localStorage.removeItem(WANTED_KEY);
  } catch {
    // not persistable here; the toggle still works for this session
  }
  return Boolean(value);
}

/** Both switches on. The single check every caller should use. */
export function isEnabled() {
  return isSupported() && Notification.permission === "granted" && isWanted();
}

/** MUST be called from a user gesture. Does not touch the `wanted` flag — that is the caller's separate decision. */
export async function ensurePermission() {
  if (!isSupported()) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/** `hidden` is injectable for tests. */
export function shouldNotify(notification, { hidden } = {}) {
  if (!notification || !isEnabled()) return false;

  // If they are looking at the app, the in-app list already updated.
  const isHidden = hidden ?? (typeof document !== "undefined" && document.hidden);
  if (!isHidden) return false;

  return !SILENT_CATEGORIES.has(notification.category);
}

/** `tag` should be the notification id, so two open tabs collapse into one toast. Returns null if it could not be shown. */
export function showDesktopNotification({ title, body, tag, onActivate }) {
  if (!isSupported() || Notification.permission !== "granted") return null;

  try {
    const toast = new Notification(title, { body, tag });
    toast.onclick = () => {
      try {
        window.focus();
      } catch {
        // focus can be refused; opening the target still works
      }
      onActivate?.();
      toast.close();
    };
    return toast;
  } catch {
    return null; // Android Chrome throws on construction (needs a service worker)
  }
}

export default showDesktopNotification;
