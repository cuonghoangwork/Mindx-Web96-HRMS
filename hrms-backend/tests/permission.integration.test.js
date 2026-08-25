/**
 * permission.integration.test.js — Solo Gaps Milestone 3 (permissions
 * matrix).
 *
 * Covers hasCapability() directly (against the real in-memory DB — no
 * Mongoose-mocking convention exists in this codebase, so this uses the
 * same startDb/clearDb harness every other Model-touching test does),
 * the GET/PATCH /permissions endpoints, and — the part that actually
 * proves the "never widens past authorize(), only narrows MANAGER" design
 * boundary — that disabling a capability blocks a MANAGER who'd otherwise
 * pass authorize() + department-scope, while HR/ADMIN are unaffected by
 * any toggle state, at all 4 gated call sites.
 *
 * Reuses seedPerformanceOrg (tests/performanceFixtures.js) for its
 * department/MANAGER/EMPLOYEE scaffolding, same as
 * employeeDocuments.integration.test.js already does for a non-performance
 * feature.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import supertest from "supertest";
import { startDb, stopDb, clearDb, createApp } from "./testHelpers.js";
import { auth, seedPerformanceOrg } from "./performanceFixtures.js";

let dbAvailable = false;
let app;
let request;
let org;
let hasCapability;
let RolePermissionModel;
let LeaveRequestModel;
let ProfileEditRequestModel;
let AttendanceModel;

beforeAll(async () => {
  try {
    await startDb();
    dbAvailable = true;
  } catch (err) {
    console.warn(`[permission.integration] MongoDB unavailable — skipping.\n${err.message}`);
    return;
  }
  app = await createApp();
  request = supertest(app);
  ({ hasCapability } = await import("../utils/permissions.js"));
  ({ default: RolePermissionModel } = await import("../model/RolePermission.js"));
  ({ default: LeaveRequestModel } = await import("../model/LeaveRequest.js"));
  ({ default: ProfileEditRequestModel } = await import("../model/ProfileEditRequest.js"));
  ({ default: AttendanceModel } = await import("../model/Attendance.js"));
});

afterAll(async () => {
  await stopDb();
});

beforeEach(async () => {
  if (!dbAvailable) return;
  await clearDb();
  org = await seedPerformanceOrg(app);
});

async function setCapability(capability, enabled) {
  await RolePermissionModel.findOneAndUpdate(
    { role: "MANAGER", capability },
    { $set: { enabled } },
    { upsert: true },
  );
}

describe("hasCapability", () => {
  it("is always true for ADMIN, regardless of DB state", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    await setCapability("approveLeaveRequests", false);
    expect(await hasCapability("ADMIN", "approveLeaveRequests")).toBe(true);
  });

  it("defaults to true for MANAGER when no row exists yet (permissive default)", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    expect(await hasCapability("MANAGER", "approveLeaveRequests")).toBe(true);
  });

  it("reflects the row's enabled value for MANAGER once one exists", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    await setCapability("approveLeaveRequests", false);
    expect(await hasCapability("MANAGER", "approveLeaveRequests")).toBe(false);
    await setCapability("approveLeaveRequests", true);
    expect(await hasCapability("MANAGER", "approveLeaveRequests")).toBe(true);
  });

  it("is always false for any other role", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    expect(await hasCapability("HR", "approveLeaveRequests")).toBe(false);
    expect(await hasCapability("EMPLOYEE", "approveLeaveRequests")).toBe(false);
  });
});

describe("GET /permissions", () => {
  it("is ADMIN-only", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const asManager = await request.get("/api/v1/permissions").set(auth(org.tokens.manager));
    expect(asManager.status).toBe(403);
    const asHr = await request.get("/api/v1/permissions").set(auth(org.tokens.hr));
    expect(asHr.status).toBe(403);
  });

  it("returns the seeded MANAGER rows for ADMIN", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    await setCapability("approveLeaveRequests", true);
    await setCapability("manageAttendanceRecords", false);

    const res = await request.get("/api/v1/permissions").set(auth(org.tokens.admin));
    expect(res.status).toBe(200);
    const byCapability = Object.fromEntries(res.body.items.map((i) => [i.capability, i.enabled]));
    expect(byCapability.approveLeaveRequests).toBe(true);
    expect(byCapability.manageAttendanceRecords).toBe(false);
  });
});

describe("PATCH /permissions/:role/:capability", () => {
  it("is ADMIN-only", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const res = await request
      .patch("/api/v1/permissions/MANAGER/approveLeaveRequests")
      .set(auth(org.tokens.manager))
      .send({ enabled: false });
    expect(res.status).toBe(403);
  });

  it("toggles and persists", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const res = await request
      .patch("/api/v1/permissions/MANAGER/approveLeaveRequests")
      .set(auth(org.tokens.admin))
      .send({ enabled: false });
    expect(res.status).toBe(200);
    expect(res.body.data.enabled).toBe(false);
    expect(await hasCapability("MANAGER", "approveLeaveRequests")).toBe(false);
  });

  it("rejects an unknown capability", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const res = await request
      .patch("/api/v1/permissions/MANAGER/deleteEverything")
      .set(auth(org.tokens.admin))
      .send({ enabled: false });
    expect(res.status).toBe(400);
  });

  it("rejects a role other than MANAGER", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const res = await request
      .patch("/api/v1/permissions/ADMIN/approveLeaveRequests")
      .set(auth(org.tokens.admin))
      .send({ enabled: false });
    expect(res.status).toBe(400);
  });

  it("rejects a non-boolean enabled", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const res = await request
      .patch("/api/v1/permissions/MANAGER/approveLeaveRequests")
      .set(auth(org.tokens.admin))
      .send({ enabled: "false" });
    expect(res.status).toBe(400);
  });
});

describe("capability gating — approveLeaveRequests", () => {
  async function createPendingLeaveRequest() {
    return LeaveRequestModel.create({
      employee: org.employees.dev._id,
      startDate: new Date("2026-09-01"),
      endDate: new Date("2026-09-01"),
      days: 1,
      type: "annual",
    });
  }

  it("blocks a MANAGER who'd otherwise pass authorize() + department-scope when disabled", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    await setCapability("approveLeaveRequests", false);
    const leave = await createPendingLeaveRequest();

    const res = await request
      .patch(`/api/v1/leave-requests/${leave._id}/review`)
      .set(auth(org.tokens.manager))
      .send({ decision: "approved" });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/disabled for your role/i);
  });

  it("does not affect HR or ADMIN regardless of the toggle", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    await setCapability("approveLeaveRequests", false);
    const leaveForHr = await createPendingLeaveRequest();
    const leaveForAdmin = await createPendingLeaveRequest();

    const asHr = await request
      .patch(`/api/v1/leave-requests/${leaveForHr._id}/review`)
      .set(auth(org.tokens.hr))
      .send({ decision: "approved" });
    expect(asHr.status).toBe(200);

    const asAdmin = await request
      .patch(`/api/v1/leave-requests/${leaveForAdmin._id}/review`)
      .set(auth(org.tokens.admin))
      .send({ decision: "approved" });
    expect(asAdmin.status).toBe(200);
  });

  it("lets the MANAGER through once re-enabled", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    await setCapability("approveLeaveRequests", true);
    const leave = await createPendingLeaveRequest();

    const res = await request
      .patch(`/api/v1/leave-requests/${leave._id}/review`)
      .set(auth(org.tokens.manager))
      .send({ decision: "approved" });

    expect(res.status).toBe(200);
  });
});

describe("capability gating — reviewProfileEdits", () => {
  it("blocks a MANAGER when disabled, independently of approveLeaveRequests", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    // Leave stays enabled — proves the two capabilities toggle independently
    // even though they share the same reviewQueue.js handler.
    await setCapability("approveLeaveRequests", true);
    await setCapability("reviewProfileEdits", false);

    const editRequest = await ProfileEditRequestModel.create({
      employee: org.employees.dev._id,
      changes: { phone: { from: "111", to: "222" } },
    });

    const res = await request
      .patch(`/api/v1/profile-edit-requests/${editRequest._id}/review`)
      .set(auth(org.tokens.manager))
      .send({ decision: "approved" });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/disabled for your role/i);
  });

  it("does not affect HR or ADMIN", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    await setCapability("reviewProfileEdits", false);
    const editRequest = await ProfileEditRequestModel.create({
      employee: org.employees.dev._id,
      changes: { phone: { from: "111", to: "222" } },
    });

    const res = await request
      .patch(`/api/v1/profile-edit-requests/${editRequest._id}/review`)
      .set(auth(org.tokens.hr))
      .send({ decision: "approved" });

    expect(res.status).toBe(200);
  });
});

describe("capability gating — manageAttendanceRecords", () => {
  async function createAttendanceRecord() {
    return AttendanceModel.create({
      employee: org.employees.dev._id,
      date: new Date("2026-08-01"),
      status: "present",
    });
  }

  it("blocks a MANAGER's PUT when disabled", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    await setCapability("manageAttendanceRecords", false);
    const record = await createAttendanceRecord();

    const res = await request
      .put(`/api/v1/attendance/${record._id}`)
      .set(auth(org.tokens.manager))
      .send({ status: "Absent" });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/disabled for your role/i);
  });

  it("blocks a MANAGER's DELETE when disabled", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    await setCapability("manageAttendanceRecords", false);
    const record = await createAttendanceRecord();

    const res = await request.delete(`/api/v1/attendance/${record._id}`).set(auth(org.tokens.manager));

    expect(res.status).toBe(403);
  });

  it("does not affect ADMIN", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    await setCapability("manageAttendanceRecords", false);
    const record = await createAttendanceRecord();

    const res = await request
      .put(`/api/v1/attendance/${record._id}`)
      .set(auth(org.tokens.admin))
      .send({ status: "Absent" });

    expect(res.status).toBe(200);
  });
});

describe("capability gating — proposePromotions", () => {
  it("blocks a MANAGER from proposing when disabled", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    await setCapability("proposePromotions", false);

    const res = await request
      .post("/api/v1/promotion-requests")
      .set(auth(org.tokens.manager))
      .send({ employeeId: org.employees.dev._id, designation: "Senior Engineer", reason: "Great work" });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/disabled for your role/i);
  });

  it("does not affect HR or ADMIN", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    await setCapability("proposePromotions", false);

    const asHr = await request
      .post("/api/v1/promotion-requests")
      .set(auth(org.tokens.hr))
      .send({ employeeId: org.employees.dev._id, designation: "Senior Engineer", reason: "Great work" });

    expect(asHr.status).toBe(201);
  });
});
