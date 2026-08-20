import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import supertest from "supertest";
import { startDb, stopDb, clearDb, createApp, seedUserAndLogin } from "./testHelpers.js";
import { auth, currentCycleKey, seedPerformanceOrg } from "./performanceFixtures.js";
import { COMPETENCIES } from "../model/PerformanceReview.js";

let dbAvailable = false;
let app;
let request;
let org;
let cycleKey;

beforeAll(async () => {
  try {
    await startDb();
    dbAvailable = true;
  } catch (err) {
    console.warn(`[performanceRoster.integration] MongoDB unavailable — skipping.\n${err.message}`);
    return;
  }
  app = await createApp();
  request = supertest(app);
  cycleKey = await currentCycleKey();
});

afterAll(async () => {
  await stopDb();
});

beforeEach(async () => {
  if (!dbAvailable) return;
  await clearDb();
  org = await seedPerformanceOrg(app);
});

const rosterUrl = (key = cycleKey) => `/api/v1/performance/cycles/${key}/roster`;
const analyticsUrl = (key = cycleKey) => `/api/v1/performance/cycles/${key}/analytics`;
const reviewUrl = (employee) => `/api/v1/performance/reviews/${cycleKey}/${employee._id}`;

async function submitSelf(employee, token, selfRating) {
  return request
    .patch(`${reviewUrl(employee)}/self`)
    .set(auth(token))
    .send({ selfRating });
}

async function submitManager(employee, token, managerRating) {
  return request
    .patch(`${reviewUrl(employee)}/manager`)
    .set(auth(token))
    .send({ managerRating });
}

describe("GET /performance/cycles/:key/roster", () => {
  it("shows everyone to ADMIN and HR", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    for (const token of [org.tokens.admin, org.tokens.hr]) {
      const res = await request.get(rosterUrl()).set(auth(token));
      expect(res.status).toBe(200);
      expect(res.body.scope).toBe("all");
      expect(res.body.items).toHaveLength(4);
    }
  });

  it("shows a manager their own department, own row included, with no union needed", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await request.get(rosterUrl()).set(auth(org.tokens.manager));

    expect(res.status).toBe(200);
    expect(res.body.scope).toBe("department");
    expect(res.body.items.map((item) => item.employeeCode).sort()).toEqual(["EMP101", "EMP102"]);
  });

  it("shows an employee only their own row", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await request.get(rosterUrl()).set(auth(org.tokens.dev));

    expect(res.status).toBe(200);
    expect(res.body.scope).toBe("self");
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].employeeCode).toBe("EMP102");
  });

  it("carries the Mongo id as employeeId and the business code separately", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await request.get(rosterUrl()).set(auth(org.tokens.dev));
    const row = res.body.items[0];

    expect(row.employeeId).toBe(String(org.employees.dev._id));
    expect(row.employeeId).toMatch(/^[a-f0-9]{24}$/);
    expect(row.employeeCode).toBe("EMP102");
    expect(row.department).toBe("Engineering");
    expect(row.departmentId).toBe(String(org.departments.engineering._id));
  });

  it("lets the frontend follow employeeId straight into the review URL", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const roster = await request.get(rosterUrl()).set(auth(org.tokens.dev));
    const row = roster.body.items[0];

    const res = await request
      .get(`/api/v1/performance/reviews/${cycleKey}/${row.employeeId}`)
      .set(auth(org.tokens.dev));

    expect(res.status).toBe(200);
    expect(res.body.employee.employeeCode).toBe("EMP102");
  });

  it("403s a MANAGER whose employee record has no department, rather than 500ing", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { default: EmployeeModel } = await import("../model/Employee.js");

    await EmployeeModel.updateOne(
      { _id: org.employees.manager._id },
      { $unset: { department: "" } },
    );

    const res = await request.get(rosterUrl()).set(auth(org.tokens.manager));

    expect(res.status).toBe(403);
    expect(res.body.message).toContain("department");
  });

  it("returns an empty roster with 200 for an account with no employee record", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const orphanAccount = await seedUserAndLogin(app, {
      email: "nolink@t.test",
      name: "No Link",
      role: "EMPLOYEE",
    });

    const res = await request.get(rosterUrl()).set(auth(orphanAccount.token));

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  it("excludes terminated employees", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { default: EmployeeModel } = await import("../model/Employee.js");

    await EmployeeModel.updateOne(
      { _id: org.employees.designer._id },
      { $set: { status: "terminated" } },
    );

    const res = await request.get(rosterUrl()).set(auth(org.tokens.admin));

    expect(res.body.items).toHaveLength(3);
    expect(res.body.items.some((item) => item.employeeCode === "EMP103")).toBe(false);
  });

  it("still serves a terminated employee's review at its direct URL", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { default: EmployeeModel } = await import("../model/Employee.js");

    await EmployeeModel.updateOne(
      { _id: org.employees.designer._id },
      { $set: { status: "terminated" } },
    );

    const res = await request
      .get(`/api/v1/performance/reviews/${cycleKey}/${org.employees.designer._id}`)
      .set(auth(org.tokens.admin));

    expect(res.status).toBe(200);
  });

  it("walks the status through Not started, Self submitted and Completed", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const rowFor = async () => {
      const res = await request.get(rosterUrl()).set(auth(org.tokens.dev));
      return res.body.items[0];
    };

    expect((await rowFor()).status).toBe("Not started");

    await submitSelf(org.employees.dev, org.tokens.dev, 4);
    let row = await rowFor();
    expect(row.status).toBe("Self submitted");
    expect(row.selfRating).toBe(4);
    expect(row.managerRating).toBe(null);

    await submitManager(org.employees.dev, org.tokens.manager, 5);
    row = await rowFor();
    expect(row.status).toBe("Completed");
    expect(row.managerRating).toBe(5);
    expect(row.hasAppeal).toBe(false);
    expect(row.appealStatus).toBe(null);
  });

  it("sorts rows by employee name", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await request.get(rosterUrl()).set(auth(org.tokens.admin));
    const names = res.body.items.map((item) => item.name);

    expect(names).toEqual([...names].sort());
  });
});

