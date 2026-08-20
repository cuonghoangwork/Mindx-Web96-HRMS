import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import supertest from "supertest";
import { startDb, stopDb, clearDb, createApp } from "./testHelpers.js";
import { auth, closedCycleKey, currentCycleKey, seedPerformanceOrg } from "./performanceFixtures.js";

let dbAvailable = false;
let app;
let request;
let org;
let cycleKey;
let closedKey;

const DAY_MS = 86400000;

beforeAll(async () => {
  try {
    await startDb();
    dbAvailable = true;
  } catch (err) {
    console.warn(`[performanceAppeal.integration] MongoDB unavailable — skipping.\n${err.message}`);
    return;
  }
  app = await createApp();
  request = supertest(app);
  cycleKey = await currentCycleKey();
  closedKey = await closedCycleKey();
});

afterAll(async () => {
  await stopDb();
});

beforeEach(async () => {
  if (!dbAvailable) return;
  await clearDb();
  org = await seedPerformanceOrg(app);
});

const reviewUrl = (employee, key = cycleKey) =>
  `/api/v1/performance/reviews/${key}/${employee._id}`;

async function submitManagerReview(rating = 4) {
  return request
    .patch(`${reviewUrl(org.employees.dev)}/manager`)
    .set(auth(org.tokens.manager))
    .send({ managerRating: rating, managerComments: "Good half." });
}

async function backdateManagerReview(days) {
  const { default: PerformanceReviewModel } = await import("../model/PerformanceReview.js");
  await PerformanceReviewModel.collection.updateOne(
    { employee: org.employees.dev._id },
    { $set: { managerSubmittedDate: new Date(Date.now() - days * DAY_MS) } },
  );
}

async function fileAppeal(token = org.tokens.dev, body = {}) {
  return request
    .post(`${reviewUrl(org.employees.dev)}/appeal`)
    .set(auth(token))
    .send({ reasonCategory: "rating_low", detail: "The rating misses Q2 delivery.", ...body });
}

describe("POST /performance/reviews/:cycleKey/:employeeId/appeal", () => {
  it("refuses an appeal before any manager review exists", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await fileAppeal();

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("manager review has been submitted");
  });

  it("files an appeal and stamps the server-owned fields", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { default: PerformanceReviewModel } = await import("../model/PerformanceReview.js");

    await submitManagerReview();
    const res = await fileAppeal(org.tokens.dev, { filedDate: "1999-01-01", status: "Resolved" });

    expect(res.status).toBe(201);
    expect(res.body.data.appeal.status).toBe("Pending");
    expect(res.body.data.appeal.reasonCategory).toBe("rating_low");
    expect(res.body.data.appeal.detail).toBe("The rating misses Q2 delivery.");
    expect(res.body.data.appeal.resolution).toBe(null);
    expect(new Date(res.body.data.appeal.filedDate).getFullYear()).toBeGreaterThan(2000);

    const stored = await PerformanceReviewModel.findOne({ employee: org.employees.dev._id });
    expect(String(stored.appeal.filedBy)).toBe(String(org.users.dev.user._id));
  });

  it("rejects a second appeal with 409", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    await submitManagerReview();
    await fileAppeal();
    const second = await fileAppeal();

    expect(second.status).toBe(409);
    expect(second.body.message).toContain("already been filed");
  });

  it("refuses anyone but the subject", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    await submitManagerReview();

    for (const token of [org.tokens.manager, org.tokens.hr, org.tokens.admin, org.tokens.designer]) {
      expect((await fileAppeal(token)).status).toBe(403);
    }
  });

  it("allows the appeal on exactly day 14 and refuses it on day 15", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    await submitManagerReview();
    await backdateManagerReview(14);
    expect((await fileAppeal()).status).toBe(201);

    await clearDb();
    org = await seedPerformanceOrg(app);
    await submitManagerReview();
    await backdateManagerReview(15);
    const late = await fileAppeal();

    expect(late.status).toBe(400);
    expect(late.body.message).toContain("14 days");
  });

  it("still accepts an appeal after the cycle has closed", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { default: PerformanceCycleModel } = await import("../model/PerformanceCycle.js");

    await submitManagerReview();
    await PerformanceCycleModel.updateOne(
      { key: cycleKey },
      { $set: { status: "Closed", statusOverriddenAt: new Date() } },
    );

    expect((await fileAppeal()).status).toBe(201);
  });

  it("400s a missing reason category or detail", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    await submitManagerReview();

    const noCategory = await request
      .post(`${reviewUrl(org.employees.dev)}/appeal`)
      .set(auth(org.tokens.dev))
      .send({ detail: "Something" });
    expect(noCategory.status).toBe(400);

    const noDetail = await request
      .post(`${reviewUrl(org.employees.dev)}/appeal`)
      .set(auth(org.tokens.dev))
      .send({ reasonCategory: "process" });
    expect(noDetail.status).toBe(400);
  });

  it("notifies HR and writes an audit row", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { default: NotificationModel } = await import("../model/Notification.js");
    const { default: AuditLogModel } = await import("../model/AuditLog.js");

    await submitManagerReview();
    await NotificationModel.deleteMany({});
    await fileAppeal();

    const notices = await NotificationModel.find({ category: "performance" });
    expect(notices).toHaveLength(1);
    expect(notices[0].audience).toBe("hr");
    expect(notices[0].user).toBe(null);
    expect(notices[0].link).toBe("/performance");

    const entry = await AuditLogModel.findOne({ resource: "performance", action: "created" });
    expect(entry.label).toBe(`Appeal — Dev One (${cycleKey})`);
  });

  it("surfaces the appeal on the roster row and in permissions", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    await submitManagerReview();

    const before = await request.get(reviewUrl(org.employees.dev)).set(auth(org.tokens.dev));
    expect(before.body.permissions.canFileAppeal).toBe(true);

    await fileAppeal();

    const after = await request.get(reviewUrl(org.employees.dev)).set(auth(org.tokens.dev));
    expect(after.body.permissions.canFileAppeal).toBe(false);

    const roster = await request
      .get(`/api/v1/performance/cycles/${cycleKey}/roster`)
      .set(auth(org.tokens.admin));
    const row = roster.body.items.find((item) => item.employeeCode === "EMP102");
    expect(row.hasAppeal).toBe(true);
    expect(row.appealStatus).toBe("Pending");
  });
});

