/**
 * Service worker registration and push subscription. Push is per-browser,
 * not per-user — the subscription is minted by this browser for this origin
 * — and needs a secure context (localhost is exempt).
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

/** applicationServerKey must be raw bytes; a base64url string fails with an unhelpful InvalidCharacterError. */
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
    // Scope "/": a worker only controls pages at or below its path.
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

/** Must be called from a user gesture. @returns {{ ok: true, subscription } | { ok: false, reason }} */
export async function subscribeToPush(publicKey) {
  if (!isPushSupported()) return { ok: false, reason: "unsupported" };
  if (!publicKey) return { ok: false, reason: "no-public-key" };

  const permission = await ensurePermission();
  // Push and desktop toasts share one OS permission.
  if (permission !== "granted") return { ok: false, reason: permission };

  const registration = (await registerServiceWorker()) ?? null;
  if (!registration) return { ok: false, reason: "no-service-worker" };

  try {
    // Subscribing before the worker is active throws.
    await navigator.serviceWorker.ready;

    const subscription = await registration.pushManager.subscribe({
      // Required by every browser; silent push does not exist on the web.
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    return { ok: true, subscription: subscription.toJSON() };
  } catch (err) {
    console.warn("[push] subscribe failed:", err.message);
    return { ok: false, reason: "subscribe-failed", error: err.message };
  }
}

/** Returns the removed endpoint so the caller can delete the server row. */
export async function unsubscribeFromPush() {
  const subscription = await currentSubscription();
  if (!subscription) return { ok: true, endpoint: null };

  const { endpoint } = subscription;
  try {
    await subscription.unsubscribe();
  } catch {
    // Even if the browser refuses, the server row must go.
  }
  return { ok: true, endpoint };
}