describe("GET /performance/cycles/:key/analytics", () => {
  it("gives ADMIN a department comparison", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    await submitSelf(org.employees.dev, org.tokens.dev, 4);
    await submitManager(org.employees.dev, org.tokens.manager, 5);

    const res = await request.get(analyticsUrl()).set(auth(org.tokens.admin));

    expect(res.status).toBe(200);
    expect(res.body.scope).toBe("all");
    expect(Array.isArray(res.body.data.deptCompare)).toBe(true);
    expect(res.body.data.totals.employees).toBe(4);
    expect(res.body.data.totals.completed).toBe(1);
    expect(res.body.data.totals.notStarted).toBe(3);

    const engineering = res.body.data.deptCompare.find((row) => row.department === "Engineering");
    expect(engineering.employees).toBe(2);
    expect(engineering.completed).toBe(1);
    expect(engineering.avgManager).toBe(5);
  });

  it("withholds the department comparison from a manager and scopes the distribution", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    await submitSelf(org.employees.dev, org.tokens.dev, 2);
    await submitSelf(org.employees.designer, org.tokens.designer, 5);

    const res = await request.get(analyticsUrl()).set(auth(org.tokens.manager));

    expect(res.status).toBe(200);
    expect(res.body.scope).toBe("department");
    expect(res.body.data.deptCompare).toBe(null);
    expect(res.body.data.totals.employees).toBe(2);
    expect(res.body.data.ratingDistribution.self[2]).toBe(1);
    expect(res.body.data.ratingDistribution.self[5]).toBe(0);
    expect(res.body.data.averages.self).toBe(2);
  });

  it("uses the identical scope as the roster call", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    for (const token of [org.tokens.admin, org.tokens.hr, org.tokens.manager, org.tokens.dev]) {
      const roster = await request.get(rosterUrl()).set(auth(token));
      const analytics = await request.get(analyticsUrl()).set(auth(token));

      expect(analytics.body.scope).toBe(roster.body.scope);
      expect(analytics.body.data.totals.employees).toBe(roster.body.items.length);
    }
  });

  it("reports null averages rather than zero when nothing is submitted", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await request.get(analyticsUrl()).set(auth(org.tokens.admin));

    expect(res.body.data.averages.self).toBe(null);
    expect(res.body.data.averages.manager).toBe(null);
    expect(res.body.data.ratingDistribution.manager).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
  });

  it("always returns all six competency rows in order", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    await request
      .patch(`${reviewUrl(org.employees.dev)}/competencies`)
      .set(auth(org.tokens.dev))
      .send({ key: "execution", value: 4 });

    const res = await request.get(analyticsUrl()).set(auth(org.tokens.admin));

    expect(res.body.data.competencyAverages.map((row) => row.key)).toEqual(COMPETENCIES);
    const execution = res.body.data.competencyAverages.find((row) => row.key === "execution");
    expect(execution.self).toBe(4);
    expect(execution.selfCount).toBe(1);
    expect(execution.manager).toBe(null);
  });

  it("reflects a rating that an adjusted appeal overwrote", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    await submitManager(org.employees.dev, org.tokens.manager, 2);
    await request
      .post(`${reviewUrl(org.employees.dev)}/appeal`)
      .set(auth(org.tokens.dev))
      .send({ reasonCategory: "rating_low", detail: "Please re-read the Q2 notes." });
    await request
      .patch(`${reviewUrl(org.employees.dev)}/appeal`)
      .set(auth(org.tokens.hr))
      .send({ resolution: "Adjusted", resolvedRating: 5, resolverNote: "Raised." });

    const res = await request.get(analyticsUrl()).set(auth(org.tokens.admin));

    expect(res.body.data.ratingDistribution.manager[5]).toBe(1);
    expect(res.body.data.ratingDistribution.manager[2]).toBe(0);
    expect(res.body.data.averages.manager).toBe(5);
  });

  it("404s an unknown cycle", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    expect((await request.get(analyticsUrl("2019-h2")).set(auth(org.tokens.admin))).status).toBe(404);
  });
});