describe("PATCH /performance/reviews/:cycleKey/:employeeId/appeal", () => {
  async function setupPendingAppeal(rating = 4) {
    await submitManagerReview(rating);
    await fileAppeal();
  }

  it("upholds without touching the manager rating", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    await setupPendingAppeal(4);

    const res = await request
      .patch(`${reviewUrl(org.employees.dev)}/appeal`)
      .set(auth(org.tokens.hr))
      .send({ resolution: "Upheld", resolverNote: "Rating stands after review." });

    expect(res.status).toBe(200);
    expect(res.body.data.managerRating).toBe(4);
    expect(res.body.data.appeal.status).toBe("Resolved");
    expect(res.body.data.appeal.resolution).toBe("Upheld");
    expect(res.body.data.appeal.resolvedRating).toBe(null);
    expect(res.body.data.appeal.resolvedDate).toBeTruthy();
  });

  it("adjusts and overwrites the manager rating", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    await setupPendingAppeal(2);

    const res = await request
      .patch(`${reviewUrl(org.employees.dev)}/appeal`)
      .set(auth(org.tokens.admin))
      .send({ resolution: "Adjusted", resolvedRating: 4, resolverNote: "Raised after evidence." });

    expect(res.status).toBe(200);
    expect(res.body.data.managerRating).toBe(4);
    expect(res.body.data.appeal.resolvedRating).toBe(4);
    expect(res.body.data.appeal.status).toBe("Resolved");
  });

  it("records the rating change in the audit log", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { default: AuditLogModel } = await import("../model/AuditLog.js");

    await setupPendingAppeal(2);
    await request
      .patch(`${reviewUrl(org.employees.dev)}/appeal`)
      .set(auth(org.tokens.hr))
      .send({ resolution: "Adjusted", resolvedRating: 5, resolverNote: "Raised." });

    const entry = await AuditLogModel.findOne({
      resource: "performance",
      action: "status_changed",
    });
    expect(entry.label).toBe(`Appeal Adjusted — Dev One (${cycleKey})`);
    expect(entry.changes.managerRating).toEqual({ from: 2, to: 5 });
  });

  it("refuses a second resolution with 409", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    await setupPendingAppeal();
    const body = { resolution: "Upheld", resolverNote: "Stands." };

    expect(
      (await request.patch(`${reviewUrl(org.employees.dev)}/appeal`).set(auth(org.tokens.hr)).send(body)).status,
    ).toBe(200);

    const second = await request
      .patch(`${reviewUrl(org.employees.dev)}/appeal`)
      .set(auth(org.tokens.hr))
      .send(body);

    expect(second.status).toBe(409);
    expect(second.body.message).toContain("already been resolved");
  });

  it("404s when no appeal has been filed", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    await submitManagerReview();

    const res = await request
      .patch(`${reviewUrl(org.employees.dev)}/appeal`)
      .set(auth(org.tokens.hr))
      .send({ resolution: "Upheld", resolverNote: "Nothing to resolve." });

    expect(res.status).toBe(404);
  });

  it("refuses the manager and the employee at the router gate", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    await setupPendingAppeal();
    const body = { resolution: "Upheld", resolverNote: "Stands." };

    for (const token of [org.tokens.manager, org.tokens.dev, org.tokens.designer]) {
      const res = await request
        .patch(`${reviewUrl(org.employees.dev)}/appeal`)
        .set(auth(token))
        .send(body);
      expect(res.status).toBe(403);
    }
  });

  it("400s Adjusted without a rating", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    await setupPendingAppeal();

    const res = await request
      .patch(`${reviewUrl(org.employees.dev)}/appeal`)
      .set(auth(org.tokens.hr))
      .send({ resolution: "Adjusted", resolverNote: "Missing rating." });

    expect(res.status).toBe(400);
  });

  it("notifies the employee of the outcome", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { default: NotificationModel } = await import("../model/Notification.js");

    await setupPendingAppeal();
    await NotificationModel.deleteMany({});

    await request
      .patch(`${reviewUrl(org.employees.dev)}/appeal`)
      .set(auth(org.tokens.hr))
      .send({ resolution: "Upheld", resolverNote: "Stands." });

    const notices = await NotificationModel.find({ category: "performance" });
    expect(notices).toHaveLength(1);
    expect(String(notices[0].user)).toBe(String(org.users.dev.user._id));
    expect(notices[0].message).toContain("upheld");
  });
});

