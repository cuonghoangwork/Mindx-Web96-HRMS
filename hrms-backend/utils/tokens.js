import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";

/** Access + refresh pair, signed with SEPARATE secrets so a leaked AT secret cannot forge refresh tokens. */
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

/*
 * SSE stream tickets. EventSource cannot send an Authorization header, and
 * an access token in the query string would land in every proxy's access
 * log — so the stream gets a deliberately feeble credential: 60 seconds,
 * single-use, tokenType "SSE" so verifyToken rejects it everywhere else and
 * verifyStreamTicket rejects a real access token here.
 */

export const STREAM_TICKET_TTL_SECONDS = 60;

export function signStreamTicket({ id, role }) {
  return jwt.sign(
    { id, role, tokenType: "SSE", jti: randomUUID() },
    process.env.AT_SECRETKEY,
    { expiresIn: STREAM_TICKET_TTL_SECONDS },
  );
}

/** Signature, expiry and type. Throws → 401. Single-use is enforced separately (sseHub.consumeTicketId). */
export function verifyStreamTicket(ticket) {
  const decoded = jwt.verify(ticket, process.env.AT_SECRETKEY);
  if (decoded.tokenType !== "SSE") {
    const err = new Error("Invalid token type.");
    err.code = "INVALID_TOKEN_TYPE";
    throw err;
  }
  return decoded;
}
