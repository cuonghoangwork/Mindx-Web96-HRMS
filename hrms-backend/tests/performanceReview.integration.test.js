import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import supertest from "supertest";
import { startDb, stopDb, clearDb, createApp } from "./testHelpers.js";
import { auth, closedCycleKey, currentCycleKey, seedPerformanceOrg } from "./performanceFixtures.js";
import { COMPETENCIES } from "../model/PerformanceReview.js";

let dbAvailable = false;
let app;
let request;
let org;
let cycleKey;
let closedKey;

beforeAll(async () => {
  try {
    await startDb();
    dbAvailable = true;
  } catch (err) {
    console.warn(`[performanceReview.integration] MongoDB unavailable — skipping.\n${err.message}`);
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

describe("GET /performance/reviews/:cycleKey/:employeeId", () => {
  it("returns a shaped default without writing anything", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { default: PerformanceReviewModel } = await import("../model/PerformanceReview.js");

    const res = await request.get(reviewUrl(org.employees.dev)).set(auth(org.tokens.dev));

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(null);
    expect(res.body.data.cycleKey).toBe(cycleKey);
    expect(res.body.data.employeeId).toBe(String(org.employees.dev._id));
    expect(res.body.data.selfRating).toBe(null);
    expect(res.body.data.selfComments).toBe("");
    expect(res.body.data.goals).toEqual([]);
    expect(res.body.data.peerFeedback).toEqual([]);
    expect(res.body.data.appeal).toBe(null);
    expect(res.body.data.status).toBe("Not started");
    expect(res.body.data.appealDeadline).toBe(null);
    expect(Object.keys(res.body.data.competencies)).toEqual(COMPETENCIES);
    for (const key of COMPETENCIES) {
      expect(res.body.data.competencies[key]).toEqual({ self: null, manager: null });
    }

    expect(await PerformanceReviewModel.countDocuments({})).toBe(0);
  });

  it("returns the same competency shape once a document exists", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const before = await request.get(reviewUrl(org.employees.dev)).set(auth(org.tokens.dev));
    await request
      .patch(`${reviewUrl(org.employees.dev)}/self`)
      .set(auth(org.tokens.dev))
      .send({ selfRating: 4 });
    const after = await request.get(reviewUrl(org.employees.dev)).set(auth(org.tokens.dev));

    expect(Object.keys(after.body.data)).toEqual(Object.keys(before.body.data));
    expect(after.body.data.competencies).toEqual(before.body.data.competencies);
    expect(after.body.data.id).not.toBe(null);
  });

  it("carries permissions and the cycle alongside the record", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await request.get(reviewUrl(org.employees.dev)).set(auth(org.tokens.dev));

    expect(res.body.cycle.key).toBe(cycleKey);
    expect(res.body.cycle.status).toBe("Open");
    expect(res.body.permissions.canEditSelf).toBe(true);
    expect(res.body.permissions.canEditManager).toBe(false);
    expect(res.body.permissions.canAddGoals).toBe(true);
    expect(res.body.permissions.canFileAppeal).toBe(false);
    expect(res.body.employee.employeeCode).toBe("EMP102");
    expect(res.body.employee.employeeId).toBe(String(org.employees.dev._id));
    expect(res.body.employee.department).toBe("Engineering");
  });

  it("reports canEditManager for the department manager and for an admin", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const asManager = await request.get(reviewUrl(org.employees.dev)).set(auth(org.tokens.manager));
    expect(asManager.body.permissions.canEditManager).toBe(true);
    expect(asManager.body.permissions.canEditSelf).toBe(false);

    const asAdmin = await request.get(reviewUrl(org.employees.dev)).set(auth(org.tokens.admin));
    expect(asAdmin.body.permissions.canEditManager).toBe(true);
  });

  it("locks editing on a closed cycle while still serving the record", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await request
      .get(reviewUrl(org.employees.dev, closedKey))
      .set(auth(org.tokens.dev));

    expect(res.status).toBe(200);
    expect(res.body.cycle.status).toBe("Closed");
    expect(res.body.permissions.canEditSelf).toBe(false);
    expect(res.body.permissions.canAddPeerFeedback).toBe(true);
  });

  it("refuses an unrelated employee and allows everyone with a legitimate reason", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const outsider = await request
      .get(reviewUrl(org.employees.dev))
      .set(auth(org.tokens.designer));
    expect(outsider.status).toBe(403);

    for (const token of [org.tokens.dev, org.tokens.manager, org.tokens.hr, org.tokens.admin]) {
      expect((await request.get(reviewUrl(org.employees.dev)).set(auth(token))).status).toBe(200);
    }
  });

  it("400s a malformed employee id instead of 500ing on a cast error", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await request
      .get(`/api/v1/performance/reviews/${cycleKey}/not-an-id`)
      .set(auth(org.tokens.admin));

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("not a valid id");
  });

  it("404s an employee id that does not exist", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await request
      .get(`/api/v1/performance/reviews/${cycleKey}/64f0000000000000000000aa`)
      .set(auth(org.tokens.admin));

    expect(res.status).toBe(404);
  });
});

