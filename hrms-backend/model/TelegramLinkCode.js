import mongoose from "mongoose";
import { randomInt } from "node:crypto";

/**
 * TelegramLinkCode — the short-lived code that ties a Telegram chat to an
 * HRMS account.
 *
 * In Mongo rather than an in-memory Map on purpose. Linking spans two
 * systems and a human: the code is minted here, shown in Settings, typed or
 * tapped into Telegram, and comes back on a webhook that may land on a
 * process that has just cold-started. A Render free instance sleeping
 * between those steps would silently invalidate every code in flight.
 */

// Unambiguous alphabet: no O/0, I/1, or 5/S. The code gets read off a screen
// and retyped on a phone, so the characters people confuse are removed rather
// than the failure being blamed on the user.
const ALPHABET = "ABCDEFGHJKLMNPQRTUVWXY2346789";
const CODE_LENGTH = 6;
export const LINK_CODE_TTL_MINUTES = 10;

const telegramLinkCodeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// Mongo sweeps expired codes itself, so a stale code cannot be redeemed even
// if the redeem path forgets to check. The check is still there — this is the
// backstop, not the rule.
telegramLinkCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/** Cryptographically random, not Math.random: this is a bearer credential. */
export function generateLinkCode() {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}

export function linkCodeExpiry(from = new Date()) {
  return new Date(from.getTime() + LINK_CODE_TTL_MINUTES * 60_000);
}

export default mongoose.model("TelegramLinkCode", telegramLinkCodeSchema, "telegramLinkCodes");
