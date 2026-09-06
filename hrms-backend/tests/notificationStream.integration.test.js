/**
 * notificationStream.integration.test.js — the SSE handshake and feed.
 *
 * Covers the part of Level 1 that is easy to get subtly wrong: the ticket,
 * which exists only because EventSource cannot send an Authorization
 * header. A ticket that were reusable, long-lived, or interchangeable with
 * an access token would be strictly worse than the query-string access
 * token it was introduced to avoid.
 *
 * Timings are shrunk through the same env vars production reads, so a
 * stream response actually completes instead of hanging the suite.
 */

process.env.SSE_MAX_CONNECTION_MS = "400";
process.env.SSE_HEARTBEAT_MS = "50";

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import supertest from "supertest";
import { startDb, stopDb, clearDb, createApp } from "./testHelpers.js";
import { auth, seedPerformanceOrg } from "./performanceFixtures.js";

let dbAvailable = false;
let app;
let request;
let org;

beforeAll(async () => {
  try {
    await startDb();
    dbAvailable = true;
  } catch (err) {
    console.warn(`[notificationStream] MongoDB unavailable — skipping.\n${err.message}`);
    return;
  }
  app = await createApp();
  request = supertest(app);
});

afterAll(async () => {
  await stopDb();
});

beforeEach(async () => {
  if (!dbAvailable) return;
  await clearDb();
  const { resetHub } = await import("../utils/sseHub.js");
  resetHub();
  org = await seedPerformanceOrg(app);
});

async function getTicket(token) {
  const res = await request.get("/api/v1/notifications/stream-ticket").set(auth(token));
  expect(res.status).toBe(200);
  return res.body.data.ticket;
}

const streamUrl = (ticket) => `/api/v1/notifications/stream?ticket=${encodeURIComponent(ticket)}`;

describe("GET /notifications/stream-ticket", () => {
  it("requires a normal Bearer token", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const res = await request.get("/api/v1/notifications/stream-ticket");
    expect(res.status).toBe(401);
  });

  it("returns a short-lived ticket", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const res = await request
      .get("/api/v1/notifications/stream-ticket")
      .set(auth(org.tokens.dev));

    expect(res.status).toBe(200);
    expect(typeof res.body.data.ticket).toBe("string");
    // 60s: long enough to open a connection, short enough that a ticket
    // leaked through a proxy log is worthless by the time anyone reads it.
    expect(res.body.data.expiresIn).toBe(60);
  });
});

describe("GET /notifications/stream — ticket enforcement", () => {
  it("rejects a request with no ticket", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const res = await request.get("/api/v1/notifications/stream");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("STREAM_TICKET_INVALID");
  });

  it("rejects an access token presented as a ticket", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    // The two are signed with the same secret, so only the tokenType claim
    // separates them. If this ever passes, a 20-minute credential is being
    // accepted in a query string — exactly what the ticket avoids.
    const res = await request.get(streamUrl(org.tokens.dev));
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("STREAM_TICKET_INVALID");
  });

  it("rejects a garbage ticket", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const res = await request.get(streamUrl("not-a-jwt"));
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("STREAM_TICKET_INVALID");
  });

  it("rejects an expired ticket", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const jwt = (await import("jsonwebtoken")).default;
    const stale = jwt.sign(
      { id: "u1", role: "EMPLOYEE", tokenType: "SSE", jti: "stale" },
      process.env.AT_SECRETKEY,
      { expiresIn: -10 },
    );

    const res = await request.get(streamUrl(stale));
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("STREAM_TICKET_INVALID");
  });

  it("rejects a ticket that has already been used", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const ticket = await getTicket(org.tokens.dev);

    await request.get(streamUrl(ticket)); // spends it
    const replay = await request.get(streamUrl(ticket));

    expect(replay.status).toBe(401);
    expect(replay.body.code).toBe("STREAM_TICKET_ALREADY_USED");
  });
});

describe("GET /notifications/stream — the feed", () => {
  it("opens with event-stream headers and proxy buffering disabled", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const ticket = await getTicket(org.tokens.dev);

    const res = await request.get(streamUrl(ticket));

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.headers["cache-control"]).toContain("no-cache");
    // Without this, an nginx-style proxy buffers the stream and nothing
    // arrives until the buffer fills — the failure looks like "SSE just
    // doesn't work in production" while working locally.
    expect(res.headers["x-accel-buffering"]).toBe("no");
  });

  it("delivers a notification written while the connection is open", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { clientCount } = await import("../utils/sseHub.js");
    const { emitNotification } = await import("../utils/notify.js");
    const ticket = await getTicket(org.tokens.dev);

    // .then() is what dispatches a superagent request — it is lazy, so
    // holding the un-awaited builder would never open the connection at all.
    const stream = request.get(streamUrl(ticket)).then((r) => r);
    await vi.waitFor(() => expect(clientCount()).toBe(1));

    await emitNotification({
      user: org.users.dev.userId,
      category: "leave",
      title: "Leave approved",
      titleKey: "leaveApproved",
    });

    const res = await stream;
    expect(res.text).toContain("event: notification");
    expect(res.text).toContain("leaveApproved");
  });

  it("does not deliver another user's addressed notification", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { clientCount } = await import("../utils/sseHub.js");
    const { emitNotification } = await import("../utils/notify.js");
    const ticket = await getTicket(org.tokens.dev);

    // .then() is what dispatches a superagent request — it is lazy, so
    // holding the un-awaited builder would never open the connection at all.
    const stream = request.get(streamUrl(ticket)).then((r) => r);
    await vi.waitFor(() => expect(clientCount()).toBe(1));

    await emitNotification({
      user: org.users.designer.userId,
      category: "leave",
      title: "Not for dev",
      titleKey: "notForDev",
    });

    const res = await stream;
    expect(res.text).not.toContain("notForDev");
  });

  it("releases the connection when it ends, leaking no timer or socket", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { clientCount } = await import("../utils/sseHub.js");
    const ticket = await getTicket(org.tokens.dev);

    const stream = request.get(streamUrl(ticket)).then((r) => r);
    // Assert it actually registered first — otherwise "count is 0 at the end"
    // is equally true of a connection that never opened, and this test would
    // pass while proving nothing.
    await vi.waitFor(() => expect(clientCount()).toBe(1));

    await stream;

    // The hub holds a reference to every open response. Without the
    // req.on("close") cleanup this count only ever climbs, and publish()
    // keeps writing into closed sockets for the life of the process.
    await vi.waitFor(() => expect(clientCount()).toBe(0));
  });
});