describe("PATCH /performance/reviews/:cycleKey/:employeeId/self", () => {
  it("records the rating and stamps the date server-side", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await request
      .patch(`${reviewUrl(org.employees.dev)}/self`)
      .set(auth(org.tokens.dev))
      .send({
        selfRating: 4,
        selfComments: "  Shipped the payroll job.  ",
        selfSubmittedDate: "1999-01-01T00:00:00.000Z",
      });

    expect(res.status).toBe(200);
    expect(res.body.data.selfRating).toBe(4);
    expect(res.body.data.selfComments).toBe("Shipped the payroll job.");
    expect(res.body.data.status).toBe("Self submitted");
    expect(new Date(res.body.data.selfSubmittedDate).getFullYear()).toBeGreaterThan(2000);
  });

  it("refuses anyone other than the subject, including their manager and an admin", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    for (const token of [org.tokens.manager, org.tokens.hr, org.tokens.admin, org.tokens.designer]) {
      const res = await request
        .patch(`${reviewUrl(org.employees.dev)}/self`)
        .set(auth(token))
        .send({ selfRating: 5 });
      expect(res.status).toBe(403);
    }
  });

  it("409s on a closed cycle", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await request
      .patch(`${reviewUrl(org.employees.dev, closedKey)}/self`)
      .set(auth(org.tokens.dev))
      .send({ selfRating: 4 });

    expect(res.status).toBe(409);
    expect(res.body.message).toContain("closed");
  });

  it("400s a rating outside the scale", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await request
      .patch(`${reviewUrl(org.employees.dev)}/self`)
      .set(auth(org.tokens.dev))
      .send({ selfRating: 9 });

    expect(res.status).toBe(400);
  });

  it("notifies the department manager on the first submission only", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { default: NotificationModel } = await import("../model/Notification.js");

    await request
      .patch(`${reviewUrl(org.employees.dev)}/self`)
      .set(auth(org.tokens.dev))
      .send({ selfRating: 4 });

    const first = await NotificationModel.find({ category: "performance" });
    expect(first).toHaveLength(1);
    expect(String(first[0].user)).toBe(String(org.users.manager.user._id));
    expect(first[0].link).toBe("/performance");
    expect(first[0].linkLabel).toBe("Open review");
    expect(first[0].audience).toBe("all");

    await request
      .patch(`${reviewUrl(org.employees.dev)}/self`)
      .set(auth(org.tokens.dev))
      .send({ selfRating: 5 });

    expect(await NotificationModel.countDocuments({ category: "performance" })).toBe(1);
  });

  it("falls back to an HR broadcast when the employee has no department manager", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { default: NotificationModel } = await import("../model/Notification.js");

    await request
      .patch(`${reviewUrl(org.employees.designer)}/self`)
      .set(auth(org.tokens.designer))
      .send({ selfRating: 3 });

    const notices = await NotificationModel.find({ category: "performance" });
    expect(notices).toHaveLength(1);
    expect(notices[0].user).toBe(null);
    expect(notices[0].audience).toBe("hr");
  });

  it("writes an audit row under the performance resource", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { default: AuditLogModel } = await import("../model/AuditLog.js");

    await request
      .patch(`${reviewUrl(org.employees.dev)}/self`)
      .set(auth(org.tokens.dev))
      .send({ selfRating: 4 });

    const entry = await AuditLogModel.findOne({ resource: "performance" });
    expect(entry).toBeTruthy();
    expect(entry.action).toBe("updated");
    expect(entry.label).toBe(`Self review — Dev One (${cycleKey})`);
  });
});

