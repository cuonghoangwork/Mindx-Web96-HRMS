/**
 * startupMigrations.integration.test.js — the audit-actor-name backfill, and
 * the marker scheme that lets it ship alongside the migrations already there.
 *
 * Context: until 2026-09-07 signTokens() never put `name` in the JWT, so
 * req.user.name was undefined and utils/auditLog.js wrote every row with an
 * actor id and role but no name. Nothing failed — a missing name renders as
 * "—" in the Settings audit table and just drops the " by <name>" suffix in
 * auditLogController's dashboard feed — which is exactly why it went unnoticed
 * for the life of the project. The id was always recorded, so the name is
 * recoverable by joining back to User.
 *
 * The subtle half is NOT the query, it is the marker. runStartupMigrations()
 * used to guard every migration behind one key, so adding work meant bumping
 * that key — which would re-run the MANAGER -> HR demotion whose own comment
 * says re-running it would overwrite a live admin decision. The last test in
 * the second block is the one that pins that apart.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { startDb, stopDb, clearDb } from "./testHelpers.js";

let dbAvailable = false;
let UserModel;
let AuditLogModel;
let backfillAuditActorNames;
let runStartupMigrations;

beforeAll(async () => {
  try {
    await startDb();
    dbAvailable = true;
  } catch (err) {
    console.warn(`[startupMigrations] MongoDB unavailable — skipping.\n${err.message}`);
    return;
  }
  ({ default: UserModel } = await import("../model/User.js"));
  ({ default: AuditLogModel } = await import("../model/AuditLog.js"));
  ({ backfillAuditActorNames, runStartupMigrations } = await import("../utils/startupMigrations.js"));
});

afterAll(async () => {
  await stopDb();
});

beforeEach(async () => {
  if (!dbAvailable) return;
  await clearDb();
  // clearDb() iterates mongoose.connection.collections, which only holds
  // collections Mongoose has a MODEL for. `_migrations` is touched through the
  // raw driver, so it survives — and a marker left by the previous test makes
  // the next runStartupMigrations() a silent no-op. Found the hard way: the
  // "earlier migrations already applied" test below failed because the test
  // before it had already stamped the backfill as done.
  await mongoose.connection.db.collection("_migrations").deleteMany({});
});

const seedUser = (name, role = "HR") =>
  UserModel.create({
    email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
    password: "hashed-not-used-here",
    name,
    role,
  });

/**
 * Writes an audit row the way pre-fix auditLog.js did — through the driver,
 * not the model, because `actor.name` has to be genuinely ABSENT rather than
 * set to undefined (Mongoose strips undefined on the way out, but a document
 * that has never had the key is what production actually holds).
 */
const seedLegacyRow = (actorId, extra = {}) =>
  mongoose.connection.collection("auditlogs").insertOne({
    actor: { id: actorId, role: "HR" },
    action: "created",
    resource: "department",
    label: "Engineering",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...extra,
  });

const rowsFor = (actorId) => AuditLogModel.find({ "actor.id": actorId }).lean();

