/**
 * notify.js — the ONLY way a notification enters the system.
 *
 * Level 0 of HRMS_REALTIME_NOTIFICATIONS_PLAN.md: nothing user-visible
 * changes here. Every producer that used to call NotificationModel.create()
 * directly now goes through emitNotification(), so that when SSE / desktop /
 * push / email / Telegram arrive there is exactly one place to hook them,
 * instead of the same five lines pasted into a dozen controllers and jobs.
 *
 * Three contracts worth knowing before you change anything here:
 *
 * 1. **emitNotification propagates write errors.** It deliberately does NOT
 *    swallow them. Every call site already sits inside a try/catch that
 *    decides what a failure means there, and quietly turning those into
 *    successes would change behaviour at a dozen places at once. notifyHR()
 *    keeps its own swallow — see below.
 *
 * 2. **fanOut never throws and is never awaited.** A dead SSE socket or a
 *    bounced email must not fail the leave request that triggered it. Same
 *    contract as utils/auditLog.js.
 *
 * 3. **Recipient resolution stays at the call site.** This is the one place
 *    the plan and this file disagree, on purpose. The three per-user
 *    fan-outs use three genuinely different rules — leave and profile-edit
 *    notify MANAGER + HR + ADMIN, a promotion proposal notifies ADMIN only,
 *    performance reminders notify a department's managers. Those differences
 *    are real (only ADMIN can review a promotion) and a couple of them are
 *    arguably wrong, but each needs deciding on its own. Centralising them
 *    now would flatten all three into whichever rule got written first,
 *    which is exactly what tests/notificationProducers.characterization.test.js
 *    exists to prevent. emitNotificationEach() gives them a shared writer
 *    without taking away their own answer to "who".
 */

import NotificationModel, { rolesForAudience } from "../model/Notification.js";
import UserModel from "../model/User.js";
import { publish } from "./sseHub.js";
import { allowsChannel } from "./notifyPolicy.js";
import { emailFooter, languageFor, openInAppLabel, renderNotification } from "./notifyI18n.js";
import { sendTelegramMessage, telegramEnabled } from "./telegram.js";
import { mailEnabled, sendMail } from "./mailer.js";
import { renderEmail } from "./emailTemplate.js";

/**
 * Telegram delivery.
 *
 * ADDRESSED NOTIFICATIONS ONLY, which is narrower than the plan's table and
 * deliberate. A broadcast is by definition not about you: "review cycle open"
 * is category `performance`, which the policy permits, but buzzing every
 * linked phone in the company for it is precisely the behaviour that gets a
 * notification system muted. Everything the plan actually wants on a phone —
 * a decision on your leave, a new request you have to review — is written as
 * an addressed document already (see emitNotificationEach), so this rule
 * costs nothing and removes the whole class of company-wide buzz.
 */
async function fanOutTelegram(doc) {
  if (!doc.user || !telegramEnabled()) return;
  if (!allowsChannel(doc.category, "telegram")) return;

  const user = await UserModel.findById(doc.user, "language notify");
  // A user's own toggle can only narrow the policy above, never widen it.
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

  // 403 means they blocked the bot or deleted the chat. That is permanent
  // until they start it again, so unlink rather than retry forever — the
  // same self-healing idea as the 410 cleanup Web Push will need.
  if (result.blocked) {
    await UserModel.updateOne(
      { _id: user._id },
      { $set: { "notify.telegram": false, "notify.telegramChatId": null } },
    );
    console.log(`[telegram] chat blocked — unlinked user ${user._id}`);
  }
}

/**
 * How many emails are in flight at once.
 *
 * A broadcast to a 50-person roster must not open 50 SMTP connections: every
 * free provider (Gmail, Brevo, Resend) rate-limits, and the failure mode is
 * a burst of rejections rather than a slow send. Three at a time turns that
 * into a queue.
 */
const EMAIL_CONCURRENCY = 3;

function absoluteUrl(link) {
  const base = process.env.APP_BASE_URL || process.env.CORS_ORIGIN || "";
  return link && base ? `${base.replace(/\/$/, "")}${link}` : null;
}

/**
 * Who gets this by email.
 *
 * Unlike Telegram, email DOES serve broadcasts — "payroll has been paid" to
 * the whole roster is the best email case in the system, and an inbox is the
 * right place for it in a way a private messenger is not. That is why the
 * `notify.email` default is false: opt-in, so a broadcast can only ever reach
 * people who asked for one.
 */
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

  // A shared cursor over one array is the whole concurrency limiter: N
  // workers pull until it is empty. No setImmediate — fanOut is already
  // detached from the request (see emitNotification), so deferring again
  // would only make the send harder to observe in tests.
  const queue = [...recipients];
  const workers = Array.from({ length: Math.min(EMAIL_CONCURRENCY, queue.length) }, async () => {
    while (queue.length) {
      const user = queue.shift();
      // sendMail never throws, so one bad address cannot strand the queue.
      await sendOneEmail(doc, user);
    }
  });

  await Promise.all(workers);
}

/**
 * Side-channel delivery.
 *
 * Never awaited by emitNotification and never allowed to throw: a dead socket,
 * a blocked bot or a bounced email must not fail the leave request that
 * produced the notification.
 *
 * The channels run in parallel — a slow SMTP server should not delay the SSE
 * push that the user is watching for — and settle independently, so one
 * throwing cannot cancel the others.
 *
 * `channels` is the per-call override Web Push will consult. Nothing reads it
 * yet; the parameter keeps the call signature stable until it lands.
 */
// eslint-disable-next-line no-unused-vars
async function fanOut(doc, channels) {
  publish(doc);
  const results = await Promise.allSettled([fanOutTelegram(doc), fanOutEmail(doc)]);
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("[notify] channel failed:", result.reason?.message ?? result.reason);
    }
  }
}

/** Optional fields are stored as explicit nulls, never undefined, so that a
 *  "has titleKey?" test is a plain falsy check on old and new rows alike. */
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
 * Write one notification and hand it to the side channels.
 *
 * `user: null` (the default) makes it a broadcast narrowed by `audience`;
 * a user id makes it an addressed notice, and `audience` is then ignored on
 * read (see broadcastAudiencesFor in model/Notification.js).
 *
 * Throws if the write fails — see contract 1 in the file header.
 */
export async function emitNotification(payload = {}) {
  const doc = await NotificationModel.create(toDocument(payload));

  fanOut(doc, payload.channels).catch((err) =>
    console.error("[notify] fan-out failed:", err.message),
  );

  return doc;
}

/**
 * One addressed notification per user id — the shape every per-user fan-out
 * producer needs. The caller decides who is in `userIds`; this only decides
 * how each row is written.
 *
 * Resolves once every write has settled, matching the Promise.all(map(...))
 * the call sites used before.
 */
export async function emitNotificationEach(userIds, payload = {}) {
  return Promise.all(
    (userIds ?? []).map((user) => emitNotification({ ...payload, user })),
  );
}

/**
 * notifyHR — alert the unscoped company-wide tier (HR + ADMIN) of a system
 * event. The single most-used producer: ~18 of the ~30 call sites.
 *
 * Never throws. Most callers do not await it — several are cron jobs, where a
 * rejected promise would take down the whole run — so a failure here is
 * logged and dropped, exactly as it was before the spine existed.
 *
 * Lives here rather than in controller/notificationController.js so that the
 * six scheduled jobs that use it no longer have to import a controller, and
 * so a future transport can import it without closing a cycle.
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
