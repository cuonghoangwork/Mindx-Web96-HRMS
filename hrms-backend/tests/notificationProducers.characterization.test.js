/**
 * notificationProducers.characterization.test.js
 *
 * Pins the CURRENT shape of every notification producer, ahead of the
 * `emitNotification` spine in HRMS_REALTIME_NOTIFICATIONS_PLAN.md Level 0.
 *
 * These tests assert nothing about what the behaviour *should* be. They
 * record what it *is*, so that a refactor which routes ~30 call sites
 * through one function has to change a test on purpose rather than change
 * behaviour by accident. Where the current behaviour looks wrong, it is
 * pinned anyway and the oddity is called out in a comment — deciding it is
 * a separate change from moving it.
 *
 * Why this file exists at all: a notification that stops being written
 * looks exactly like one that was never triggered. There is no error, no
 * failed request, no log line. Nothing else in the suite would catch it.
 *
 * Deliberately NOT re-covered here (already asserted elsewhere):
 *   - the cycle-open broadcast and manager review notices — performanceReview.integration
 *   - the appeal notice                                   — performanceAppeal.integration
 *   - the reminder trio + its dedupe                      — performanceReminders.integration
 *   - the no-show flag notice                             — noShowReview.integration
 *   - runMonthlyPayroll's "Payroll paid" broadcast        — runMonthlyPayroll.integration
 *   - the overtime approval notice                        — overtime.integration
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
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
    console.warn(`[notificationProducers] MongoDB unavailable — skipping.\n${err.message}`);
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

async function notifications(filter = {}) {
  const { default: NotificationModel } = await import("../model/Notification.js");
  return NotificationModel.find(filter).sort({ createdAt: 1 });
}

/** The fields a fan-out refactor could plausibly change without failing anything else. */
const shapeOf = (n) => ({
  user: n.user ? String(n.user) : null,
  audience: n.audience,
  category: n.category,
  titleKey: n.titleKey,
  messageKey: n.messageKey,
  isCustom: n.isCustom,
  read: n.read,
});

const recipientIds = (docs) => docs.map((n) => String(n.user)).sort();

/* ══════════════════════════════════════════════════════════════════
   1. notifyHR() — the shared contract behind 18 of the ~30 call sites.
      Whatever emitNotification does, notifyHR has to keep doing this.
   ══════════════════════════════════════════════════════════════════ */
describe("notifyHR()", () => {
  it("writes one unaddressed 'hr' broadcast, not a per-user fan-out", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { notifyHR } = await import("../controller/notificationController.js");

    await notifyHR({ title: "T", message: "M" });

    const docs = await notifications();
    expect(docs).toHaveLength(1);
    expect(shapeOf(docs[0])).toEqual({
      user: null,
      audience: "hr",
      // Defaults to "employee" when the caller omits it — 8 call sites rely
      // on this rather than passing a category.
      category: "employee",
      titleKey: null,
      messageKey: null,
      isCustom: false,
      read: false,
    });
  });

  it("normalises every omitted optional field to null, never undefined", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { notifyHR } = await import("../controller/notificationController.js");

    await notifyHR({ title: "T" });

    const [doc] = await notifications();
    // Stored as explicit nulls so the frontend "has titleKey?" check is a
    // plain falsy test on both old and new rows.
    expect(doc.link).toBeNull();
    expect(doc.linkLabel).toBeNull();
    expect(doc.titleKey).toBeNull();
    expect(doc.messageKey).toBeNull();
    expect(doc.params).toBeNull();
  });

  it("carries the i18n triple through untouched when given", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { notifyHR } = await import("../controller/notificationController.js");

    await notifyHR({
      title: "New employee added",
      message: "literal English fallback",
      titleKey: "employeeAdded",
      messageKey: "employeeAddedWithAccount",
      params: { employeeName: "Dev One", employeeId: "EMP102", accountRole: "EMPLOYEE" },
      link: "/employees/1",
      linkLabel: "View profile",
    });

    const [doc] = await notifications();
    // Dropping any of these three does not fail a request or log anything —
    // the notification just silently renders its English literal forever.
    expect(doc.titleKey).toBe("employeeAdded");
    expect(doc.messageKey).toBe("employeeAddedWithAccount");
    expect(doc.params).toEqual({
      employeeName: "Dev One",
      employeeId: "EMP102",
      accountRole: "EMPLOYEE",
    });
    expect(doc.title).toBe("New employee added");
    expect(doc.message).toBe("literal English fallback");
  });

  it("swallows a write failure instead of throwing — callers do not await it", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { notifyHR } = await import("../controller/notificationController.js");

    // `title` is required by the schema, so this write cannot succeed.
    // Several call sites (authController, departmentController, the jobs)
    // invoke notifyHR without awaiting; if it rejected, that would surface
    // as an unhandled rejection and, in the jobs, kill the cron run.
    await expect(notifyHR({ message: "no title" })).resolves.toBeUndefined();
    expect(await notifications()).toHaveLength(0);
  });

  it("swallows an invalid category the same way", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { notifyHR } = await import("../controller/notificationController.js");

    await expect(
      notifyHR({ title: "T", category: "not-a-real-category" }),
    ).resolves.toBeUndefined();
    expect(await notifications()).toHaveLength(0);
  });
});

