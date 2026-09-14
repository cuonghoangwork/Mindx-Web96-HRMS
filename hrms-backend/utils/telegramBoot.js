/**
 * Brings the bot's inbound side up: a webhook in production (Telegram POSTs
 * to a public URL and retries, so a sleeping instance is fine) or long
 * polling in local development (no public URL). Both feed the same
 * handleTelegramUpdate().
 */

import { getTelegramUpdates, setTelegramWebhook, telegramEnabled } from "./telegram.js";
import { handleTelegramUpdate } from "../controller/telegramController.js";

const POLL_TIMEOUT_SECONDS = 25;
// Backoff after a failed poll.
const POLL_ERROR_BACKOFF_MS = 5_000;

let polling = false;

async function pollForever() {
  let offset;
  while (polling) {
    const result = await getTelegramUpdates(offset, POLL_TIMEOUT_SECONDS);

    if (!result.ok) {
      if (result.disabled) return;
      console.error("[telegram] getUpdates failed:", result.description ?? result.error);
      await new Promise((resolve) => setTimeout(resolve, POLL_ERROR_BACKOFF_MS));
      continue;
    }

    for (const update of result.result ?? []) {
      // Advance past the update regardless, or a failing one is re-delivered forever.
      offset = update.update_id + 1;
      try {
        await handleTelegramUpdate(update);
      } catch (err) {
        console.error("[telegram] update handling failed:", err.message);
      }
    }
  }
}

export function startTelegram() {
  if (process.env.NODE_ENV === "test") return null;
  if (!telegramEnabled()) return null;

  const mode = process.env.TELEGRAM_MODE || "polling";

  if (mode === "webhook") {
    const url = process.env.TELEGRAM_WEBHOOK_URL;
    if (!url) {
      // Not guessed from CORS_ORIGIN: a wrong webhook URL fails silently.
      console.warn(
        "[telegram] TELEGRAM_MODE=webhook but TELEGRAM_WEBHOOK_URL is unset — no webhook registered. " +
          "Set it to https://<your-api-host>/api/v1/notifications/telegram/webhook/<TELEGRAM_WEBHOOK_SECRET>",
      );
      return null;
    }
    setTelegramWebhook(url)
      .then((result) => {
        if (result.ok) console.log("[telegram] webhook registered");
        else console.error("[telegram] setWebhook failed:", result.description ?? result.error);
      })
      .catch((err) => console.error("[telegram] setWebhook failed:", err.message));
    return { mode };
  }

  if (polling) return { mode };
  polling = true;
  console.log("[telegram] polling for updates (local dev mode)");
  pollForever().catch((err) => {
    polling = false;
    console.error("[telegram] polling stopped:", err.message);
  });
  return { mode, stop: stopTelegram };
}

export function stopTelegram() {
  polling = false;
}

export default startTelegram;