describe("POST /performance/reviews/:cycleKey/:employeeId/peer-feedback", () => {
  const url = (employee, key = cycleKey) => `${reviewUrl(employee, key)}/peer-feedback`;
  const body = { name: "Dana Kim", relation: "Peer", comments: "Great pairing partner." };

  it("accepts feedback from anyone who can view the review", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    for (const token of [org.tokens.dev, org.tokens.manager, org.tokens.hr, org.tokens.admin]) {
      const res = await request.post(url(org.employees.dev)).set(auth(token)).send(body);
      expect(res.status).toBe(201);
    }

    const res = await request.get(reviewUrl(org.employees.dev)).set(auth(org.tokens.dev));
    expect(res.body.data.peerFeedback).toHaveLength(4);
  });

  it("keeps the freeform name and stamps the real author separately", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await request.post(url(org.employees.dev)).set(auth(org.tokens.hr)).send(body);

    expect(res.body.data.peerFeedback[0].name).toBe("Dana Kim");
    expect(res.body.data.peerFeedback[0].relation).toBe("Peer");
    expect(res.body.data.peerFeedback[0].id).toMatch(/^[a-f0-9]{24}$/);
    expect(res.body.data.peerFeedback[0]).not.toHaveProperty("_id");
    expect(res.body.data.peerFeedback[0].addedBy).toBe(String(org.users.hr.user._id));
  });

  it("hides addedBy from the subject but shows it to HR and ADMIN", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    await request.post(url(org.employees.dev)).set(auth(org.tokens.hr)).send(body);

    const asSubject = await request.get(reviewUrl(org.employees.dev)).set(auth(org.tokens.dev));
    expect(asSubject.body.data.peerFeedback[0]).not.toHaveProperty("addedBy");

    const asManager = await request.get(reviewUrl(org.employees.dev)).set(auth(org.tokens.manager));
    expect(asManager.body.data.peerFeedback[0]).not.toHaveProperty("addedBy");

    for (const token of [org.tokens.hr, org.tokens.admin]) {
      const res = await request.get(reviewUrl(org.employees.dev)).set(auth(token));
      expect(res.body.data.peerFeedback[0].addedBy).toBe(String(org.users.hr.user._id));
    }
  });

  it("refuses an unrelated employee", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await request.post(url(org.employees.dev)).set(auth(org.tokens.designer)).send(body);
    expect(res.status).toBe(403);
  });

  it("is allowed on a closed cycle, per the frozen contract", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await request
      .post(url(org.employees.dev, closedKey))
      .set(auth(org.tokens.dev))
      .send(body);

    expect(res.status).toBe(201);
  });

  it("400s missing name or comments", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    expect(
      (await request.post(url(org.employees.dev)).set(auth(org.tokens.dev)).send({ comments: "x" })).status,
    ).toBe(400);
    expect(
      (await request.post(url(org.employees.dev)).set(auth(org.tokens.dev)).send({ name: "x" })).status,
    ).toBe(400);
  });
});
