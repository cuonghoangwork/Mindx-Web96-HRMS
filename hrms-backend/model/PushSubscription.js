import mongoose from "mongoose";

/**
 * One row per BROWSER, not per user — a subscription is minted by one device
 * and meaningless elsewhere, which is why push is not a User.notify flag.
 * `endpoint` is globally unique and is the identity; re-subscribing the same
 * browser returns the same endpoint, so the write path upserts on it.
 */
const pushSubscriptionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    // Display only; never used for routing.
    userAgent: { type: String, default: null },
    lastSuccessAt: { type: Date, default: null },
    // Soft failures only; a 410/404 deletes the row instead.
    failureCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export default mongoose.model("PushSubscription", pushSubscriptionSchema, "pushSubscriptions");
