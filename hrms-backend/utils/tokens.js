import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";

/**
 * Signs an Access Token + Refresh Token pair from the same payload,
 * using two SEPARATE secrets (AT_SECRETKEY / RT_SECRETKEY) so a leaked
 * AT secret can't be used to forge refresh tokens.
 */
export function signTokens(payload) {
  const access_token = jwt.sign(
    { ...payload, tokenType: "AT" },
    process.env.AT_SECRETKEY,
    { expiresIn: process.env.AT_EXPIRES_IN || "20m" },
  );
  const refresh_token = jwt.sign(
    { ...payload, tokenType: "RT" },
    process.env.RT_SECRETKEY,
    { expiresIn: process.env.RT_EXPIRES_IN || "4w" },
  );
  return { access_token, refresh_token };
}

/* ─────────────────────────────────────────────────────────────
   SSE stream tickets (Level 1 — live notifications)

   EventSource cannot send an Authorization header, so the stream
   endpoint cannot reuse the Bearer token every other route uses. The
   alternative — putting the access token in the query string — writes a
   20-minute credential into Render's access logs and every proxy in
   between. A ticket is a separate, deliberately feeble credential:
   60 seconds, single-use, and good for exactly one endpoint.

   Signed with AT_SECRETKEY but stamped tokenType "SSE", so
   middleware/auth.js's verifyToken rejects it everywhere else (it
   requires "AT") and verifyStreamTicket rejects a real access token
   here. The two can't be swapped in either direction.
   ───────────────────────────────────────────────────────────── */

export const STREAM_TICKET_TTL_SECONDS = 60;

export function signStreamTicket({ id, role }) {
  return jwt.sign(
    { id, role, tokenType: "SSE", jti: randomUUID() },
    process.env.AT_SECRETKEY,
    { expiresIn: STREAM_TICKET_TTL_SECONDS },
  );
}

/**
 * Verifies signature, expiry and token type. Throws on anything wrong —
 * the caller turns that into a 401. Single-use enforcement is separate
 * (see consumeTicketId in utils/sseHub.js): this function is pure, so it
 * stays testable without touching the used-ticket store.
 */
export function verifyStreamTicket(ticket) {
  const decoded = jwt.verify(ticket, process.env.AT_SECRETKEY);
  if (decoded.tokenType !== "SSE") {
    const err = new Error("Invalid token type.");
    err.code = "INVALID_TOKEN_TYPE";
    throw err;
  }
  return decoded;
}
