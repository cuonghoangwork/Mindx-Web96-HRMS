import mongoose from "mongoose";
import { randomInt } from "node:crypto";

/**
 * Short-lived code tying a Telegram chat to an HRMS account. In Mongo, not
 * memory: the code is minted here, typed into Telegram, and comes back on a
 * webhook that may hit a freshly cold-started instance.
 */

// No O/0, I/1 or 5/S — the code is read off a screen and retyped on a phone.
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

// TTL index: the backstop behind the redeem path's own expiry check.
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
