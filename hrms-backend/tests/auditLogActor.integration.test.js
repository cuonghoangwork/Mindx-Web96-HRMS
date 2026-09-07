/**
 * auditLogActor.integration.test.js — logAction()'s actor resolution and its
 * never-throw contract.
 *
 * auditLog.test.js covers diffChanges(); this covers the half that touches the
 * database. The gap mattered: logAction's "system" fallback exists precisely
 * for writes with no request behind them, and passing the most natural way to
 * express that — `null` — threw a TypeError on `req.user` before the ternary
 * could reach the fallback. utils/startupMigrations.js was the only caller
 * doing so, and every one of its MANAGER -> HR audit rows was lost. Nothing
 * ever surfaced, because logAction swallows its own failures by design.
 *
 * The other five req-less callers (jobs/*.js, seed.js) pass `{}` instead,
 * which is why the bug stayed confined to one call site. Both spellings are
 * tested here so neither convention can regress.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { startDb, stopDb, clearDb } from "./testHelpers.js";

let dbAvailable = false;
let AuditLogModel;
let logAction;

beforeAll(async () => {
  try {
    await startDb();
    dbAvailable = true;
  } catch (err) {
    console.warn(`[auditLogActor] MongoDB unavailable — skipping.\n${err.message}`);
    return;
  }
  ({ default: AuditLogModel } = await import("../model/AuditLog.js"));
  ({ logAction } = await import("../utils/auditLog.js"));
});

afterAll(async () => {
  await stopDb();
});

beforeEach(async () => {
  if (!dbAvailable) return;
  await clearDb();
});

const entry = (over = {}) => ({
  action: "created",
  resource: "department",
  label: "Engineering",
  ...over,
});

const onlyRow = () => AuditLogModel.findOne({}).lean();

describe("logAction — actor resolution", () => {
  it("records the acting user from req.user", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const id = new mongoose.Types.ObjectId();

    await logAction({ user: { id, name: "Grace Hopper", role: "HR" } }, entry());

    const row = await onlyRow();
    expect(row.actor.name).toBe("Grace Hopper");
    expect(row.actor.role).toBe("HR");
    expect(String(row.actor.id)).toBe(String(id));
  });

  it("falls back to the system actor when req is {} — the jobs/seed convention", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    await logAction({}, entry());

    expect((await onlyRow()).actor).toMatchObject({ id: null, name: "system", role: "system" });
  });

  it("falls back to the system actor when req is null — the migrations convention", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    // The regression. `null.user` threw, the catch swallowed it, and no row
    // was written at all — so this used to fail on the row simply not existing.
    await logAction(null, entry());

    expect((await onlyRow()).actor).toMatchObject({ id: null, name: "system", role: "system" });
  });

  it("falls back to the system actor for an unauthenticated request", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    await logAction({ headers: {} }, entry());

    expect((await onlyRow()).actor.name).toBe("system");
  });
});

describe("logAction — never-throw contract", () => {
  it("swallows a rejected write instead of breaking the caller's request", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const stderr = vi.spyOn(console, "error").mockImplementation(() => {});

    // `resource` is enum-constrained, so this fails validation. The caller has
    // already committed its real DB write by the time logAction runs; an audit
    // failure must not turn a successful request into a 500.
    await expect(logAction({}, entry({ resource: "not_a_resource" }))).resolves.toBeUndefined();

    expect(await AuditLogModel.countDocuments()).toBe(0);
    // Swallowed, but not silent — stderr is the only trace these leave, which
    // is how the role_migrated bug was eventually spotted.
    expect(stderr).toHaveBeenCalledWith(
      "[AuditLog] Failed to write audit entry:",
      expect.stringContaining("not_a_resource"),
    );
    stderr.mockRestore();
  });
});

describe("AuditLog action enum", () => {
  it("accepts role_migrated", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const stderr = vi.spyOn(console, "error").mockImplementation(() => {});

    // Missing from the enum until 2026-09-07. Paired with the null-req fix
    // above, since BOTH had to be wrong for startupMigrations' row to vanish —
    // fixing either one alone still leaves it unwritten.
    await logAction(null, entry({ action: "role_migrated", resource: "user" }));

    expect((await onlyRow()).action).toBe("role_migrated");
    expect(stderr).not.toHaveBeenCalled();
    stderr.mockRestore();
  });
});