describe("cycle management", () => {
  const cyclesUrl = "/api/v1/performance/cycles";

  it("lets an ADMIN create a custom cycle with a server-generated key", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await request
      .post(cyclesUrl)
      .set(auth(org.tokens.admin))
      .send({
        label: "FY26 mid-year check-in",
        start: "2026-03-01",
        end: "2026-04-30",
        key: "hacked-key",
        kind: "standard",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.key).toMatch(/^custom-\d+/);
    expect(res.body.data.kind).toBe("custom");
    expect(res.body.data.status).toBe("Open");
    expect(res.body.data.label).toBe("FY26 mid-year check-in");
  });

  it("refuses cycle creation from HR and MANAGER", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    for (const token of [org.tokens.hr, org.tokens.manager, org.tokens.dev]) {
      const res = await request
        .post(cyclesUrl)
        .set(auth(token))
        .send({ label: "Nope", start: "2026-03-01", end: "2026-04-30" });
      expect(res.status).toBe(403);
    }
  });

  it("400s an end date before the start date", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await request
      .post(cyclesUrl)
      .set(auth(org.tokens.admin))
      .send({ label: "Backwards", start: "2026-04-30", end: "2026-03-01" });

    expect(res.status).toBe(400);
  });

  it("keeps a reopened standard cycle open across regeneration", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const list = await request.get(cyclesUrl).set(auth(org.tokens.admin));
    const closed = list.body.items.find((cycle) => cycle.status === "Closed");

    const patched = await request
      .patch(`${cyclesUrl}/${closed.key}`)
      .set(auth(org.tokens.admin))
      .send({ status: "Open" });

    expect(patched.status).toBe(200);
    expect(patched.body.data.status).toBe("Open");
    expect(patched.body.data.statusOverriddenAt).toBeTruthy();

    const after = await request.get(cyclesUrl).set(auth(org.tokens.admin));
    expect(after.body.items.find((cycle) => cycle.key === closed.key).status).toBe("Open");
    expect(after.body.items.filter((cycle) => cycle.status === "Open")).toHaveLength(2);
  });

  it("keeps a manually closed current cycle closed across regeneration", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    await request
      .patch(`${cyclesUrl}/${cycleKey}`)
      .set(auth(org.tokens.admin))
      .send({ status: "Closed" });

    const after = await request.get(cyclesUrl).set(auth(org.tokens.admin));
    expect(after.body.items.find((cycle) => cycle.key === cycleKey).status).toBe("Closed");
    expect(after.body.items.filter((cycle) => cycle.status === "Open")).toHaveLength(0);
  });

  it("never auto-closes a custom cycle whose end date has passed", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const created = await request
      .post(cyclesUrl)
      .set(auth(org.tokens.admin))
      .send({ label: "Old check-in", start: "2020-01-01", end: "2020-02-01" });

    await request.get(cyclesUrl).set(auth(org.tokens.admin));
    const after = await request.get(cyclesUrl).set(auth(org.tokens.admin));

    expect(after.body.items.find((cycle) => cycle.key === created.body.data.key).status).toBe("Open");
  });

  it("refuses a status change from HR and 404s an unknown cycle", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const asHr = await request
      .patch(`${cyclesUrl}/${cycleKey}`)
      .set(auth(org.tokens.hr))
      .send({ status: "Closed" });
    expect(asHr.status).toBe(403);

    const missing = await request
      .patch(`${cyclesUrl}/2019-h1`)
      .set(auth(org.tokens.admin))
      .send({ status: "Closed" });
    expect(missing.status).toBe(404);
  });

  it("400s an unknown status value", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await request
      .patch(`${cyclesUrl}/${cycleKey}`)
      .set(auth(org.tokens.admin))
      .send({ status: "Archived" });

    expect(res.status).toBe(400);
  });

  it("leaves the override stamp alone when the status does not actually change", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const res = await request
      .patch(`${cyclesUrl}/${cycleKey}`)
      .set(auth(org.tokens.admin))
      .send({ status: "Open" });

    expect(res.status).toBe(200);
    expect(res.body.data.statusOverriddenAt).toBe(null);
  });

  it("broadcasts to everyone when a cycle opens, and audits every status change", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { default: NotificationModel } = await import("../model/Notification.js");
    const { default: AuditLogModel } = await import("../model/AuditLog.js");

    const list = await request.get(cyclesUrl).set(auth(org.tokens.admin));
    const closed = list.body.items.find((cycle) => cycle.status === "Closed");

    await request
      .patch(`${cyclesUrl}/${closed.key}`)
      .set(auth(org.tokens.admin))
      .send({ status: "Open" });

    const broadcasts = await NotificationModel.find({ category: "performance", audience: "all" });
    expect(broadcasts).toHaveLength(1);
    expect(broadcasts[0].user).toBe(null);
    expect(broadcasts[0].link).toBe("/performance");

    await request
      .patch(`${cyclesUrl}/${closed.key}`)
      .set(auth(org.tokens.admin))
      .send({ status: "Closed" });

    expect(await NotificationModel.countDocuments({ category: "performance", audience: "all" })).toBe(1);
    expect(
      await AuditLogModel.countDocuments({ resource: "performance", action: "status_changed" }),
    ).toBe(2);
  });
});