describe("PATCH /performance/reviews/:cycleKey/:employeeId/manager", () => {
  it("lets the department manager rate a report", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await request
      .patch(`${reviewUrl(org.employees.dev)}/manager`)
      .set(auth(org.tokens.manager))
      .send({ managerRating: 5, managerComments: "Strong half." });

    expect(res.status).toBe(200);
    expect(res.body.data.managerRating).toBe(5);
    expect(res.body.data.status).toBe("Manager submitted");
    expect(res.body.data.appealDeadline).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("refuses a manager rating their own review", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await request
      .patch(`${reviewUrl(org.employees.manager)}/manager`)
      .set(auth(org.tokens.manager))
      .send({ managerRating: 5 });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain("your own manager review");
  });

  it("refuses a manager from another department", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await request
      .patch(`${reviewUrl(org.employees.designer)}/manager`)
      .set(auth(org.tokens.manager))
      .send({ managerRating: 3 });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain("your own department");
  });

  it("refuses HR when the employee has a department manager", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await request
      .patch(`${reviewUrl(org.employees.dev)}/manager`)
      .set(auth(org.tokens.hr))
      .send({ managerRating: 4 });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain("has a department manager");
  });

  it("lets HR stand in for an orphan manager", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await request
      .patch(`${reviewUrl(org.employees.manager)}/manager`)
      .set(auth(org.tokens.hr))
      .send({ managerRating: 4, managerComments: "Ran the team well." });

    expect(res.status).toBe(200);
    expect(res.body.data.managerRating).toBe(4);
  });

  it("lets HR stand in for a department with no manager at all", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await request
      .patch(`${reviewUrl(org.employees.designer)}/manager`)
      .set(auth(org.tokens.hr))
      .send({ managerRating: 3 });

    expect(res.status).toBe(200);
  });

  it("always lets an ADMIN rate someone else", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await request
      .patch(`${reviewUrl(org.employees.dev)}/manager`)
      .set(auth(org.tokens.admin))
      .send({ managerRating: 2 });

    expect(res.status).toBe(200);
    expect(res.body.data.managerRating).toBe(2);
  });

  it("refuses a plain EMPLOYEE at the router gate", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await request
      .patch(`${reviewUrl(org.employees.dev)}/manager`)
      .set(auth(org.tokens.dev))
      .send({ managerRating: 5 });

    expect(res.status).toBe(403);
  });

  it("409s on a closed cycle", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await request
      .patch(`${reviewUrl(org.employees.dev, closedKey)}/manager`)
      .set(auth(org.tokens.manager))
      .send({ managerRating: 4 });

    expect(res.status).toBe(409);
  });

  it("notifies the employee on the first submission only", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { default: NotificationModel } = await import("../model/Notification.js");

    await request
      .patch(`${reviewUrl(org.employees.dev)}/manager`)
      .set(auth(org.tokens.manager))
      .send({ managerRating: 4 });

    const notices = await NotificationModel.find({ category: "performance" });
    expect(notices).toHaveLength(1);
    expect(String(notices[0].user)).toBe(String(org.users.dev.user._id));

    await request
      .patch(`${reviewUrl(org.employees.dev)}/manager`)
      .set(auth(org.tokens.manager))
      .send({ managerRating: 5 });

    expect(await NotificationModel.countDocuments({ category: "performance" })).toBe(1);
  });

  it("records who submitted the manager review", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { default: PerformanceReviewModel } = await import("../model/PerformanceReview.js");

    await request
      .patch(`${reviewUrl(org.employees.dev)}/manager`)
      .set(auth(org.tokens.manager))
      .send({ managerRating: 4 });

    const review = await PerformanceReviewModel.findOne({ employee: org.employees.dev._id });
    expect(String(review.managerReviewedBy)).toBe(String(org.users.manager.user._id));
  });
});

