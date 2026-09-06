/**
 * notifySpine.test.js — utils/notify.js, the single writer.
 *
 * The characterization suite (notificationProducers.characterization.test.js)
 * proves the producers still behave the same through the spine. This file
 * covers the spine's own contracts, which no producer test would catch:
 * error propagation, fan-out isolation, and the field normalisation every
 * producer now depends on instead of spelling out `?? null` itself.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { startDb, stopDb, clearDb } from "./testHelpers.js";

let dbAvailable = false;

beforeAll(async () => {
  try {
    await startDb();
    dbAvailable = true;
  } catch (err) {
    console.warn(`[notifySpine] MongoDB unavailable — skipping.\n${err.message}`);
  }
});

afterAll(async () => {
  await stopDb();
});

beforeEach(async () => {
  if (dbAvailable) await clearDb();
});

async function allNotifications() {
  const { default: NotificationModel } = await import("../model/Notification.js");
  return NotificationModel.find().sort({ createdAt: 1 });
}

describe("emitNotification", () => {
  it("defaults to an unaddressed broadcast to everyone", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { emitNotification } = await import("../utils/notify.js");

    const doc = await emitNotification({ category: "system", title: "Hello" });

    expect(doc.user).toBeNull();
    expect(doc.audience).toBe("all");
    expect(doc.isCustom).toBe(false);
    expect(doc.read).toBe(false);
  });

  it("normalises omitted optional fields to null, not undefined", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { emitNotification } = await import("../utils/notify.js");

    // Producers used to write `titleKey: x ?? null` by hand at every call
    // site. They now rely on this instead, so it has to hold centrally.
    const doc = await emitNotification({ category: "system", title: "Hello" });

    expect(doc.titleKey).toBeNull();
    expect(doc.messageKey).toBeNull();
    expect(doc.params).toBeNull();
    expect(doc.link).toBeNull();
    expect(doc.linkLabel).toBeNull();
  });

  it("propagates a write failure rather than swallowing it", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { emitNotification } = await import("../utils/notify.js");

    // Contract 1 in utils/notify.js: every call site already sits inside a
    // try/catch that decides what a failure means there. Swallowing here
    // would silently turn a dozen of those into successes. notifyHR is the
    // one caller that opts into swallowing, and it does so explicitly.
    await expect(emitNotification({ title: "no category" })).rejects.toThrow();
    expect(await allNotifications()).toHaveLength(0);
  });

  it("omits the sender subdocument entirely when none is given", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { emitNotification } = await import("../utils/notify.js");

    const doc = await emitNotification({ category: "system", title: "Hello" });

    // System-generated notices must not look hand-composed: the frontend
    // renders "· from <name>" off senderName.
    expect(doc.sender?.id ?? null).toBeNull();
    expect(doc.sender?.name ?? null).toBeNull();
  });
});

describe("emitNotificationEach", () => {
  it("writes one addressed document per id and returns them in order", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { emitNotificationEach } = await import("../utils/notify.js");
    const mongoose = (await import("mongoose")).default;

    const ids = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
    const docs = await emitNotificationEach(ids, { category: "leave", title: "Shared" });

    expect(docs).toHaveLength(2);
    expect(docs.map((d) => String(d.user))).toEqual(ids.map(String));
    expect(docs.every((d) => d.title === "Shared")).toBe(true);
    expect(await allNotifications()).toHaveLength(2);
  });

  it("writes nothing for an empty or missing recipient list", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { emitNotificationEach } = await import("../utils/notify.js");

    // A department with no manager, or a role nobody holds yet, is a normal
    // state — not an error, and not a reason to fall back to a broadcast.
    expect(await emitNotificationEach([], { category: "leave", title: "x" })).toEqual([]);
    expect(await emitNotificationEach(undefined, { category: "leave", title: "x" })).toEqual([]);
    expect(await allNotifications()).toHaveLength(0);
  });

  it("rejects on a bad recipient without cancelling the writes already in flight", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { emitNotificationEach } = await import("../utils/notify.js");
    const mongoose = (await import("mongoose")).default;

    await expect(
      emitNotificationEach([new mongoose.Types.ObjectId(), "not-an-object-id"], {
        category: "leave",
        title: "x",
      }),
    ).rejects.toThrow();

    // Promise.all semantics, inherited deliberately from the
    // Promise.all(map(...)) this replaced: it rejects on the first failure
    // but does not cancel the rest, so a rejection means "some may already
    // have been sent", never "nothing was sent". Any future retry on top of
    // this has to be idempotent.
    //
    // Waiting for that straggler is also what keeps this test from leaking a
    // document into the next one — clearDb() runs before the in-flight write
    // lands, not after.
    await vi.waitFor(async () => {
      expect(await allNotifications()).toHaveLength(1);
    });
  });
});

describe("notifyHR", () => {
  it("is the only path that swallows, and it still writes the same document", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { notifyHR } = await import("../utils/notify.js");

    await notifyHR({ title: "Something happened" });

    const [doc] = await allNotifications();
    expect(doc.user).toBeNull();
    expect(doc.audience).toBe("hr");
    expect(doc.category).toBe("employee");
    expect(doc.isCustom).toBe(false);
  });

  it("resolves rather than rejecting when the write is impossible", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { notifyHR } = await import("../utils/notify.js");

    // Six cron jobs call this without awaiting. A rejection would become an
    // unhandled rejection and take the scheduled run down with it.
    await expect(notifyHR({})).resolves.toBeUndefined();
    expect(await allNotifications()).toHaveLength(0);
  });
});

describe("fan-out isolation", () => {
  it("returns the written document even though delivery is not awaited", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { emitNotification } = await import("../utils/notify.js");

    // Level 0 has no channels, so this only pins the seam's shape: the write
    // is what the caller waits on, delivery is not. When Level 1 adds
    // sseHub.publish, a slow or dead socket must not delay this resolve.
    const doc = await emitNotification({ category: "system", title: "Hello" });

    expect(doc._id).toBeTruthy();
    expect(doc.title).toBe("Hello");
  });
});
