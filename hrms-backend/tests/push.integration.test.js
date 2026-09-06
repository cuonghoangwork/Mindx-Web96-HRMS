/**
 * push.integration.test.js — Web Push subscriptions and delivery.
 *
 * `web-push` is mocked, so nothing reaches a real push service. What is
 * proven is the part that is ours: subscriptions are per-BROWSER, a dead
 * endpoint is deleted rather than retried forever, and the policy table
 * still decides what may leave the app.
 *
 * The parts that genuinely cannot be tested here — the browser minting a
 * subscription, and the service worker receiving one — need a real VAPID
 * pair and a reachable push service.
 */

process.env.VAPID_PUBLIC_KEY = "test-public-key";
process.env.VAPID_PRIVATE_KEY = "test-private-key";
process.env.VAPID_SUBJECT = "mailto:test@hrms.test";

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import supertest from "supertest";
import { startDb, stopDb, clearDb, createApp } from "./testHelpers.js";
import { auth, seedPerformanceOrg } from "./performanceFixtures.js";

const sendNotificationMock = vi.fn(async () => ({ statusCode: 201 }));
vi.mock("web-push", () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: sendNotificationMock },
}));

let dbAvailable = false;
let app;
let request;
let org;

const subscriptionBody = (suffix = "a") => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/endpoint-${suffix}`,
  keys: { p256dh: `p256dh-${suffix}`, auth: `auth-${suffix}` },
});

/** Reject the way web-push does: an Error carrying statusCode. */
function pushError(statusCode) {
  const err = new Error(`push failed ${statusCode}`);
  err.statusCode = statusCode;
  return err;
}

beforeAll(async () => {
  try {
    await startDb();
    dbAvailable = true;
  } catch (err) {
    console.warn(`[push.integration] MongoDB unavailable — skipping.\n${err.message}`);
    return;
  }
  app = await createApp();
  request = supertest(app);
  const { default: PushSubscriptionModel } = await import("../model/PushSubscription.js");
  // The unique index on endpoint is what makes the upsert path meaningful.
  await PushSubscriptionModel.init();
});

afterAll(async () => {
  await stopDb();
});

beforeEach(async () => {
  if (!dbAvailable) return;
  await clearDb();
  sendNotificationMock.mockClear();
  sendNotificationMock.mockImplementation(async () => ({ statusCode: 201 }));
  const { resetWebPush } = await import("../utils/webPush.js");
  resetWebPush();
  org = await seedPerformanceOrg(app);
});

describe("subscription CRUD", () => {
  it("requires authentication", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    expect((await request.post("/api/v1/notifications/push/subscribe").send(subscriptionBody())).status).toBe(401);
  });

  it("stores a subscription against the caller, never a body-supplied user", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { default: PushSubscriptionModel } = await import("../model/PushSubscription.js");

    const res = await request
      .post("/api/v1/notifications/push/subscribe")
      .set(auth(org.tokens.dev))
      .send({ ...subscriptionBody(), user: String(org.users.admin.userId) });

    expect(res.status).toBe(201);
    const row = await PushSubscriptionModel.findOne({});
    // Trusting a user id from the body would let anyone subscribe a device
    // to someone else's notifications.
    expect(String(row.user)).toBe(String(org.users.dev.userId));
  });

  it("rejects a subscription missing its keys", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const res = await request
      .post("/api/v1/notifications/push/subscribe")
      .set(auth(org.tokens.dev))
      .send({ endpoint: "https://example.test/x" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("PUSH_SUBSCRIPTION_INVALID");
  });

  it("upserts on endpoint rather than colliding on the unique index", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { default: PushSubscriptionModel } = await import("../model/PushSubscription.js");

    // Re-subscribing the same browser returns the same endpoint. An insert
    // would throw a duplicate-key error every time.
    await request.post("/api/v1/notifications/push/subscribe").set(auth(org.tokens.dev)).send(subscriptionBody());
    const second = await request
      .post("/api/v1/notifications/push/subscribe")
      .set(auth(org.tokens.dev))
      .send(subscriptionBody());

    expect(second.status).toBe(201);
    expect(await PushSubscriptionModel.countDocuments({})).toBe(1);
  });

  it("re-points an endpoint at whoever is signed in now", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { default: PushSubscriptionModel } = await import("../model/PushSubscription.js");

    await request.post("/api/v1/notifications/push/subscribe").set(auth(org.tokens.dev)).send(subscriptionBody());
    await request.post("/api/v1/notifications/push/subscribe").set(auth(org.tokens.designer)).send(subscriptionBody());

    // Shared machine: the previous user must stop receiving pushes on a
    // browser someone else is now signed into.
    const rows = await PushSubscriptionModel.find({});
    expect(rows).toHaveLength(1);
    expect(String(rows[0].user)).toBe(String(org.users.designer.userId));
  });

  it("keeps one row per device for the same user", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { default: PushSubscriptionModel } = await import("../model/PushSubscription.js");

    await request.post("/api/v1/notifications/push/subscribe").set(auth(org.tokens.dev)).send(subscriptionBody("laptop"));
    await request.post("/api/v1/notifications/push/subscribe").set(auth(org.tokens.dev)).send(subscriptionBody("phone"));

    expect(await PushSubscriptionModel.countDocuments({ user: org.users.dev.userId })).toBe(2);
  });

  it("unsubscribes only the caller's own endpoint", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { default: PushSubscriptionModel } = await import("../model/PushSubscription.js");
    await request.post("/api/v1/notifications/push/subscribe").set(auth(org.tokens.dev)).send(subscriptionBody());

    // Knowing someone else's endpoint must not be enough to unsubscribe them.
    await request
      .delete("/api/v1/notifications/push/subscribe")
      .set(auth(org.tokens.designer))
      .send({ endpoint: subscriptionBody().endpoint });
    expect(await PushSubscriptionModel.countDocuments({})).toBe(1);

    await request
      .delete("/api/v1/notifications/push/subscribe")
      .set(auth(org.tokens.dev))
      .send({ endpoint: subscriptionBody().endpoint });
    expect(await PushSubscriptionModel.countDocuments({})).toBe(0);
  });

  it("reports availability and the public key without an endpoint", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const res = await request.get("/api/v1/notifications/push").set(auth(org.tokens.dev));
    expect(res.body.data.available).toBe(true);
    // Serving it means a frontend built against the wrong pair is detectable
    // without a redeploy.
    expect(res.body.data.publicKey).toBe("test-public-key");
    expect(res.body.data.subscribed).toBe(false);
  });

  it("refuses to subscribe when the server has no VAPID keys", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const key = process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PUBLIC_KEY;
    try {
      const res = await request
        .post("/api/v1/notifications/push/subscribe")
        .set(auth(org.tokens.dev))
        .send(subscriptionBody());
      expect(res.status).toBe(503);
      expect(res.body.code).toBe("PUSH_NOT_CONFIGURED");
    } finally {
      process.env.VAPID_PUBLIC_KEY = key;
    }
  });
});

describe("delivery", () => {
  async function subscribe(token, suffix = "a") {
    await request.post("/api/v1/notifications/push/subscribe").set(auth(token)).send(subscriptionBody(suffix));
  }

  const leaveApproved = () => ({
    user: org.users.dev.userId,
    category: "leave",
    title: "Leave request approved",
    message: "Approved.",
    titleKey: "leaveApproved",
    messageKey: "leaveApproved",
    params: { leaveType: "annual", startDate: "2027-03-01", endDate: "2027-03-02" },
    link: "/dashboard",
  });

  it("pushes an addressed notification to every device that user has", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { emitNotification } = await import("../utils/notify.js");
    await subscribe(org.tokens.dev, "laptop");
    await subscribe(org.tokens.dev, "phone");

    await emitNotification(leaveApproved());

    await vi.waitFor(() => expect(sendNotificationMock).toHaveBeenCalledTimes(2));
  });

  it("sends a small payload, not the whole document", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { emitNotification } = await import("../utils/notify.js");
    const { default: UserModel } = await import("../model/User.js");
    await UserModel.updateOne({ _id: org.users.dev.userId }, { $set: { language: "vi" } });
    await subscribe(org.tokens.dev);

    await emitNotification(leaveApproved());

    await vi.waitFor(() => expect(sendNotificationMock).toHaveBeenCalledTimes(1));
    const [, body] = sendNotificationMock.mock.calls[0];
    const payload = JSON.parse(body);
    // Push payloads are encrypted per-recipient and services reject anything
    // much over 4KB, so this carries identifiers and display copy only.
    expect(Object.keys(payload).sort()).toEqual(["body", "id", "tag", "title", "url"]);
    expect(payload.title).toBe("Yêu cầu nghỉ phép đã được duyệt");
    expect(payload.tag).toBe(payload.id);
    expect(Buffer.byteLength(body, "utf8")).toBeLessThan(3500);
  });

  it("serves broadcasts, which Telegram deliberately does not", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { emitNotification } = await import("../utils/notify.js");
    await subscribe(org.tokens.dev, "dev");
    await subscribe(org.tokens.manager, "mgr");
    await subscribe(org.tokens.admin, "admin");

    // "Payroll paid" is only ever written as a broadcast, so push has to
    // serve them to be useful for payroll at all.
    await emitNotification({
      audience: "employees",
      category: "payroll",
      title: "Payroll paid",
      titleKey: "payrollPaid",
      messageKey: "payrollPaid",
      params: { periodLabel: "March 2027" },
    });

    // MANAGER + EMPLOYEE only — the admin subscription must not receive it.
    await vi.waitFor(() => expect(sendNotificationMock).toHaveBeenCalledTimes(2));
  });

  it("stays silent for a category the policy keeps in-app", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { emitNotification } = await import("../utils/notify.js");
    await subscribe(org.tokens.dev);

    await emitNotification({ ...leaveApproved(), category: "employee" });

    await new Promise((r) => setTimeout(r, 150));
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("deletes a subscription the push service reports as gone", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { emitNotification } = await import("../utils/notify.js");
    const { default: PushSubscriptionModel } = await import("../model/PushSubscription.js");
    await subscribe(org.tokens.dev);
    sendNotificationMock.mockRejectedValue(pushError(410));

    await emitNotification(leaveApproved());

    // 410 Gone is the standard "the user unsubscribed". Without this cleanup
    // the row is pushed to forever and failureCount climbs without end.
    await vi.waitFor(async () => {
      expect(await PushSubscriptionModel.countDocuments({})).toBe(0);
    });
  });

  it("keeps a subscription that merely failed, and counts the failure", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { emitNotification } = await import("../utils/notify.js");
    const { default: PushSubscriptionModel } = await import("../model/PushSubscription.js");
    await subscribe(org.tokens.dev);
    sendNotificationMock.mockRejectedValue(pushError(500));

    await emitNotification(leaveApproved());

    // A push service having a bad day is not the user unsubscribing.
    await vi.waitFor(async () => {
      const row = await PushSubscriptionModel.findOne({});
      expect(row).not.toBeNull();
      expect(row.failureCount).toBe(1);
    });
  });

  it("records success so a stale subscription can be spotted later", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { emitNotification } = await import("../utils/notify.js");
    const { default: PushSubscriptionModel } = await import("../model/PushSubscription.js");
    await subscribe(org.tokens.dev);

    await emitNotification(leaveApproved());

    await vi.waitFor(async () => {
      const row = await PushSubscriptionModel.findOne({});
      expect(row.lastSuccessAt).toBeTruthy();
      expect(row.failureCount).toBe(0);
    });
  });

  it("still writes the notification when the push service is unreachable", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { emitNotification } = await import("../utils/notify.js");
    const { default: NotificationModel } = await import("../model/Notification.js");
    await subscribe(org.tokens.dev);
    sendNotificationMock.mockRejectedValue(new Error("ENOTFOUND"));

    await expect(emitNotification(leaveApproved())).resolves.toBeTruthy();
    expect(await NotificationModel.countDocuments({})).toBe(1);
  });
});