describe("concurrent writes to the same review", () => {
  it("keeps both halves when the employee and their manager submit at once", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { default: PerformanceReviewModel } = await import("../model/PerformanceReview.js");

    const [selfRes, managerRes] = await Promise.all([
      request
        .patch(`${reviewUrl(org.employees.dev)}/self`)
        .set(auth(org.tokens.dev))
        .send({ selfRating: 3, selfComments: "Solid half." }),
      request
        .patch(`${reviewUrl(org.employees.dev)}/manager`)
        .set(auth(org.tokens.manager))
        .send({ managerRating: 5, managerComments: "Great work." }),
    ]);

    expect(selfRes.status).toBe(200);
    expect(managerRes.status).toBe(200);

    expect(await PerformanceReviewModel.countDocuments({ employee: org.employees.dev._id })).toBe(1);

    const review = await PerformanceReviewModel.findOne({ employee: org.employees.dev._id });
    expect(review.selfRating).toBe(3);
    expect(review.managerRating).toBe(5);
    expect(review.selfComments).toBe("Solid half.");
    expect(review.managerComments).toBe("Great work.");
    expect(review.selfSubmittedDate).toBeTruthy();
    expect(review.managerSubmittedDate).toBeTruthy();
  });

  it("reaches Completed once both halves land, in either order", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    await request
      .patch(`${reviewUrl(org.employees.dev)}/manager`)
      .set(auth(org.tokens.manager))
      .send({ managerRating: 4 });
    const res = await request
      .patch(`${reviewUrl(org.employees.dev)}/self`)
      .set(auth(org.tokens.dev))
      .send({ selfRating: 4 });

    expect(res.body.data.status).toBe("Completed");
  });
});

describe("PATCH /performance/reviews/:cycleKey/:employeeId/competencies", () => {
  const url = (employee, key = cycleKey) => `${reviewUrl(employee, key)}/competencies`;

  it("writes the self half for the subject and leaves the manager half alone", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await request
      .patch(url(org.employees.dev))
      .set(auth(org.tokens.dev))
      .send({ key: "communication", value: 4 });

    expect(res.status).toBe(200);
    expect(res.body.data.competencies.communication).toEqual({ self: 4, manager: null });
    expect(res.body.data.competencies.execution).toEqual({ self: null, manager: null });
  });

  it("writes the manager half for the department manager without touching the self half", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    await request
      .patch(url(org.employees.dev))
      .set(auth(org.tokens.dev))
      .send({ key: "communication", value: 4 });

    const res = await request
      .patch(url(org.employees.dev))
      .set(auth(org.tokens.manager))
      .send({ key: "communication", value: 2 });

    expect(res.status).toBe(200);
    expect(res.body.data.competencies.communication).toEqual({ self: 4, manager: 2 });
  });

  it("ignores a client-supplied rater field", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await request
      .patch(url(org.employees.dev))
      .set(auth(org.tokens.dev))
      .send({ key: "ownership", value: 5, rater: "manager" });

    expect(res.status).toBe(200);
    expect(res.body.data.competencies.ownership).toEqual({ self: 5, manager: null });
  });

  it("treats a manager rating their own competencies as the self half", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await request
      .patch(url(org.employees.manager))
      .set(auth(org.tokens.manager))
      .send({ key: "leadership", value: 3 });

    expect(res.status).toBe(200);
    expect(res.body.data.competencies.leadership).toEqual({ self: 3, manager: null });
  });

  it("lets HR fill the manager half only for an orphan manager", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const orphan = await request
      .patch(url(org.employees.manager))
      .set(auth(org.tokens.hr))
      .send({ key: "leadership", value: 4 });
    expect(orphan.status).toBe(200);
    expect(orphan.body.data.competencies.leadership).toEqual({ self: null, manager: 4 });

    const blocked = await request
      .patch(url(org.employees.dev))
      .set(auth(org.tokens.hr))
      .send({ key: "leadership", value: 4 });
    expect(blocked.status).toBe(403);
  });

  it("refuses an unrelated employee and a manager from another department", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const outsider = await request
      .patch(url(org.employees.dev))
      .set(auth(org.tokens.designer))
      .send({ key: "execution", value: 3 });
    expect(outsider.status).toBe(403);

    const wrongDept = await request
      .patch(url(org.employees.designer))
      .set(auth(org.tokens.manager))
      .send({ key: "execution", value: 3 });
    expect(wrongDept.status).toBe(403);
  });

  it("400s an unknown competency key and 409s a closed cycle", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const badKey = await request
      .patch(url(org.employees.dev))
      .set(auth(org.tokens.dev))
      .send({ key: "charisma", value: 3 });
    expect(badKey.status).toBe(400);

    const closed = await request
      .patch(url(org.employees.dev, closedKey))
      .set(auth(org.tokens.dev))
      .send({ key: "execution", value: 3 });
    expect(closed.status).toBe(409);
  });

  it("does not audit per-click competency writes", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { default: AuditLogModel } = await import("../model/AuditLog.js");

    await request
      .patch(url(org.employees.dev))
      .set(auth(org.tokens.dev))
      .send({ key: "execution", value: 3 });

    expect(await AuditLogModel.countDocuments({ resource: "performance" })).toBe(0);
  });
});

