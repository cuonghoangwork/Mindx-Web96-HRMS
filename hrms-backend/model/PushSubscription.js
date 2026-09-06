import mongoose from "mongoose";

/**
 * PushSubscription — one row per BROWSER, not per user.
 *
 * This is the reason push cannot live in User.notify like the email and
 * Telegram flags do: a subscription is minted by one browser on one device
 * and is meaningless anywhere else. Someone with a laptop and a phone has two
 * rows; revoking one must not touch the other. Same reasoning as the
 * localStorage-backed desktop preference in
 * hrms-react/src/utils/desktopNotify.js.
 *
 * `endpoint` is the push service's URL for this device and is globally
 * unique, so it — not (user, device) — is the identity. Re-subscribing the
 * same browser returns the same endpoint, which is why the write path upserts
 * on it rather than inserting.
 */
const pushSubscriptionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    // Purely so a Settings list could say "Chrome on Windows" one day. Never
    // used for routing — the endpoint is the identity.
    userAgent: { type: String, default: null },
    lastSuccessAt: { type: Date, default: null },
    // Climbs on soft failures. A 410/404 does not increment it; that deletes
    // the row outright, because the browser has told us the subscription is
    // dead rather than merely unreachable.
    failureCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export default mongoose.model("PushSubscription", pushSubscriptionSchema, "pushSubscriptions");
