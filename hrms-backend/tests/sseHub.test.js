/**
 * sseHub.test.js — the live-delivery routing table.
 *
 * No database: publish() takes a notification-shaped object and the mappers
 * accept a plain object, so this stays a fast unit test of the one thing
 * that decides who sees a live notification.
 *
 * The routing here has to agree with the REST read path in
 * controller/notificationController.js. If they ever disagree, the bug is
 * "the badge shows something that vanishes on refresh" — which is why both
 * sides call broadcastAudiencesFor() rather than each having an opinion.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  subscribe,
  publish,
  clientCount,
  consumeTicketId,
  resetHub,
} from "../utils/sseHub.js";

beforeEach(() => {
  resetHub();
});

/** A stand-in for an Express response that records what was written to it. */
function fakeConnection(userId, role) {
  const written = [];
  const client = { userId, role, res: { write: (chunk) => written.push(chunk) }, written };
  client.unsubscribe = subscribe(client);
  return client;
}

/** Parse the `data:` line back out of the SSE frames a connection received. */
function eventsOf(client) {
  return client.written.map((frame) => JSON.parse(frame.match(/^data: (.*)$/m)[1]));
}

describe("publish — addressed notifications", () => {
  it("reaches only the connection belonging to that user", () => {
    const target = fakeConnection("user-1", "EMPLOYEE");
    const other = fakeConnection("user-2", "EMPLOYEE");

    const delivered = publish({
      _id: "n1",
      user: "user-1",
      category: "leave",
      title: "Leave approved",
      createdAt: new Date("2027-01-01T00:00:00Z"),
    });

    expect(delivered).toBe(1);
    expect(eventsOf(target)).toHaveLength(1);
    expect(eventsOf(other)).toHaveLength(0);
  });

  it("reaches every tab that user has open", () => {
    const tabA = fakeConnection("user-1", "EMPLOYEE");
    const tabB = fakeConnection("user-1", "EMPLOYEE");

    expect(publish({ _id: "n1", user: "user-1", category: "leave", title: "x" })).toBe(2);
    expect(eventsOf(tabA)).toHaveLength(1);
    expect(eventsOf(tabB)).toHaveLength(1);
  });
});

describe("publish — broadcast audiences", () => {
  const broadcast = (audience) => ({
    _id: "n1",
    user: null,
    audience,
    category: "system",
    title: "Broadcast",
  });

  it('sends "hr" to ADMIN and HR only', () => {
    const admin = fakeConnection("u1", "ADMIN");
    const hr = fakeConnection("u2", "HR");
    const manager = fakeConnection("u3", "MANAGER");
    const employee = fakeConnection("u4", "EMPLOYEE");

    expect(publish(broadcast("hr"))).toBe(2);
    expect(eventsOf(admin)).toHaveLength(1);
    expect(eventsOf(hr)).toHaveLength(1);
    // MANAGER is department-scoped and a broadcast carries no department —
    // same rule the REST endpoint applies, deliberately.
    expect(eventsOf(manager)).toHaveLength(0);
    expect(eventsOf(employee)).toHaveLength(0);
  });

  it('sends "employees" to MANAGER and EMPLOYEE only', () => {
    const admin = fakeConnection("u1", "ADMIN");
    const manager = fakeConnection("u3", "MANAGER");
    const employee = fakeConnection("u4", "EMPLOYEE");

    expect(publish(broadcast("employees"))).toBe(2);
    expect(eventsOf(admin)).toHaveLength(0);
    expect(eventsOf(manager)).toHaveLength(1);
    expect(eventsOf(employee)).toHaveLength(1);
  });

  it('sends "all" to everyone', () => {
    fakeConnection("u1", "ADMIN");
    fakeConnection("u2", "HR");
    fakeConnection("u3", "MANAGER");
    fakeConnection("u4", "EMPLOYEE");

    expect(publish(broadcast("all"))).toBe(4);
  });

  it("treats a missing audience as 'all', matching the schema default", () => {
    fakeConnection("u1", "ADMIN");
    fakeConnection("u4", "EMPLOYEE");

    expect(publish({ _id: "n1", user: null, category: "system", title: "x" })).toBe(2);
  });
});

describe("publish — wire format", () => {
  it("emits a named SSE event terminated by a blank line", () => {
    const client = fakeConnection("u1", "EMPLOYEE");

    publish({ _id: "n1", user: "u1", category: "leave", title: "Hello" });

    const [frame] = client.written;
    expect(frame.startsWith("event: notification\n")).toBe(true);
    expect(frame.endsWith("\n\n")).toBe(true);
  });

  it("delivers the CLIENT shape, not the raw document", () => {
    const client = fakeConnection("u1", "EMPLOYEE");

    publish({
      _id: "abc123",
      user: "u1",
      category: "leave",
      title: "Hello",
      createdAt: new Date("2027-01-01T00:00:00Z"),
    });

    const [event] = eventsOf(client);
    // The frontend dedupes on `id` and renders `timestamp`. Publishing the
    // raw doc would send `_id`/`createdAt`, the dedupe would compare against
    // undefined, and the row would render without a date — with no error
    // anywhere. This assertion is the whole reason publish() maps.
    expect(event.id).toBe("abc123");
    expect(event.timestamp).toBe("2027-01-01T00:00:00.000Z");
    expect(event._id).toBeUndefined();
    expect(event.createdAt).toBeUndefined();
  });
});

describe("connection lifecycle", () => {
  it("stops delivering once unsubscribed", () => {
    const client = fakeConnection("u1", "EMPLOYEE");
    expect(clientCount()).toBe(1);

    client.unsubscribe();

    expect(clientCount()).toBe(0);
    expect(publish({ _id: "n1", user: "u1", category: "leave", title: "x" })).toBe(0);
  });

  it("drops a socket that throws mid-write without losing the others", () => {
    const dead = { userId: "u1", role: "EMPLOYEE", res: { write: () => { throw new Error("EPIPE"); } } };
    subscribe(dead);
    const alive = fakeConnection("u1", "EMPLOYEE");

    // A socket can die between its close event and the next publish. The
    // survivor must still be served, and the corpse must not linger.
    expect(publish({ _id: "n1", user: "u1", category: "leave", title: "x" })).toBe(1);
    expect(eventsOf(alive)).toHaveLength(1);
    expect(clientCount()).toBe(1);
  });
});

describe("consumeTicketId", () => {
  it("accepts a jti once and refuses the replay", () => {
    expect(consumeTicketId("ticket-a", Math.floor(Date.now() / 1000) + 60)).toBe(true);
    expect(consumeTicketId("ticket-a", Math.floor(Date.now() / 1000) + 60)).toBe(false);
  });

  it("keeps distinct tickets independent", () => {
    expect(consumeTicketId("ticket-a")).toBe(true);
    expect(consumeTicketId("ticket-b")).toBe(true);
  });

  it("prunes entries that have expired, so the map cannot grow forever", () => {
    const past = Math.floor(Date.now() / 1000) - 1;
    expect(consumeTicketId("expired", past)).toBe(true);

    // The pruning pass runs on the next consume; once "expired" is swept the
    // id is reusable, which is harmless because the JWT itself no longer
    // verifies. What matters is that the map does not accumulate a row per
    // connection for the life of the process.
    consumeTicketId("something-else");
    expect(consumeTicketId("expired", past)).toBe(true);
  });
});