describe("goals", () => {
  const goalsUrl = (employee, key = cycleKey) => `${reviewUrl(employee, key)}/goals`;

  async function addGoal(text = "Ship the analytics panel", progress) {
    return request
      .post(goalsUrl(org.employees.dev))
      .set(auth(org.tokens.dev))
      .send(progress === undefined ? { text } : { text, progress });
  }

  it("adds a goal with an id and no raw _id in the payload", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await addGoal();

    expect(res.status).toBe(201);
    expect(res.body.data.goals).toHaveLength(1);
    expect(res.body.data.goals[0].id).toMatch(/^[a-f0-9]{24}$/);
    expect(res.body.data.goals[0]).not.toHaveProperty("_id");
    expect(res.body.data.goals[0].text).toBe("Ship the analytics panel");
    expect(res.body.data.goals[0].progress).toBe(0);
    expect(Object.keys(res.body.data.goals[0]).sort()).toEqual(["id", "progress", "text"]);
  });

  it("accepts an initial progress value on the step", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await addGoal("Land the migration", 40);
    expect(res.body.data.goals[0].progress).toBe(40);
  });

  it("refuses anyone but the subject", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    for (const token of [org.tokens.manager, org.tokens.hr, org.tokens.admin]) {
      const res = await request
        .post(goalsUrl(org.employees.dev))
        .set(auth(token))
        .send({ text: "Not mine to add" });
      expect(res.status).toBe(403);
    }
  });

  it("keeps both goals when two are added at once", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    await Promise.all([addGoal("First goal"), addGoal("Second goal")]);

    const res = await request.get(reviewUrl(org.employees.dev)).set(auth(org.tokens.dev));
    expect(res.body.data.goals).toHaveLength(2);
  });

  it("updates progress by goal id", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const created = await addGoal();
    const goalId = created.body.data.goals[0].id;

    const res = await request
      .patch(`${goalsUrl(org.employees.dev)}/${goalId}`)
      .set(auth(org.tokens.dev))
      .send({ progress: 70 });

    expect(res.status).toBe(200);
    expect(res.body.data.goals[0].progress).toBe(70);
  });

  it("accepts a progress of zero", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const created = await addGoal("Reset me", 50);
    const goalId = created.body.data.goals[0].id;

    const res = await request
      .patch(`${goalsUrl(org.employees.dev)}/${goalId}`)
      .set(auth(org.tokens.dev))
      .send({ progress: 0 });

    expect(res.status).toBe(200);
    expect(res.body.data.goals[0].progress).toBe(0);
  });

  it("rejects an off-step progress value", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const created = await addGoal();
    const goalId = created.body.data.goals[0].id;

    const res = await request
      .patch(`${goalsUrl(org.employees.dev)}/${goalId}`)
      .set(auth(org.tokens.dev))
      .send({ progress: 35 });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("steps of 10");
  });

  it("404s an unknown goal id and 400s a malformed one, never creating a stray document", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { default: PerformanceReviewModel } = await import("../model/PerformanceReview.js");

    const missing = await request
      .patch(`${goalsUrl(org.employees.dev)}/64f0000000000000000000aa`)
      .set(auth(org.tokens.dev))
      .send({ progress: 50 });
    expect(missing.status).toBe(404);
    expect(missing.body.message).toContain("Goal not found");

    const malformed = await request
      .patch(`${goalsUrl(org.employees.dev)}/not-an-id`)
      .set(auth(org.tokens.dev))
      .send({ progress: 50 });
    expect(malformed.status).toBe(400);

    expect(await PerformanceReviewModel.countDocuments({})).toBe(0);
  });

  it("409s goal writes on a closed cycle", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await request
      .post(goalsUrl(org.employees.dev, closedKey))
      .set(auth(org.tokens.dev))
      .send({ text: "Too late" });

    expect(res.status).toBe(409);
  });
});
