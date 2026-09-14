/**
 * Bot API client — three POSTs, no SDK. With TELEGRAM_BOT_TOKEN unset every
 * call logs once and no-ops, like Cloudinary and Gemini.
 */

const API_ROOT = "https://api.telegram.org";

let warnedDisabled = false;

export function telegramEnabled() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

export function telegramBotUsername() {
  return process.env.TELEGRAM_BOT_USERNAME || null;
}

/** Telegram parses a subset of HTML; an unescaped `&` in a name is enough for a 400. */
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
    return { ok: false, error: err.message };
  }

  const body = await response.json().catch(() => ({}));
  if (response.ok && body.ok) return { ok: true, result: body.result };

  return {
    ok: false,
    status: response.status,
    description: body.description ?? `HTTP ${response.status}`,
    // 403 = the user blocked the bot or deleted the chat; stop trying.
    blocked: response.status === 403,
  };
}

function appBaseUrl() {
  return process.env.APP_BASE_URL || process.env.CORS_ORIGIN || "";
}

/** `link` is an in-app path; it becomes a button only when APP_BASE_URL/CORS_ORIGIN is set (Telegram rejects relative URLs). */
export async function sendTelegramMessage({ chatId, title, body, link, linkLabel }) {
  if (!chatId) return { ok: false, error: "no chat id" };

  const text = [`<b>${escapeHtml(title)}</b>`, escapeHtml(body)].filter(Boolean).join("\n");

  const base = appBaseUrl();
  const url = link && base ? `${base.replace(/\/$/, "")}${link}` : null;

  return callTelegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
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

/** The webhook secret is part of the path, so an unknowing request never reaches the handler. */
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
