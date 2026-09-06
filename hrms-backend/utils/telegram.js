/**
 * telegram.js — the Bot API client.
 *
 * No SDK. The whole surface this app needs is three POSTs to
 * api.telegram.org, and node-telegram-bot-api would mostly be buying a
 * polling loop we only want in local development.
 *
 * Graceful degrade is the same contract Cloudinary and Gemini already have
 * here: with TELEGRAM_BOT_TOKEN unset every call logs once and no-ops, so a
 * teammate cloning the repo is never blocked by a missing bot.
 */

const API_ROOT = "https://api.telegram.org";

let warnedDisabled = false;

export function telegramEnabled() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

export function telegramBotUsername() {
  return process.env.TELEGRAM_BOT_USERNAME || null;
}

/**
 * Telegram renders a subset of HTML, so anything interpolated from the
 * database has to be escaped. An employee named "Nguyen <Minh>" would
 * otherwise produce an unparseable message and a 400 from the API — and
 * `&` alone is enough to do it.
 */
export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function callTelegram(method, payload) {
  if (!telegramEnabled()) {
    if (!warnedDisabled) {
      console.log("[telegram] TELEGRAM_BOT_TOKEN not set — Telegram delivery disabled");
      warnedDisabled = true;
    }
    return { ok: false, disabled: true };
  }

  let response;
  try {
    response = await fetch(`${API_ROOT}/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    // Network unreachable, DNS, restricted egress. Not fatal to anything.
    return { ok: false, error: err.message };
  }

  const body = await response.json().catch(() => ({}));
  if (response.ok && body.ok) return { ok: true, result: body.result };

  return {
    ok: false,
    status: response.status,
    description: body.description ?? `HTTP ${response.status}`,
    // 403 is how Telegram reports "the user blocked this bot" or "the user
    // deleted the chat". It is permanent until they start the bot again, so
    // the caller should stop trying rather than retry forever.
    blocked: response.status === 403,
  };
}

function appBaseUrl() {
  return process.env.APP_BASE_URL || process.env.CORS_ORIGIN || "";
}

/**
 * Send one notification message.
 *
 * `link` is an in-app path ("/holidays"); it becomes an absolute URL button
 * only when APP_BASE_URL/CORS_ORIGIN says where the app lives. Telegram
 * rejects a relative url outright, so a missing base means no button rather
 * than a failed send.
 */
export async function sendTelegramMessage({ chatId, title, body, link, linkLabel }) {
  if (!chatId) return { ok: false, error: "no chat id" };

  const text = [`<b>${escapeHtml(title)}</b>`, escapeHtml(body)].filter(Boolean).join("\n");

  const base = appBaseUrl();
  const url = link && base ? `${base.replace(/\/$/, "")}${link}` : null;

  return callTelegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    // The app's own links are the point of the message; the preview card
    // Telegram would generate for them is noise.
    disable_web_page_preview: true,
    ...(url
      ? { reply_markup: { inline_keyboard: [[{ text: linkLabel || "Open in HRMS", url }]] } }
      : {}),
  });
}

/** Plain reply used by the /start linking handshake. */
export async function sendTelegramReply(chatId, text) {
  return callTelegram("sendMessage", { chat_id: chatId, text, parse_mode: "HTML" });
}

/**
 * Point Telegram at our webhook. The secret is part of the PATH, so a
 * request that does not know it never reaches the handler.
 */
export async function setTelegramWebhook(publicUrl) {
  return callTelegram("setWebhook", {
    url: publicUrl,
    allowed_updates: ["message"],
  });
}

/** Long-poll for updates — local development only, where there is no public URL. */
export async function getTelegramUpdates(offset, timeoutSeconds = 25) {
  return callTelegram("getUpdates", {
    offset,
    timeout: timeoutSeconds,
    allowed_updates: ["message"],
  });
}

/** Test seam: lets a suite assert the "logged once" behaviour from a clean slate. */
export function resetTelegramWarning() {
  warnedDisabled = false;
}

export default sendTelegramMessage;
