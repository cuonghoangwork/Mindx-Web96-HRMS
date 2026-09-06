/**
 * sseHub.js — the in-process registry of open Server-Sent Events
 * connections, and the fan-out target utils/notify.js publishes to.
 *
 * KNOWN LIMIT, worth stating plainly: this is process-local memory. It
 * works because the deployment is a single Render instance (see
 * render.yaml). Run two and a notification written by instance A reaches
 * nobody connected to instance B — the fix then is Mongo change streams or
 * Redis pub/sub behind this same publish() signature, not a bigger Map.
 *
 * Two deliberate departures from HRMS_REALTIME_NOTIFICATIONS_PLAN.md §1.1:
 *
 * 1. **A flat Set, not Map<userId, Set<res>>.** The Map only pays off for
 *    addressed delivery, and at this scale (tens of connections) scanning
 *    the set costs nothing while being materially harder to get wrong —
 *    a broadcast has no userId to key on, so the Map needs a second
 *    structure beside it anyway.
 *
 * 2. **publish() takes the Mongoose document and maps it here.** The plan
 *    passes the raw doc through. The frontend reads `id` and `timestamp`,
 *    which only exist after notificationToClient() — publishing the raw
 *    doc would deliver `_id`/`createdAt` and render a broken row with no
 *    error anywhere.
 */

import { broadcastAudiencesFor } from "../model/Notification.js";
import { notificationToClient } from "./mappers.js";

/** @type {Set<{ res: import("express").Response, userId: string, role: string }>} */
const clients = new Set();

/**
 * Single-use ticket enforcement: jti -> expiry (epoch seconds).
 *
 * Tickets live 60s, so this map self-limits; pruning on each consume keeps
 * it from growing across a long uptime. Process-local for the same reason
 * as `clients` above, and with the same caveat.
 */
const usedTickets = new Map();

/**
 * Records a ticket's jti as spent. Returns false if it was already used,
 * which is the replay case the caller turns into a 401.
 */
export function consumeTicketId(jti, expSeconds) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  for (const [id, exp] of usedTickets) {
    if (exp <= nowSeconds) usedTickets.delete(id);
  }
  if (usedTickets.has(jti)) return false;
  usedTickets.set(jti, expSeconds ?? nowSeconds + 60);
  return true;
}

/**
 * Registers an open connection. Returns the unsubscribe function — the
 * caller MUST invoke it from req.on("close"), or the set holds a reference
 * to a dead socket and every later publish writes into nothing.
 */
export function subscribe(client) {
  clients.add(client);
  return () => clients.delete(client);
}

/**
 * Does this connection's viewer receive this notification?
 *
 * Addressed notices go to that user's connections only. Broadcasts use the
 * same role -> audience map the REST read path uses
 * (broadcastAudiencesFor in model/Notification.js), so the live feed and a
 * page refresh can never disagree about who sees what.
 */
function isRecipient(client, doc) {
  if (doc.user) return String(doc.user) === String(client.userId);
  return broadcastAudiencesFor(client.role).includes(doc.audience ?? "all");
}

function writeEvent(res, event, payload) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

/**
 * Deliver a freshly written notification to every matching open connection.
 *
 * Never throws: it is called from utils/notify.js's fan-out, which must not
 * be able to fail the request that produced the notification. A write to a
 * half-closed socket throws synchronously — that connection is dropped and
 * the rest still get theirs.
 *
 * @returns {number} how many connections were written to (used by tests)
 */
export function publish(doc) {
  const payload = notificationToClient(doc);
  let delivered = 0;

  for (const client of [...clients]) {
    if (!isRecipient(client, doc)) continue;
    try {
      writeEvent(client.res, "notification", payload);
      delivered += 1;
    } catch {
      // Socket died between the close event and this write. Drop it.
      clients.delete(client);
    }
  }

  return delivered;
}

/** Open connection count — for the health check and for tests. */
export function clientCount() {
  return clients.size;
}

/** Test-only reset, so one suite's fake connections can't leak into the next. */
export function resetHub() {
  clients.clear();
  usedTickets.clear();
}

export default { subscribe, publish, clientCount, consumeTicketId, resetHub };