describe("backfillAuditActorNames", () => {
  it("fills a missing actor name from the recorded actor id", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const user = await seedUser("Grace Hopper");
    await seedLegacyRow(user._id);
    await seedLegacyRow(user._id);

    expect(await backfillAuditActorNames()).toEqual({ actors: 1, resolved: 1, updated: 2 });

    const rows = await rowsFor(user._id);
    expect(rows.map((r) => r.actor.name)).toEqual(["Grace Hopper", "Grace Hopper"]);
  });

  it("does not touch the request-less rows stamped 'system'", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    // auditLog.js writes { id: null, name: "system", role: "system" } when
    // there is no req.user — a scheduled job, or startupMigrations itself.
    await seedLegacyRow(null, { actor: { id: null, name: "system", role: "system" } });

    expect(await backfillAuditActorNames()).toEqual({ actors: 0, resolved: 0, updated: 0 });

    const [row] = await AuditLogModel.find({}).lean();
    expect(row.actor.name).toBe("system");
  });

  it("ignores an actorless row entirely, rather than counting a phantom actor", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    // A row with a null id AND no name — the shape auditLog.js's "system"
    // branch would produce if the literal name were ever dropped. Without the
    // `actor.id: { $ne: null }` half of the filter, distinct() returns [null],
    // which no User can match: the counts would report an actor that could
    // never be resolved, making a clean run look permanently incomplete.
    await seedLegacyRow(null, { actor: { id: null, role: "system" } });

    expect(await backfillAuditActorNames()).toEqual({ actors: 0, resolved: 0, updated: 0 });
  });

  it("does not overwrite a name that was already recorded", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const user = await seedUser("Grace Hopper");
    // actor.name is a SNAPSHOT of who acted at the time. This row was written
    // before the rename; joining User.name over it would rewrite history.
    await seedLegacyRow(user._id, { actor: { id: user._id, name: "Grace Murray", role: "HR" } });

    expect(await backfillAuditActorNames()).toEqual({ actors: 0, resolved: 0, updated: 0 });

    const [row] = await rowsFor(user._id);
    expect(row.actor.name).toBe("Grace Murray");
  });

  it("leaves rows blank when the actor's account no longer exists", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const kept = await seedUser("Grace Hopper");
    const deletedUserId = new mongoose.Types.ObjectId();
    await seedLegacyRow(kept._id);
    await seedLegacyRow(deletedUserId);

    // Reported, not thrown: the name was never recorded and the only thing
    // that could recover it is gone. One unresolvable actor must not stop the
    // resolvable one from being fixed.
    expect(await backfillAuditActorNames()).toEqual({ actors: 2, resolved: 1, updated: 1 });

    expect((await rowsFor(kept._id))[0].actor.name).toBe("Grace Hopper");
    expect((await rowsFor(deletedUserId))[0].actor.name).toBeUndefined();
  });

  it("is a no-op on a second pass", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const user = await seedUser("Grace Hopper");
    await seedLegacyRow(user._id);

    await backfillAuditActorNames();
    // The filter, not the marker, is what makes this safe — so it holds even
    // when the migration is re-run directly via scripts/backfillAuditActorNames.js.
    expect(await backfillAuditActorNames()).toEqual({ actors: 0, resolved: 0, updated: 0 });
  });

  it("also matches rows whose name was written as null or empty", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const user = await seedUser("Grace Hopper");
    await seedLegacyRow(user._id, { actor: { id: user._id, name: null, role: "HR" } });
    await seedLegacyRow(user._id, { actor: { id: user._id, name: "", role: "HR" } });

    expect((await backfillAuditActorNames()).updated).toBe(2);
    expect((await rowsFor(user._id)).map((r) => r.actor.name)).toEqual([
      "Grace Hopper",
      "Grace Hopper",
    ]);
  });
});

describe("runStartupMigrations — per-migration markers", () => {
  const markers = () => mongoose.connection.db.collection("_migrations");

  it("applies the backfill on a fresh database", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const user = await seedUser("Grace Hopper");
    await seedLegacyRow(user._id);

    await runStartupMigrations();

    expect((await rowsFor(user._id))[0].actor.name).toBe("Grace Hopper");
    expect(await markers().findOne({ key: "2026-audit-actor-name-backfill-v1" })).toBeTruthy();
  });

  it("runs the backfill on a database where the earlier migrations already applied, without re-running them", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    // The regression this whole marker scheme exists to prevent. Every
    // deployed instance already has the v1 marker, so the backfill has to run
    // under a key of its own — and bumping v1 to v2 instead would drag the
    // MANAGER -> HR demotion along with it and demote this pending account.
    await markers().insertOne({ key: "2026-startup-migrations-v1", appliedAt: new Date() });
    const pendingManager = await seedUser("Ada Lovelace", "MANAGER");
    const user = await seedUser("Grace Hopper");
    await seedLegacyRow(user._id);

    await runStartupMigrations();

    expect((await rowsFor(user._id))[0].actor.name).toBe("Grace Hopper");
    expect((await UserModel.findById(pendingManager._id)).role).toBe("MANAGER");
  });

  it("records the MANAGER -> HR demotion it performs", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    // A MANAGER with no linked Employee (and no Employee matching their email)
    // resolves to no department, which is the condition the fixup demotes on.
    const stale = await seedUser("Ada Lovelace", "MANAGER");

    await runStartupMigrations();

    expect((await UserModel.findById(stale._id)).role).toBe("HR");

    // The demotion always worked; the RECORD of it never did. logAction was
    // called with `null`, which threw on `req.user`, and "role_migrated" was
    // not in the AuditLog action enum — two independent failures, both
    // swallowed by logAction's catch, so an admin whose role silently changed
    // had no audit row explaining why.
    const row = await AuditLogModel.findOne({ action: "role_migrated" }).lean();
    expect(row).toBeTruthy();
    expect(row.resource).toBe("user");
    expect(row.label).toContain("MANAGER -> HR");
    expect(row.actor).toMatchObject({ id: null, name: "system", role: "system" });
  });

  it("skips the backfill once its own marker is set", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    await markers().insertOne({ key: "2026-audit-actor-name-backfill-v1", appliedAt: new Date() });
    const user = await seedUser("Grace Hopper");
    await seedLegacyRow(user._id);

    await runStartupMigrations();

    // A marked-as-done migration must not rescan the collection on every boot.
    expect((await rowsFor(user._id))[0].actor.name).toBeUndefined();
  });
});
