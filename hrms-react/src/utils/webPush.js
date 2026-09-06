/**
 * webPush.js — service worker registration and push subscription (Level 3).
 *
 * Push is the only channel that works with the app closed, and the only one
 * that is per-BROWSER rather than per-user: the subscription is minted by
 * this browser, for this origin, and is meaningless anywhere else. That is
 * why the server stores subscriptions in their own collection instead of a
 * flag on User (hrms-backend/model/PushSubscription.js).
 *
 * Requires a secure context. localhost is exempt, so dev works; anything else
 * must be HTTPS, which Render provides.
 */

import { ensurePermission } from "./desktopNotify";

const SW_URL = "/sw.js";

export function isPushSupported() {
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof window !== "undefined" &&
    "PushManager" in window
  );
}

/**
 * The applicationServerKey has to be raw bytes, but VAPID keys travel as
 * base64url text. Browsers reject a plain string with an unhelpful
 * "InvalidCharacterError", which is the single most common way this feature
 * fails to start.
 */
export function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

/** Registers (or returns the existing) service worker. Null if unsupported. */
export async function registerServiceWorker() {
  if (!isPushSupported()) return null;
  try {
    // Scope "/" explicitly: a worker can only control pages at or below its
    // own path, and getting this wrong means pushes silently never arrive.
    return await navigator.serviceWorker.register(SW_URL, { scope: "/" });
  } catch (err) {
    console.warn("[push] service worker registration failed:", err.message);
    return null;
  }
}

/** The subscription this browser already holds, or null. */
export async function currentSubscription() {
  if (!isPushSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.getRegistration(SW_URL);
    if (!registration) return null;
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/**
 * Subscribe this browser. Must be called from a user gesture — it can raise
 * the OS permission prompt.
 *
 * @returns {{ ok: true, subscription: object } | { ok: false, reason: string }}
 */
export async function subscribeToPush(publicKey) {
  if (!isPushSupported()) return { ok: false, reason: "unsupported" };
  if (!publicKey) return { ok: false, reason: "no-public-key" };

  const permission = await ensurePermission();
  // Push and desktop toasts share one OS permission, so this is the same
  // prompt the desktop toggle uses — asking twice would be a bug, not a
  // second chance.
  if (permission !== "granted") return { ok: false, reason: permission };

  const registration = (await registerServiceWorker()) ?? null;
  if (!registration) return { ok: false, reason: "no-service-worker" };

  try {
    // The worker may still be installing on a first visit; subscribing before
    // it is active throws.
    await navigator.serviceWorker.ready;

    const subscription = await registration.pushManager.subscribe({
      // Required to be true by every browser: a push MUST result in something
      // the user can see. Silent push is not available on the web.
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    return { ok: true, subscription: subscription.toJSON() };
  } catch (err) {
    console.warn("[push] subscribe failed:", err.message);
    return { ok: false, reason: "subscribe-failed", error: err.message };
  }
}

/**
 * Unsubscribe this browser. Returns the endpoint that was removed so the
 * caller can tell the server which row to delete.
 */
export async function unsubscribeFromPush() {
  const subscription = await currentSubscription();
  if (!subscription) return { ok: true, endpoint: null };

  const { endpoint } = subscription;
  try {
    await subscription.unsubscribe();
  } catch {
    // Even if the browser refuses, the server row should still go — otherwise
    // it keeps pushing to an endpoint the user has disowned.
  }
  return { ok: true, endpoint };
}
