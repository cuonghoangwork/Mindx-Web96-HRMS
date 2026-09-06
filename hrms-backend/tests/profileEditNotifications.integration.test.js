/**
 * profileEditNotifications.integration.test.js — who is told a profile edit
 * request arrived.
 *
 * The last of the three producers that fanned out to every MANAGER in the
 * company. All three shared one root cause: MANAGER is department-scoped, a
 * broadcast carries no department, so each call site hand-rolled its own
 * addressed recipient list and they drifted apart. Overtime under-notified
 * (the approver was the one person left out), leave and this one
 * over-notified.
 *
 * Mirrors tests/leaveNotifications.integration.test.js deliberately — the two
 * producers now share a recipient rule, and the tests should make that
 * obvious rather than each expressing it differently.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import supertest from "supertest";
import { startDb, stopDb, clearDb, createApp } from "./testHelpers.js";
import { auth, seedPerformanceOrg, seedDepartmentManager } from "./performanceFixtures.js";

let dbAvailable = false;
let app;
let request;
let org;

beforeAll(async () => {
  try {
    await startDb();
    dbAvailable = true;
  } catch (err) {
    console.warn(`[profileEditNotifications] MongoDB unavailable — skipping.\n${err.message}`);
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
  org = await seedPerformanceOrg(app);
});

/** `phone` is in EDITABLE_FIELDS and empty on the fixtures, so it is a real diff. */
function submitEdit(token, phone = "0900000001") {
  return request
    .post("/api/v1/profile-edit-requests")
    .set(auth(token))
    .send({ changes: { phone } });
}

async function notices() {
  const { default: NotificationModel } = await import("../model/Notification.js");
  return NotificationModel.find({ titleKey: "profileEditRequestSubmitted" });
}

const recipientIds = async () => (await notices()).map((n) => String(n.user)).sort();

describe("POST /profile-edit-requests — reviewer notifications", () => {
  it("notifies the HR tier and the requester's own department manager", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    expect((await submitEdit(org.tokens.dev)).status).toBe(201);

    expect(await recipientIds()).toEqual(
      [org.users.admin.userId, org.users.hr.userId, org.users.manager.userId].map(String).sort(),
    );
  });

  it("does not notify a manager from another department", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const designManager = await seedDepartmentManager(app, org.departments.design);

    await submitEdit(org.tokens.dev);

    // The fix. Before it, a Design manager was asked to review an Engineering
    // employee's profile change they have no authority over.
    const recipients = await recipientIds();
    expect(recipients).toContain(String(org.users.manager.userId));
    expect(recipients).not.toContain(String(designManager.user._id));
  });

  it("still reaches HR and ADMIN when the department has no manager", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    // Design has no manager in the base fixture. Scoping must not leave a
    // request unreviewed — the unscoped tier is the safety net.
    expect((await submitEdit(org.tokens.designer)).status).toBe(201);

    expect(await recipientIds()).toEqual(
      [org.users.admin.userId, org.users.hr.userId].map(String).sort(),
    );
  });

  it("does not notify a manager editing their own profile", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    expect((await submitEdit(org.tokens.manager)).status).toBe(201);

    const recipients = await recipientIds();
    expect(recipients).not.toContain(String(org.users.manager.userId));
    expect(recipients).toEqual([org.users.admin.userId, org.users.hr.userId].map(String).sort());
  });

  it("does not notify an HR user editing their own profile", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    expect((await submitEdit(org.tokens.hr)).status).toBe(201);

    const recipients = await recipientIds();
    expect(recipients).not.toContain(String(org.users.hr.userId));
    expect(recipients).toContain(String(org.users.admin.userId));
  });

  it("addresses every notice, so read state stays per-person", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    await submitEdit(org.tokens.dev);

    const docs = await notices();
    expect(docs).toHaveLength(3);
    expect(docs.every((n) => n.user !== null)).toBe(true);
    expect(docs.every((n) => n.read === false)).toBe(true);
  });

  it("sends the same copy to every reviewer", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    await submitEdit(org.tokens.dev);

    const docs = await notices();
    expect(new Set(docs.map((n) => n.title)).size).toBe(1);
    expect(docs[0].params.employeeName).toBe("Dev One");
    expect(docs[0].category).toBe("employee");
    expect(docs[0].link).toBe("/employees?tab=editRequests");
  });
});
