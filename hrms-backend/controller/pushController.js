/**
 * pushController.js — Web Push subscription CRUD.
 *
 * Three endpoints, all per-device:
 *   GET    /notifications/push          is push available, is THIS browser subscribed
 *   POST   /notifications/push/subscribe
 *   DELETE /notifications/push/subscribe
 *
 * The browser owns the subscription object; the server only stores it and
 * signs pushes with the matching VAPID key. Nothing here trusts the caller
 * beyond their own JWT: a subscription is always written against req.user.id,
 * never a user id from the body.
 */

import PushSubscriptionModel from "../model/PushSubscription.js";
import { pushEnabled, vapidPublicKey } from "../utils/webPush.js";
import { AppError } from "../utils/appError.js";

const pushController = {
  /**
   * GET /notifications/push?endpoint=...
   *
   * The endpoint identifies the browser asking. Without it this can only
   * answer "is push configured at all", which is what Settings needs before
   * the service worker has registered.
   */
  status: async (req, res) => {
    try {
      const { endpoint } = req.query;
      const subscribed = endpoint
        ? Boolean(await PushSubscriptionModel.exists({ endpoint, user: req.user.id }))
        : false;

      res.json({
        success: true,
        data: {
          available: pushEnabled(),
          // The frontend also reads this from VITE_VAPID_PUBLIC_KEY at build
          // time; serving it here means a deployment cannot end up with a
          // frontend keyed to a different pair than the backend signs with.
          publicKey: vapidPublicKey(),
          subscribed,
        },
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message, code: error.code });
    }
  },

  /** POST /notifications/push/subscribe — body is a PushSubscription JSON. */
  subscribe: async (req, res) => {
    try {
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

      // Upsert on endpoint, not insert. A browser re-subscribing returns the
      // same endpoint, and re-registering after clearing site data is routine
      // — an insert would collide on the unique index every time.
      //
      // Upserting also re-points an endpoint at whoever is signed in now,
      // which is what a shared machine needs: the previous user's account
      // must stop receiving pushes on a browser someone else is using.
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
    } catch (error) {
      res.status(error.status || 400).json({ success: false, message: error.message, code: error.code });
    }
  },

  /** DELETE /notifications/push/subscribe — body/query carries the endpoint. */
  unsubscribe: async (req, res) => {
    try {
      const endpoint = req.body?.endpoint ?? req.query.endpoint;
      if (!endpoint) {
        throw new AppError("An endpoint is required.", "PUSH_ENDPOINT_REQUIRED");
      }

      // Scoped to the caller: knowing someone else's endpoint must not be
      // enough to unsubscribe them.
      await PushSubscriptionModel.deleteOne({ endpoint, user: req.user.id });
      res.json({ success: true, message: "Push subscription removed." });
    } catch (error) {
      res.status(error.status || 400).json({ success: false, message: error.message, code: error.code });
    }
  },
};

export default pushController;
