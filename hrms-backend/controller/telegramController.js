/**
 * telegramController.js — account linking and the inbound bot webhook.
 *
 * The linking handshake, which is the only genuinely fiddly part:
 *
 *   1. Settings calls POST /notifications/telegram/link-code.
 *   2. We mint a 6-character code tied to that user, valid 10 minutes,
 *      stored in Mongo (model/TelegramLinkCode.js explains why not memory).
 *   3. The UI shows https://t.me/<bot>?start=<code>.
 *   4. Telegram sends the bot "/start <code>" from the user's chat.
 *   5. handleTelegramUpdate matches the code, writes the chat id onto the
 *      User, burns the code, and replies in the chat.
 *
 * The code is what proves "this Telegram account belongs to that HRMS
 * account". Nothing else in the update can be trusted — chat ids and
 * usernames are supplied by the caller.
 */

import { timingSafeEqual } from "node:crypto";
import UserModel from "../model/User.js";
import TelegramLinkCodeModel, {
  generateLinkCode,
  linkCodeExpiry,
  LINK_CODE_TTL_MINUTES,
} from "../model/TelegramLinkCode.js";
import {
  telegramEnabled,
  telegramBotUsername,
  sendTelegramReply,
  escapeHtml,
} from "../utils/telegram.js";

/** Constant-time compare that also refuses when the secret is unset. */
function secretMatches(candidate) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || !candidate) return false;
  const a = Buffer.from(String(candidate));
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // length — compare sizes first and return the same false either way.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Applies a "/start <code>" update. Shared by the webhook (production) and
 * the polling loop (local dev) so the two cannot drift.
 *
 * Returns a small result object for tests and logs; it never throws, because
 * a malformed update from the internet must not take down the poller.
 */
export async function handleTelegramUpdate(update) {
  const message = update?.message;
  const chatId = message?.chat?.id;
  const text = (message?.text ?? "").trim();
  if (!chatId || !text) return { handled: false, reason: "not-a-text-message" };

  const match = /^\/start(?:@\w+)?\s+(\S+)$/.exec(text);
  if (!match) {
    if (/^\/start\b/.test(text)) {
      await sendTelegramReply(
        chatId,
        "Open HRMS → Settings → Notifications and tap Connect Telegram to get your link code.",
      );
      return { handled: true, reason: "start-without-code" };
    }
    return { handled: false, reason: "unrecognised-command" };
  }

  const code = match[1].toUpperCase();
  const record = await TelegramLinkCodeModel.findOne({ code });

  // Mongo's TTL sweeper runs about once a minute, so an expired document can
  // still be present. Check explicitly rather than trusting the index.
  if (!record || record.expiresAt.getTime() <= Date.now()) {
    if (record) await TelegramLinkCodeModel.deleteOne({ _id: record._id });
    await sendTelegramReply(chatId, "That link code is invalid or has expired. Generate a new one in HRMS.");
    return { handled: true, reason: "invalid-code" };
  }

  const user = await UserModel.findById(record.user, "name notify");
  if (!user) {
    await TelegramLinkCodeModel.deleteOne({ _id: record._id });
    return { handled: true, reason: "user-gone" };
  }

  await UserModel.updateOne(
    { _id: user._id },
    { $set: { "notify.telegram": true, "notify.telegramChatId": String(chatId) } },
  );
  // Single-use: burn it whether or not the reply below succeeds.
  await TelegramLinkCodeModel.deleteOne({ _id: record._id });

  await sendTelegramReply(chatId, `✅ Connected to HRMS as <b>${escapeHtml(user.name)}</b>.`);
  return { handled: true, reason: "linked", userId: String(user._id) };
}

const telegramController = {
  /** GET /notifications/telegram — connection status for the Settings panel. */
  status: async (req, res) => {
    try {
      const user = await UserModel.findById(req.user.id, "notify");
      res.json({
        success: true,
        data: {
          // Whether the feature exists at all on this deployment — Settings
          // shows a "not configured" note rather than a dead button.
          available: telegramEnabled() && Boolean(telegramBotUsername()),
          botUsername: telegramBotUsername(),
          connected: Boolean(user?.notify?.telegramChatId),
          enabled: Boolean(user?.notify?.telegram),
        },
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message, code: error.code });
    }
  },

  /** POST /notifications/telegram/link-code — mint a fresh code for this user. */
  linkCode: async (req, res) => {
    try {
      if (!telegramEnabled() || !telegramBotUsername()) {
        return res.status(503).json({
          success: false,
          message: "Telegram is not configured on this server.",
          code: "TELEGRAM_NOT_CONFIGURED",
        });
      }

      // One live code per user: minting a second should invalidate the first,
      // or a code shown on a stale tab would still work.
      await TelegramLinkCodeModel.deleteMany({ user: req.user.id });

      const record = await TelegramLinkCodeModel.create({
        code: generateLinkCode(),
        user: req.user.id,
        expiresAt: linkCodeExpiry(),
      });

      res.status(201).json({
        success: true,
        data: {
          code: record.code,
          expiresAt: record.expiresAt,
          expiresInMinutes: LINK_CODE_TTL_MINUTES,
          botUsername: telegramBotUsername(),
          deepLink: `https://t.me/${telegramBotUsername()}?start=${record.code}`,
        },
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message, code: error.code });
    }
  },

  /** DELETE /notifications/telegram — unlink this account. */
  disconnect: async (req, res) => {
    try {
      await UserModel.updateOne(
        { _id: req.user.id },
        { $set: { "notify.telegram": false, "notify.telegramChatId": null } },
      );
      await TelegramLinkCodeModel.deleteMany({ user: req.user.id });
      res.json({ success: true, message: "Telegram disconnected." });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message, code: error.code });
    }
  },

  /**
   * POST /notifications/telegram/webhook/:secret
   *
   * Unauthenticated by design — Telegram cannot present a JWT. The secret in
   * the path IS the credential, which is why it is compared in constant time
   * and why a mismatch answers 404 rather than 401: an unknown path leaks
   * less than "wrong secret".
   */
  webhook: async (req, res) => {
    if (!secretMatches(req.params.secret)) {
      return res.status(404).json({ success: false, message: "Not found", code: "ROUTE_NOT_FOUND" });
    }

    try {
      await handleTelegramUpdate(req.body);
    } catch (err) {
      console.error("[telegram] update handling failed:", err.message);
    }

    // Always 200. Anything else makes Telegram retry the same update, and a
    // message we could not parse will not parse on the retry either.
    res.json({ ok: true });
  },
};

export default telegramController;
