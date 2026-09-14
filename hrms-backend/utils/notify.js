/**
 * The only way a notification enters the system (DECISIONS.md D8).
 *
 *   1. emitNotification propagates write errors — every call site already
 *      decides what a failure means there. notifyHR() is the one swallow.
 *   2. fanOut never throws and is never awaited: a dead socket or bounced
 *      email must not fail the leave request that triggered it.
 *   3. Recipient resolution stays at the call site — the per-type audiences
 *      genuinely differ, and tests/notificationProducers.characterization.test.js
 *      pins each one.
 */

import NotificationModel, { rolesForAudience } from "../model/Notification.js";
import UserModel from "../model/User.js";
import { publish } from "./sseHub.js";
import { allowsChannel } from "./notifyPolicy.js";
import { emailFooter, languageFor, openInAppLabel, renderNotification } from "./notifyI18n.js";
import { sendTelegramMessage, telegramEnabled } from "./telegram.js";
import { mailEnabled, sendMail } from "./mailer.js";
import { renderEmail } from "./emailTemplate.js";
import PushSubscriptionModel from "../model/PushSubscription.js";
import { pushEnabled, sendPush } from "./webPush.js";

/**
 * Telegram: addressed notifications only. A broadcast is by definition not
 * about you, and buzzing every linked phone for "review cycle open" is what
 * gets a notification system muted.
 */
async function fanOutTelegram(doc) {
  if (!doc.user || !telegramEnabled()) return;
  if (!allowsChannel(doc.category, "telegram")) return;

  const user = await UserModel.findById(doc.user, "language notify");
  if (!user?.notify?.telegram || !user.notify.telegramChatId) return;

  const language = languageFor(user);
  const { title, message } = renderNotification(doc, language);

  const result = await sendTelegramMessage({
    chatId: user.notify.telegramChatId,
    title,
    body: message,
    link: doc.link,
    linkLabel: openInAppLabel(language),
  });

  // 403 = they blocked the bot; unlink rather than retry forever.
  if (result.blocked) {
    await UserModel.updateOne(
      { _id: user._id },
      { $set: { "notify.telegram": false, "notify.telegramChatId": null } },
    );
    console.log(`[telegram] chat blocked — unlinked user ${user._id}`);
  }
}

/** Sends in flight per channel — free SMTP providers reject a 50-connection burst. */
const SEND_CONCURRENCY = 3;

/** Runs `worker` over `items`, SEND_CONCURRENCY at a time. `worker` must not throw or the queue strands. */
async function runLimited(items, worker) {
  const queue = [...items];
  const runners = Array.from({ length: Math.min(SEND_CONCURRENCY, queue.length) }, async () => {
    while (queue.length) {
      await worker(queue.shift());
    }
  });
  await Promise.all(runners);
}

function absoluteUrl(link) {
  const base = process.env.APP_BASE_URL || process.env.CORS_ORIGIN || "";
  return link && base ? `${base.replace(/\/$/, "")}${link}` : null;
}

/** Email serves broadcasts too ("payroll has been paid" belongs in an inbox), which is why `notify.email` is opt-in. */
async function emailRecipients(doc) {
  const scope = doc.user
    ? { _id: doc.user }
    : { role: { $in: rolesForAudience(doc.audience ?? "all") } };

  return UserModel.find(
    { ...scope, "notify.email": true, email: { $ne: null } },
    "email language",
  );
}

async function sendOneEmail(doc, user) {
  const language = languageFor(user);
  const { title, message } = renderNotification(doc, language);
  const { html, text } = renderEmail({
    title,
    message,
    url: absoluteUrl(doc.link),
    urlLabel: openInAppLabel(language),
    footer: emailFooter(language),
  });

  await sendMail({ to: user.email, subject: title, html, text });
}

async function fanOutEmail(doc) {
  if (!mailEnabled()) return;
  if (!allowsChannel(doc.category, "email")) return;

  const recipients = await emailRecipients(doc);
  if (!recipients.length) return;

  await runLimited(recipients, (user) => sendOneEmail(doc, user));
}

/**
 * Web Push serves broadcasts as well as addressed notices: a subscription is
 * per-device, behind an OS permission prompt, revocable in one tap — and its
 * existence is the opt-in (there is no `notify.push` flag on User).
 */
