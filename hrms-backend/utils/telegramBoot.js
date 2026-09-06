/**
 * telegramBoot.js — brings the bot's INBOUND side up at startup.
 *
 * Outbound sending needs nothing here; it is just a fetch (utils/telegram.js).
 * Receiving is what differs by environment:
 *
 *   webhook  — production. Telegram POSTs to a public HTTPS URL. Nothing runs
 *              in-process, so a sleeping Render instance is fine: the incoming
 *              request wakes it and Telegram retries if that first one times
 *              out.
 *   polling  — local development, where localhost has no public URL. A long
 *              poll holds a request open for ~25s and returns as soon as an
 *              update arrives.
 *
 * Both feed the same handleTelegramUpdate(), so the linking handshake cannot
 * behave differently between a developer's machine and production.
 */

import { getTelegramUpdates, setTelegramWebhook, telegramEnabled } from "./telegram.js";
import { handleTelegramUpdate } from "../controller/telegramController.js";

const POLL_TIMEOUT_SECONDS = 25;
// Backoff after a failed poll, so a network outage does not become a tight
// loop against Telegram's API.
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
      // Acknowledge by advancing past this update regardless of the outcome.
      // Leaving the offset put would re-deliver a message we already failed
      // on, forever.
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
      // Deliberately not derived from CORS_ORIGIN or a guessed host: pointing
      // Telegram at the wrong URL fails silently — messages simply never
      // arrive — so this asks rather than guesses.
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
