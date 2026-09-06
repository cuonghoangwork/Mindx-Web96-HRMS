/**
 * notificationAudience.test.js
 *
 * Pins the broadcast audience contract — which roles read which
 * `audience` value on a `user: null` notification.
 *
 * This is deliberately the first test to cover notifications at all. The
 * mapping had lived as a private ternary duplicated across three handlers in
 * notificationController.js, with a model comment that disagreed with the
 * code ("hr" = MANAGER + ADMIN, when the code says HR + ADMIN and excludes
 * MANAGER). Nothing failed when they disagreed, because a broadcast that
 * reaches nobody looks exactly like one that was never sent. These tests are
 * the thing that makes the next change to that map loud.
 *
 * The MANAGER row is the one that matters: MANAGER is department-scoped and
 * a broadcast carries no department, so it reads "employees", not "hr".
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { broadcastAudiencesFor, rolesForAudience, NOTIFICATION_AUDIENCES } from "../model/Notification.js";
import { startDb, stopDb, clearDb, createApp, seedUserAndLogin } from "./testHelpers.js";

describe("broadcastAudiencesFor", () => {
  it("gives the unscoped company-wide tier the 'hr' audience", () => {
    expect(broadcastAudiencesFor("ADMIN")).toEqual(["all", "hr"]);
    expect(broadcastAudiencesFor("HR")).toEqual(["all", "hr"]);
  });

  it("keeps MANAGER out of 'hr' — it is department-scoped, a broadcast is not", () => {
    expect(broadcastAudiencesFor("MANAGER")).toEqual(["all", "employees"]);
    expect(broadcastAudiencesFor("MANAGER")).not.toContain("hr");
  });

  it("gives EMPLOYEE the same least-privileged set", () => {
    expect(broadcastAudiencesFor("EMPLOYEE")).toEqual(["all", "employees"]);
  });

  it("falls back to the least-privileged set for an unknown or missing role", () => {
    // A role that never matches must not accidentally open up "hr" — this is
    // the fail-closed direction, and it is what the old `isHR ? ... : ...`
    // ternary happened to do. Keep it.
    expect(broadcastAudiencesFor("SOMETHING_NEW")).toEqual(["all", "employees"]);
    expect(broadcastAudiencesFor(undefined)).toEqual(["all", "employees"]);
  });

  it("only ever returns audiences the schema enum accepts", () => {
    for (const role of ["ADMIN", "HR", "MANAGER", "EMPLOYEE", undefined]) {
      for (const audience of broadcastAudiencesFor(role)) {
        expect(NOTIFICATION_AUDIENCES).toContain(audience);
      }
    }
  });

  it("returns 'all' to every role — that is what makes it a broadcast", () => {
    for (const role of ["ADMIN", "HR", "MANAGER", "EMPLOYEE", undefined]) {
      expect(broadcastAudiencesFor(role)).toContain("all");
    }
  });
});

describe("rolesForAudience", () => {
  it("inverts the map the read path uses", () => {
    expect(rolesForAudience("hr").sort()).toEqual(["ADMIN", "HR"]);
    expect(rolesForAudience("employees").sort()).toEqual(["EMPLOYEE", "MANAGER"]);
    expect(rolesForAudience("all").sort()).toEqual(["ADMIN", "EMPLOYEE", "HR", "MANAGER"]);
  });

  it("agrees with broadcastAudiencesFor in both directions", () => {
    // Out-of-app delivery turns a broadcast into an actual list of inboxes,
    // so these two have to be exact inverses. If they ever disagree, the bug
    // is "the email went to people who cannot see it in the app".
    for (const audience of NOTIFICATION_AUDIENCES) {
      for (const role of rolesForAudience(audience)) {
        expect(broadcastAudiencesFor(role)).toContain(audience);
      }
    }
    for (const role of ["ADMIN", "HR", "MANAGER", "EMPLOYEE"]) {
      for (const audience of broadcastAudiencesFor(role)) {
        expect(rolesForAudience(audience)).toContain(role);
      }
    }
  });

  it("returns nobody for an audience that does not exist", () => {
    expect(rolesForAudience("nope")).toEqual([]);
  });
});

let dbAvailable = false;
let app;

beforeAll(async () => {
  try {
    await startDb();
    dbAvailable = true;
    app = await createApp();
  } catch (err) {
    console.warn(`[notificationAudience] MongoDB unavailable — skipping.\n${err.message}`);
  }
});

afterAll(async () => {
  await stopDb();
});

beforeEach(async () => {
  if (dbAvailable) await clearDb();
});

/** One broadcast of every audience, so each role's read can be checked against all three. */
async function seedBroadcasts() {
  const { default: NotificationModel } = await import("../model/Notification.js");
  for (const audience of NOTIFICATION_AUDIENCES) {
    await NotificationModel.create({
      user: null,
      audience,
      category: "system",
      title: `broadcast-${audience}`,
    });
  }
}

const titlesFrom = (res) => res.body.items.map((n) => n.title).sort();

describe("GET /notifications — broadcast visibility by role", () => {
  const cases = [
    ["ADMIN",    ["broadcast-all", "broadcast-hr"]],
    ["HR",       ["broadcast-all", "broadcast-hr"]],
    ["MANAGER",  ["broadcast-all", "broadcast-employees"]],
    ["EMPLOYEE", ["broadcast-all", "broadcast-employees"]],
  ];

  for (const [role, expected] of cases) {
    it(`${role} sees exactly ${expected.join(" + ")}`, async () => {
      if (!dbAvailable) return;
      const supertest = (await import("supertest")).default;
      await seedBroadcasts();
      const { token } = await seedUserAndLogin(app, { email: `${role.toLowerCase()}@hrms.com`, role });

      const res = await supertest(app).get("/api/v1/notifications").set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(titlesFrom(res)).toEqual([...expected].sort());
    });
  }

  it("still delivers a targeted notice to a MANAGER — that is how they are reached", async () => {
    if (!dbAvailable) return;
    const supertest = (await import("supertest")).default;
    const { default: NotificationModel } = await import("../model/Notification.js");
    await seedBroadcasts();

    const { token, userId } = await seedUserAndLogin(app, { email: "mgr@hrms.com", role: "MANAGER" });
    await NotificationModel.create({ user: userId, category: "leave", title: "targeted-to-manager" });

    const res = await supertest(app).get("/api/v1/notifications").set("Authorization", `Bearer ${token}`);

    expect(titlesFrom(res)).toEqual(["broadcast-all", "broadcast-employees", "targeted-to-manager"]);
  });
});

describe("PATCH /notifications/read-all — respects the same audience map", () => {
  it("does not let a MANAGER mark an 'hr' broadcast read", async () => {
    if (!dbAvailable) return;
    const supertest = (await import("supertest")).default;
    const { default: NotificationModel } = await import("../model/Notification.js");
    await seedBroadcasts();
    const { token } = await seedUserAndLogin(app, { email: "mgr2@hrms.com", role: "MANAGER" });

    await supertest(app).patch("/api/v1/notifications/read-all").set("Authorization", `Bearer ${token}`);

    // Read-all must not reach past what the role can see, or a MANAGER would
    // silently clear HR's queue for them.
    const hrBroadcast = await NotificationModel.findOne({ audience: "hr" });
    expect(hrBroadcast.read).toBe(false);
    const employeeBroadcast = await NotificationModel.findOne({ audience: "employees" });
    expect(employeeBroadcast.read).toBe(true);
  });
});