async function fanOutPush(doc) {
  if (!pushEnabled()) return;
  if (!allowsChannel(doc.category, "push")) return;

  const scope = doc.user
    ? { _id: doc.user }
    : { role: { $in: rolesForAudience(doc.audience ?? "all") } };

  const users = await UserModel.find(scope, "language");
  if (!users.length) return;

  const subscriptions = await PushSubscriptionModel.find({
    user: { $in: users.map((u) => u._id) },
  });
  if (!subscriptions.length) return;

  const languageByUser = new Map(users.map((u) => [String(u._id), languageFor(u)]));

  await runLimited(subscriptions, async (subscription) => {
    const language = languageByUser.get(String(subscription.user)) ?? "en";
    const { title, message } = renderNotification(doc, language);

    // Payloads must stay under ~4KB; the service worker has the id if it needs more.
    const result = await sendPush(subscription, {
      id: String(doc._id ?? doc.id ?? ""),
      title,
      body: message,
      url: doc.link ?? null,
      tag: String(doc._id ?? doc.id ?? ""), // same collapse key as the desktop toast
    });

    if (result.gone) {
      // 410/404 = the browser permanently unsubscribed.
      await PushSubscriptionModel.deleteOne({ _id: subscription._id });
      console.log(`[webpush] subscription gone — removed ${subscription.endpoint.slice(0, 40)}…`);
    } else if (result.ok) {
      await PushSubscriptionModel.updateOne(
        { _id: subscription._id },
        { $set: { lastSuccessAt: new Date(), failureCount: 0 } },
      );
    } else if (!result.disabled) {
      await PushSubscriptionModel.updateOne({ _id: subscription._id }, { $inc: { failureCount: 1 } });
    }
  });
}

/** Side channels run in parallel and settle independently. `channels` is a reserved per-call override; nothing reads it yet. */
// eslint-disable-next-line no-unused-vars
async function fanOut(doc, channels) {
  publish(doc);
  const results = await Promise.allSettled([fanOutTelegram(doc), fanOutEmail(doc), fanOutPush(doc)]);
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("[notify] channel failed:", result.reason?.message ?? result.reason);
    }
  }
}

/** Optional fields are stored as explicit nulls so old and new rows test alike. */
function toDocument({
  user = null,
  audience = "all",
  category,
  title,
  message,
  titleKey,
  messageKey,
  params,
  link,
  linkLabel,
  isCustom = false,
  sender,
  read = false,
}) {
  return {
    user: user ?? null,
    audience,
    category,
    title,
    message,
    titleKey: titleKey ?? null,
    messageKey: messageKey ?? null,
    params: params ?? null,
    link: link ?? null,
    linkLabel: linkLabel ?? null,
    isCustom,
    read,
    ...(sender ? { sender } : {}),
  };
}

/**
 * Writes one notification and hands it to the side channels. `user: null`
 * is a broadcast narrowed by `audience`; a user id is an addressed notice.
 */
export async function emitNotification(payload = {}) {
  const doc = await NotificationModel.create(toDocument(payload));

  fanOut(doc, payload.channels).catch((err) =>
    console.error("[notify] fan-out failed:", err.message),
  );

  return doc;
}

/** One addressed notification per user id. The caller decides who; this decides how each row is written. */
export async function emitNotificationEach(userIds, payload = {}) {
  return Promise.all(
    (userIds ?? []).map((user) => emitNotification({ ...payload, user })),
  );
}

/**
 * Broadcast to the HR + ADMIN tier. Never throws: most callers are cron jobs
 * that do not await it, and a rejection would take down the whole run.
 */
export async function notifyHR({
  title,
  message,
  category = "employee",
  link,
  linkLabel,
  titleKey,
  messageKey,
  params,
}) {
  try {
    await emitNotification({
      user: null,
      audience: "hr",
      category,
      title,
      message,
      link,
      linkLabel,
      titleKey,
      messageKey,
      params,
      isCustom: false,
    });
  } catch (err) {
    console.error("[notifyHR] Failed to create notification:", err.message);
  }
}

export default emitNotification;
