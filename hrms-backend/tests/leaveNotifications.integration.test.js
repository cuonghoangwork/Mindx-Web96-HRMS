/**
 * leaveNotifications.integration.test.js — who is told a leave request arrived.
 *
 * The fan-out used to notify every MANAGER in the company, so a manager was
 * pinged about leave in departments they have no authority to approve. That is
 * the mirror image of the overtime bug fixed alongside it, where the
 * department's manager was the one person NOT told — and both come from the
 * same root cause: MANAGER is department-scoped, but a broadcast carries no
 * department, so anything a manager needs has to be written as addressed
 * documents with a deliberate recipient list.
 *
 * These are the first tests to cover the leave endpoints directly; the
 * existing coverage of this producer is the recipient-count assertion in
 * notificationProducers.characterization.test.js, which this does not repeat.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import supertest from "supertest";
import { startDb, stopDb, clearDb, createApp, seedUserAndLogin } from "./testHelpers.js";
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
    console.warn(`[leaveNotifications] MongoDB unavailable — skipping.\n${err.message}`);
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

/** Well clear of the same-day 9AM rule, and inside the annual allowance. */
const leaveBody = { startDate: "2027-05-03", endDate: "2027-05-04", type: "annual", reason: "trip" };

function applyForLeave(token) {
  return request.post("/api/v1/leave-requests").set(auth(token)).send(leaveBody);
}

async function notices() {
  const { default: NotificationModel } = await import("../model/Notification.js");
  return NotificationModel.find({ titleKey: "leaveRequestSubmitted" });
}

const recipientIds = async () => (await notices()).map((n) => String(n.user)).sort();

/** A MANAGER in a second department, to prove the notice is scoped. */
async function seedDesignManager() {
  const { default: EmployeeModel } = await import("../model/Employee.js");
  const employee = await EmployeeModel.create({
    employeeId: "EMP301",
    name: "Design Manager",
    email: "designmgr@t.test",
    department: org.departments.design._id,
    status: "active",
    contractType: "full-time",
    annualSalary: 60000,
  });
  const seeded = await seedUserAndLogin(app, {
    email: "designmgr@t.test",
    name: "Design Manager",
    role: "MANAGER",
    employee: employee._id,
  });
  await EmployeeModel.updateOne({ _id: employee._id }, { $set: { userId: seeded.user._id } });
  return seeded;
}

describe("POST /leave-requests — reviewer notifications", () => {
  it("notifies the HR tier and the requester's own department manager", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    expect((await applyForLeave(org.tokens.dev)).status).toBe(201);

    expect(await recipientIds()).toEqual(
      [org.users.admin.userId, org.users.hr.userId, org.users.manager.userId].map(String).sort(),
    );
  });

  it("does not notify a manager from another department", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const designManager = await seedDesignManager();

    await applyForLeave(org.tokens.dev);

    // The whole point of the fix. Before it, this manager received a request
    // from a department they cannot approve for.
    const recipients = await recipientIds();
    expect(recipients).toContain(String(org.users.manager.userId));
    expect(recipients).not.toContain(String(designManager.user._id));
  });

  it("still reaches HR and ADMIN when the department has no manager", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    // Design has no manager in the base fixture. Scoping must not mean the
    // request goes unreviewed — the unscoped tier is the safety net.
    expect((await applyForLeave(org.tokens.designer)).status).toBe(201);

    expect(await recipientIds()).toEqual(
      [org.users.admin.userId, org.users.hr.userId].map(String).sort(),
    );
  });

  it("does not notify a manager applying for their own leave", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    expect((await applyForLeave(org.tokens.manager)).status).toBe(201);

    // They already know. HR and ADMIN still review it.
    const recipients = await recipientIds();
    expect(recipients).not.toContain(String(org.users.manager.userId));
    expect(recipients).toEqual([org.users.admin.userId, org.users.hr.userId].map(String).sort());
  });

  it("does not notify an HR user applying for their own leave", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    expect((await applyForLeave(org.tokens.hr)).status).toBe(201);

    // Same rule applied to the unscoped tier: a reviewer should not be told
    // about a request they just filed themselves.
    const recipients = await recipientIds();
    expect(recipients).not.toContain(String(org.users.hr.userId));
    expect(recipients).toContain(String(org.users.admin.userId));
  });

  it("addresses every notice, so read state stays per-person", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    await applyForLeave(org.tokens.dev);

    // Deliberately not a notifyHR broadcast for the HR half, unlike overtime:
    // marking a broadcast read clears it from every reviewer's badge at once,
    // and a request each of them must act on should not vanish because a
    // colleague glanced at it.
    const docs = await notices();
    expect(docs).toHaveLength(3);
    expect(docs.every((n) => n.user !== null)).toBe(true);
    expect(docs.every((n) => n.read === false)).toBe(true);
  });

  it("sends the same copy to every reviewer", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    await applyForLeave(org.tokens.dev);

    const docs = await notices();
    expect(new Set(docs.map((n) => n.title)).size).toBe(1);
    expect(new Set(docs.map((n) => n.messageKey)).size).toBe(1);
    expect(docs[0].params.employeeName).toBe("Dev One");
    expect(docs[0].category).toBe("leave");
  });
});