/* ══════════════════════════════════════════════════════════════════
   2. Targeted fan-outs — three producers, three DIFFERENT recipient
      rules. This is the group most at risk from a spine that
      centralises recipient resolution: flattening them to one rule
      would not fail anything else in the suite.
   ══════════════════════════════════════════════════════════════════ */
describe("targeted fan-out recipient sets", () => {
  it("a new leave request notifies MANAGER + HR + ADMIN individually", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await request
      .post("/api/v1/leave-requests")
      .set(auth(org.tokens.dev))
      .send({ startDate: "2027-03-01", endDate: "2027-03-02", type: "annual", reason: "trip" });
    expect(res.status).toBe(201);

    const docs = await notifications({ category: "leave" });
    // Three separate documents, not one broadcast — this is how a
    // department-scoped MANAGER is reachable at all (a broadcast carries
    // no department; see AUDIENCES_BY_ROLE in model/Notification.js).
    expect(docs).toHaveLength(3);
    expect(recipientIds(docs)).toEqual(
      [org.users.admin.userId, org.users.manager.userId, org.users.hr.userId]
        .map(String)
        .sort(),
    );
    expect(docs.every((n) => n.user !== null)).toBe(true);
    expect(docs[0].titleKey).toBe("leaveRequestSubmitted");
    expect(docs[0].params.employeeName).toBe("Dev One");

    // Neither employee is notified — not the requester, not their peer.
    expect(recipientIds(docs)).not.toContain(String(org.users.dev.userId));
    expect(recipientIds(docs)).not.toContain(String(org.users.designer.userId));
  });

  it("a profile edit request notifies the same MANAGER + HR + ADMIN set", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await request
      .post("/api/v1/profile-edit-requests")
      .set(auth(org.tokens.dev))
      .send({ changes: { phone: "0900000001" } });
    expect(res.status).toBe(201);

    const docs = await notifications({ titleKey: "profileEditRequestSubmitted" });
    expect(docs).toHaveLength(3);
    expect(recipientIds(docs)).toEqual(
      [org.users.admin.userId, org.users.manager.userId, org.users.hr.userId]
        .map(String)
        .sort(),
    );
    expect(docs[0].category).toBe("employee");
  });

  it("a promotion proposal notifies ADMIN ONLY — not HR, not the proposing manager", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await request
      .post("/api/v1/promotion-requests")
      .set(auth(org.tokens.manager))
      .send({ employeeId: String(org.employees.dev._id), designation: "Senior Engineer" });
    expect(res.status).toBe(201);

    const docs = await notifications({ titleKey: "promotionProposalAwaitingReview" });
    // The narrowest recipient rule of the three, and the one a "notify the
    // HR tier" generalisation would silently widen. Only ADMIN may review a
    // promotion (router/promotionRequestRouter.js), so only ADMIN is told.
    expect(docs).toHaveLength(1);
    expect(String(docs[0].user)).toBe(String(org.users.admin.userId));
  });
});

/* ══════════════════════════════════════════════════════════════════
   3. Broadcast producers — the audience value each one writes.
   ══════════════════════════════════════════════════════════════════ */
