/**
 * webPush.js — VAPID-signed Web Push, wrapped so nothing else imports the
 * library or thinks about key configuration.
 *
 * Same graceful-degrade contract as the mailer and the Telegram client: with
 * the VAPID keys unset, every send logs once and no-ops.
 *
 * SECURITY: VAPID_PRIVATE_KEY must never be given a VITE_ prefix or reach the
 * frontend in any other way — it is the signing key that proves a push came
 * from this server. Only the PUBLIC key goes to the browser, which needs it
 * to mint a subscription. The two are easy to mix up because they are both
 * opaque base64 strings.
 */

import webpush from "web-push";

// Push payloads are encrypted per-recipient and most push services reject
// anything over ~4KB. Send identifiers and short display copy, never the
// whole notification document.
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
    // A mailto: the push service can contact if this app misbehaves. Required
    // by the VAPID spec; Firefox rejects subscriptions without it.
    process.env.VAPID_SUBJECT || "mailto:admin@example.com",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
  configured = true;
}

/**
 * Deliver one push. Never throws.
 *
 * @returns {{ ok: boolean, disabled?: boolean, gone?: boolean, status?: number, error?: string }}
 *   `gone` means the browser has permanently unsubscribed — the caller must
 *   delete the row rather than retry.
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
      // 410 Gone is the standard "user unsubscribed"; 404 is what some
      // services send for an endpoint they no longer know. Both are permanent.
      gone: status === 410 || status === 404,
      error: err.message,
    };
  }
}

/** Test seam — resets the cached VAPID configuration and the once-only log. */
export function resetWebPush() {
  configured = false;
  warnedDisabled = false;
}

export default sendPush;
