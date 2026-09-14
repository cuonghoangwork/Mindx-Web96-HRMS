/**
 * Telegram account linking and the inbound webhook. Settings mints a
 * 10-minute code (POST link-code), the UI shows t.me/<bot>?start=<code>,
 * Telegram delivers "/start <code>", and handleTelegramUpdate writes the
 * chat id onto the User and burns the code. The code is the only thing in
 * the update that can be trusted.
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
import { asyncHandler } from "../utils/asyncHandler.js";

/** Constant-time compare that also refuses when the secret is unset. */
function secretMatches(candidate) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || !candidate) return false;
  const a = Buffer.from(String(candidate));
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch; compare sizes first.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Applies a "/start <code>" update; shared by the webhook and the dev poller. Never throws. */
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

  // The TTL sweeper runs about once a minute; check expiry explicitly.
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
  // Single-use, whether or not the reply succeeds.
  await TelegramLinkCodeModel.deleteOne({ _id: record._id });

  await sendTelegramReply(chatId, `✅ Connected to HRMS as <b>${escapeHtml(user.name)}</b>.`);
  return { handled: true, reason: "linked", userId: String(user._id) };
}

const telegramController = {
  /** GET /notifications/telegram — connection status for the Settings panel. */
  status: asyncHandler(async (req, res) => {
    const user = await UserModel.findById(req.user.id, "notify");
    res.json({
      success: true,
      data: {
        available: telegramEnabled() && Boolean(telegramBotUsername()),
        botUsername: telegramBotUsername(),
        connected: Boolean(user?.notify?.telegramChatId),
        enabled: Boolean(user?.notify?.telegram),
      },
    });
  }, 500),

  /** POST /notifications/telegram/link-code — mint a fresh code for this user. */
  linkCode: asyncHandler(async (req, res) => {
    if (!telegramEnabled() || !telegramBotUsername()) {
      return res.status(503).json({
        success: false,
        message: "Telegram is not configured on this server.",
        code: "TELEGRAM_NOT_CONFIGURED",
      });
    }

    // One live code per user, or a code on a stale tab would still work.
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
  }, 500),

  /** DELETE /notifications/telegram — unlink this account. */
  disconnect: asyncHandler(async (req, res) => {
    await UserModel.updateOne(
      { _id: req.user.id },
      { $set: { "notify.telegram": false, "notify.telegramChatId": null } },
    );
    await TelegramLinkCodeModel.deleteMany({ user: req.user.id });
    res.json({ success: true, message: "Telegram disconnected." });
  }, 500),

  /**
   * POST /notifications/telegram/webhook/:secret — the path secret is the
   * credential (Telegram cannot present a JWT); a mismatch answers 404, which
   * leaks less than "wrong secret".
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

    // Always 200 — anything else makes Telegram retry an update that will not parse next time either.
    res.json({ ok: true });
  },
};

export default telegramController;
