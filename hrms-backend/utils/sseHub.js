/**
 * In-process registry of open SSE connections; utils/notify.js publishes here.
 *
 * Process-local memory — correct for the single Render instance, and the
 * upgrade path for a second one is change streams or Redis pub/sub behind
 * this same publish() signature (DECISIONS.md D8). A flat Set rather than a
 * per-user Map: broadcasts have no userId to key on, and scanning tens of
 * connections costs nothing. publish() maps the document to the client shape
 * first, because the frontend reads `id`/`timestamp`, not `_id`/`createdAt`.
 */

import { broadcastAudiencesFor } from "../model/Notification.js";
import { notificationToClient } from "./mappers.js";

/** @type {Set<{ res: import("express").Response, userId: string, role: string }>} */
const clients = new Set();

/** Spent ticket jtis → expiry (epoch seconds). Tickets live 60s; pruned on each consume. */
const usedTickets = new Map();

/** Marks a ticket spent; false if it already was (the replay case → 401). */
export function consumeTicketId(jti, expSeconds) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  for (const [id, exp] of usedTickets) {
    if (exp <= nowSeconds) usedTickets.delete(id);
  }
  if (usedTickets.has(jti)) return false;
  usedTickets.set(jti, expSeconds ?? nowSeconds + 60);
  return true;
}

/** Returns the unsubscribe function — the caller MUST call it from req.on("close"). */
export function subscribe(client) {
  clients.add(client);
  return () => clients.delete(client);
}

/** Same role → audience map the REST read path uses, so the live feed and a refresh never disagree. */
function isRecipient(client, doc) {
  if (doc.user) return String(doc.user) === String(client.userId);
  return broadcastAudiencesFor(client.role).includes(doc.audience ?? "all");
}

function writeEvent(res, event, payload) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

/** Never throws: a write to a half-closed socket drops that connection and the rest still get theirs. @returns delivered count */
export function publish(doc) {
  const payload = notificationToClient(doc);
  let delivered = 0;

  for (const client of [...clients]) {
    if (!isRecipient(client, doc)) continue;
    try {
      writeEvent(client.res, "notification", payload);
      delivered += 1;
    } catch {
      clients.delete(client);
    }
  }

  return delivered;
}

/** Open connection count — for the health check and for tests. */
export function clientCount() {
  return clients.size;
}

/** Test-only. */
export function resetHub() {
  clients.clear();
  usedTickets.clear();
}

export default { subscribe, publish, clientCount, consumeTicketId, resetHub };
