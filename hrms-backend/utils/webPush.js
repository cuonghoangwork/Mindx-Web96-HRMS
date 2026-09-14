/**
 * VAPID-signed Web Push. With the keys unset every send logs once and no-ops.
 *
 * SECURITY: VAPID_PRIVATE_KEY must never get a VITE_ prefix or otherwise
 * reach the frontend — it is the signing key. Only the PUBLIC key goes to
 * the browser. Both are opaque base64 strings and easy to mix up.
 */

import webpush from "web-push";

// Most push services reject payloads over ~4KB.
export const MAX_PAYLOAD_BYTES = 3500;

let configured = false;
let warnedDisabled = false;

export function pushEnabled() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function vapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || null;
}

function configure() {
  if (configured) return;
  webpush.setVapidDetails(
    // Required by the VAPID spec; Firefox rejects subscriptions without it.
    process.env.VAPID_SUBJECT || "mailto:admin@example.com",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
  configured = true;
}

/**
 * Never throws. `gone` means the browser permanently unsubscribed — delete the row, do not retry.
 * @returns {{ ok: boolean, disabled?: boolean, gone?: boolean, status?: number, error?: string }}
 */
export async function sendPush(subscription, payload) {
  if (!pushEnabled()) {
    if (!warnedDisabled) {
      console.log("[webpush] VAPID keys not set — push delivery disabled");
      warnedDisabled = true;
    }
    return { ok: false, disabled: true };
  }

  const body = JSON.stringify(payload);
  if (Buffer.byteLength(body, "utf8") > MAX_PAYLOAD_BYTES) {
    // Better a clear log than a 413 from a push service we cannot see.
    console.error("[webpush] payload too large, dropping:", Buffer.byteLength(body, "utf8"));
    return { ok: false, error: "payload too large" };
  }

  try {
    configure();
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: subscription.keys },
      body,
    );
    return { ok: true };
  } catch (err) {
    const status = err.statusCode;
    return {
      ok: false,
      status,
      // 410 is the standard "unsubscribed"; some services send 404. Both are permanent.
      gone: status === 410 || status === 404,
      error: err.message,
    };
  }
}

/** Test seam. */
export function resetWebPush() {
  configured = false;
  warnedDisabled = false;
}

export default sendPush;