describe("broadcast audiences", () => {
  it("marking a period paid by hand broadcasts to 'employees', excluding HR/Admin", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { default: PayrollPeriodModel } = await import("../model/PayrollPeriod.js");

    // Created already-approved: draft -> paid is refused, and the payslip
    // count is only checked on the draft -> approved hop.
    const period = await PayrollPeriodModel.create({
      year: 2027,
      month: 3,
      fxRate: 25000,
      standardWorkingDays: 22,
      status: "approved",
    });

    const res = await request
      .patch(`/api/v1/payroll/periods/${period._id}/status`)
      .set(auth(org.tokens.admin))
      .send({ status: "paid" });
    expect(res.status).toBe(200);

    const docs = await notifications({ category: "payroll" });
    expect(docs).toHaveLength(1);
    expect(docs[0].audience).toBe("employees");
    expect(docs[0].titleKey).toBe("payrollPaid");

    // KNOWN DIVERGENCE, pinned deliberately: jobs/runMonthlyPayroll.js
    // writes the identical notice (same title, same titleKey) with
    // audience "all". So whether HR and Admin see "Payroll paid" depends on
    // whether a human or the cron marked it paid. Recorded here rather than
    // fixed — that is a behaviour decision, not part of moving the call site.
    expect(docs[0].audience).not.toBe("all");
  });
});

/* ══════════════════════════════════════════════════════════════════
   4. HR compose — the only producer that sets isCustom/sender, and the
      only one whose targeting is chosen per-request by the caller.
   ══════════════════════════════════════════════════════════════════ */
describe("HR compose (POST /notifications)", () => {
  it("stamps isCustom and the sender on a broadcast", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await request
      .post("/api/v1/notifications")
      .set(auth(org.tokens.admin))
      .send({ title: "Office closed", message: "Friday", audience: "employees" });
    expect(res.status).toBe(201);

    const [doc] = await notifications();
    expect(doc.user).toBeNull();
    expect(doc.audience).toBe("employees");
    expect(doc.isCustom).toBe(true);
    expect(String(doc.sender.id)).toBe(String(org.users.admin.userId));

    // KNOWN BUG, pinned rather than fixed: sender.name is always null.
    // The JWT payload is { id, email, role, mustChangePassword } — there is
    // no `name` on it (controller/authController.js), so `req.user.name` is
    // undefined at every call site. The consequence is invisible: the
    // "· from <name>" attribution in pages/Notifications.jsx is guarded by
    // `notification.senderName &&`, so it simply never renders and no error
    // is ever raised. utils/notifyActor.js already works around this same
    // gap for the department/employee notices; the compose path does not.
    // Change this assertion when the JWT gains a name, not before.
    expect(doc.sender.name).toBeNull();
    // Hand-written copy has no translation keys — it renders as typed.
    expect(doc.titleKey).toBeNull();
    expect(doc.category).toBe("announcement");
  });

  it("resolves Employee ids to their linked User ids, one document each", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await request
      .post("/api/v1/notifications")
      .set(auth(org.tokens.admin))
      .send({
        title: "Please submit your review",
        recipientIds: [String(org.employees.dev._id), String(org.employees.designer._id)],
      });
    expect(res.status).toBe(201);
    expect(res.body.count).toBe(2);

    const docs = await notifications();
    expect(docs).toHaveLength(2);
    // The picker sends EMPLOYEE ids; the stored `user` must be the USER id.
    // Getting this wrong addresses the notice to nobody and shows up only
    // as "the employee says they never got it".
    expect(recipientIds(docs)).toEqual(
      [org.users.dev.userId, org.users.designer.userId].map(String).sort(),
    );
    expect(docs.every((n) => n.isCustom === true)).toBe(true);
    expect(docs.every((n) => n.audience === "all")).toBe(true);
  });
});

/* ══════════════════════════════════════════════════════════════════
   5. reviewQueue.js — one factory, shared by the leave / profile-edit /
      promotion review endpoints. Its notify block is a single call site
      covering all three.
   ══════════════════════════════════════════════════════════════════ */
describe("reviewQueue review outcome", () => {
  it("notifies the requesting employee's linked User, addressed not broadcast", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const created = await request
      .post("/api/v1/leave-requests")
      .set(auth(org.tokens.dev))
      .send({ startDate: "2027-04-01", endDate: "2027-04-02", type: "annual" });
    expect(created.status).toBe(201);

    const { default: NotificationModel } = await import("../model/Notification.js");
    await NotificationModel.deleteMany({});

    const reviewed = await request
      .patch(`/api/v1/leave-requests/${created.body.data.id}/review`)
      .set(auth(org.tokens.admin))
      .send({ decision: "approved" });
    expect(reviewed.status).toBe(200);

    const docs = await notifications();
    expect(docs).toHaveLength(1);
    expect(String(docs[0].user)).toBe(String(org.users.dev.userId));
    expect(docs[0].audience).toBe("all"); // schema default, ignored when `user` is set
    expect(docs[0].isCustom).toBe(false);
    expect(docs[0].read).toBe(false);
  });
});
