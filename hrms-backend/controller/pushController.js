/**
 * Web Push subscription CRUD, all per-device. A subscription is always
 * written against req.user.id, never a user id from the body.
 */

import PushSubscriptionModel from "../model/PushSubscription.js";
import { pushEnabled, vapidPublicKey } from "../utils/webPush.js";
import { AppError } from "../utils/appError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const pushController = {
  /** GET /notifications/push?endpoint=... — without an endpoint it only answers "is push configured". */
  status: asyncHandler(async (req, res) => {
    const { endpoint } = req.query;
    const subscribed = endpoint
      ? Boolean(await PushSubscriptionModel.exists({ endpoint, user: req.user.id }))
      : false;

    res.json({
      success: true,
      data: {
        available: pushEnabled(),
        // The only way the browser gets the public key — no build-time copy
        // that could drift from the pair the backend signs with.
        publicKey: vapidPublicKey(),
        subscribed,
      },
    });
  }, 500),

  /** POST /notifications/push/subscribe — body is a PushSubscription JSON. */
  subscribe: asyncHandler(async (req, res) => {
    if (!pushEnabled()) {
      return res.status(503).json({
        success: false,
        message: "Push notifications are not configured on this server.",
        code: "PUSH_NOT_CONFIGURED",
      });
    }

    const { endpoint, keys } = req.body ?? {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      throw new AppError(
        "A push subscription with endpoint and keys is required.",
        "PUSH_SUBSCRIPTION_INVALID",
      );
    }

    // Upsert on endpoint: re-subscribing returns the same endpoint, and on a
    // shared machine it must re-point at whoever is signed in now.
    const subscription = await PushSubscriptionModel.findOneAndUpdate(
      { endpoint },
      {
        $set: {
          user: req.user.id,
          keys: { p256dh: keys.p256dh, auth: keys.auth },
          userAgent: req.get("user-agent") ?? null,
          failureCount: 0,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    res.status(201).json({ success: true, data: { endpoint: subscription.endpoint } });
  }, 400),

  /** DELETE /notifications/push/subscribe — body/query carries the endpoint. */
  unsubscribe: asyncHandler(async (req, res) => {
    const endpoint = req.body?.endpoint ?? req.query.endpoint;
    if (!endpoint) {
      throw new AppError("An endpoint is required.", "PUSH_ENDPOINT_REQUIRED");
    }

    // Scoped to the caller: knowing an endpoint must not be enough to unsubscribe someone else.
    await PushSubscriptionModel.deleteOne({ endpoint, user: req.user.id });
    res.json({ success: true, message: "Push subscription removed." });
  }, 400),
};

export default pushController;
