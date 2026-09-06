/**
 * overtime.integration.test.js — Attendance Overtime, milestone M2.
 *
 * The whole approval flow against a real (in-memory) database: apply,
 * assign, list, review, balance, cancel — plus every one of the 10
 * validation steps in HRMS_OVERTIME_PLAN.md §7.4.
 *
 * Time is driven through the DEMO_MODE X-App-Now header rather than the
 * host clock, for two reasons. It makes every assertion deterministic, and
 * it means this file cannot rot the way
 * generateMonthlyPayrollDraft.integration.test.js did — those tests
 * hardcoded an August 2026 period and silently started failing on
 * 2026-09-01, because their fixture employee was created at *run* time and
 * so fell outside the period. Here, "now" is pinned, and every date is
 * derived from it.
 *
 * The pinned instant is 09:00 on Wednesday 2026-07-01 in Asia/Ho_Chi_Minh
 * (= 02:00 UTC). That month's Saturdays — the 4th, 11th, 18th and 25th —
 * are all in the future from that point, which is what makes the monthly-cap
 * test cheap: 12h of rest-day overtime each, so four of them cross the 40h
 * ceiling in four requests instead of eleven.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import supertest from "supertest";
import { startDb, stopDb, clearDb, createApp } from "./testHelpers.js";
import { auth, seedPerformanceOrg, seedDepartmentManager } from "./performanceFixtures.js";

let dbAvailable = false;
let app;
let request;
let org;
let originalDemoMode;

/** 09:00 Vietnam, Wednesday 2026-07-01. */
const NOW = "2026-07-01T02:00:00.000Z";
/** 13:01 Vietnam on the same day — one minute past the application cutoff. */
const NOW_PAST_CUTOFF = "2026-07-01T06:01:00.000Z";

const TODAY = "2026-07-01"; // Wednesday
const TOMORROW = "2026-07-02"; // Thursday — a plain working day
const YESTERDAY = "2026-06-30";
const SATURDAYS = ["2026-07-04", "2026-07-11", "2026-07-18", "2026-07-25"];

beforeAll(async () => {
  try {
    await startDb();
    dbAvailable = true;
  } catch (err) {
    console.warn(`[overtime.integration] MongoDB unavailable — skipping.\n${err.message}`);
    return;
  }
  originalDemoMode = process.env.DEMO_MODE;
  process.env.DEMO_MODE = "true";
  app = await createApp();
  request = supertest(app);

  // The one-live-request-per-date rule is enforced by a partial unique
  // index; await its creation so the first test does not race it.
  const { default: OvertimeRequestModel } = await import("../model/OvertimeRequest.js");
  await OvertimeRequestModel.init();
});

afterAll(async () => {
  if (originalDemoMode === undefined) delete process.env.DEMO_MODE;
  else process.env.DEMO_MODE = originalDemoMode;
  await stopDb();
});

beforeEach(async () => {
  if (!dbAvailable) return;
  await clearDb();
  org = await seedPerformanceOrg(app);
});

const URL = "/api/v1/overtime-requests";

/** POST an application as `token`, with the clock pinned to `now`. */
function apply(token, body, now = NOW) {
  return request.post(URL).set(auth(token)).set("X-App-Now", now).send(body);
}

function assign(token, body, now = NOW) {
  return request.post(`${URL}/assign`).set(auth(token)).set("X-App-Now", now).send(body);
}

const weekdayEvening = (date = TOMORROW) => ({
  date,
  plannedStart: "18:00",
  plannedEnd: "22:00",
  reason: "release deploy",
});

const fullSaturday = (date) => ({
  date,
  plannedStart: "12:00",
  plannedEnd: "24:00",
  reason: "migration window",
});

async function makeHoliday(dateKey, name = "Test Holiday") {
  const { default: HolidayModel } = await import("../model/Holiday.js");
  const { utcMidnight } = await import("../utils/workday.js");
  return HolidayModel.create({ name, date: utcMidnight(dateKey), type: "public" });
}

async function makeApprovedLeave(employeeId, dateKey) {
  const { default: LeaveRequestModel } = await import("../model/LeaveRequest.js");
  const { utcMidnight } = await import("../utils/workday.js");
  return LeaveRequestModel.create({
    employee: employeeId,
    startDate: utcMidnight(dateKey),
    endDate: utcMidnight(dateKey),
    days: 1,
    type: "annual",
    status: "approved",
  });
}

describe("POST /overtime-requests — apply (§7.4 validation order)", () => {
  it("creates a pending request and derives minutes and day type", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const res = await apply(org.tokens.dev, weekdayEvening());

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("pending");
    expect(res.body.data.date).toBe(TOMORROW);
    expect(res.body.data.plannedMinutes).toBe(240);
    expect(res.body.data.plannedHours).toBe(4);
    expect(res.body.data.dayType).toBe("normal");
    expect(res.body.data.origin).toBe("self");
  });

  it("ignores an employeeId in the body — an employee always applies for themselves", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const res = await apply(org.tokens.dev, {
      ...weekdayEvening(),
      employeeId: String(org.employees.designer._id),
    });

    expect(res.status).toBe(201);
    expect(res.body.data.employeeId).toBe(String(org.employees.dev._id));
  });

  it("step 2 — rejects a date in the past", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const res = await apply(org.tokens.dev, weekdayEvening(YESTERDAY));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("OT_DATE_IN_PAST");
  });

  it("step 3 — accepts at 12:59 but rejects at 13:01 on the overtime date", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const before = await apply(org.tokens.dev, weekdayEvening(TODAY), "2026-07-01T05:59:00.000Z");
    expect(before.status).toBe(201);

    await clearDb();
    org = await seedPerformanceOrg(app);

    const after = await apply(org.tokens.dev, weekdayEvening(TODAY), NOW_PAST_CUTOFF);
    expect(after.status).toBe(409);
    expect(after.body.code).toBe("OT_APPLICATION_PAST_CUTOFF");
  });

  it("step 3 — the cutoff does not apply to a future date, at any hour", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const res = await apply(org.tokens.dev, weekdayEvening(TOMORROW), NOW_PAST_CUTOFF);
    expect(res.status).toBe(201);
  });

  it("step 3 — HR bypasses the cutoff so same-day overtime can still be recorded", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const res = await apply(org.tokens.hr, weekdayEvening(TODAY), NOW_PAST_CUTOFF);
    expect(res.status).toBe(201);
  });

  it("step 4 — rejects a second live request for the same date", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    expect((await apply(org.tokens.dev, weekdayEvening())).status).toBe(201);

    const dup = await apply(org.tokens.dev, weekdayEvening());
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe("OT_DUPLICATE_FOR_DATE");
  });

  it("step 4 — a rejected request frees the date for a corrected resubmission", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const first = await apply(org.tokens.dev, weekdayEvening());
    await request
      .patch(`${URL}/${first.body.data.id}/review`)
      .set(auth(org.tokens.hr))
      .send({ decision: "rejected", reviewNote: "Not this week." });

    // The unique index is partial on {pending, approved} precisely so this works.
    const second = await apply(org.tokens.dev, weekdayEvening());
    expect(second.status).toBe(201);
  });

  it("step 5 — rejects a date the employee is already on approved leave", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    await makeApprovedLeave(org.employees.dev._id, TOMORROW);

    const res = await apply(org.tokens.dev, weekdayEvening());
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("OT_ON_LEAVE_DAY");
  });

  it("step 6 — resolves a Saturday as a rest day and allows the whole 12h span", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const res = await apply(org.tokens.dev, fullSaturday(SATURDAYS[0]));

    expect(res.status).toBe(201);
    expect(res.body.data.dayType).toBe("restDay");
    expect(res.body.data.plannedMinutes).toBe(720);
  });

  it("step 6 — a public holiday outranks a rest day when it falls on a Saturday", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    await makeHoliday(SATURDAYS[0], "National Day (observed)");

    const res = await apply(org.tokens.dev, fullSaturday(SATURDAYS[0]));
    expect(res.status).toBe(201);
    expect(res.body.data.dayType).toBe("holiday");
  });

  it("step 7 — rejects a span that would cross midnight", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const res = await apply(org.tokens.dev, {
      date: TOMORROW,
      plannedStart: "22:00",
      plannedEnd: "02:00",
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("OT_CROSSES_MIDNIGHT");
  });

  it("step 8 — rejects more than 4h of overtime on a working day", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const res = await apply(org.tokens.dev, {
      date: TOMORROW,
      // 18:00-23:00, not 17:00-22:00: a pre-18:00 start now trips the
      // working-day boundary rule first, which would mask the cap under test.
      plannedStart: "18:00",
      plannedEnd: "23:00", // 5h
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("OT_EXCEEDS_DAILY_CAP");
    expect(res.body.params.cap).toBe(4);
  });

  it("step 8 — rejects more than 12h of total work on a rest day", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const res = await apply(org.tokens.dev, {
      date: SATURDAYS[0],
      plannedStart: "11:00",
      plannedEnd: "24:00", // 13h
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("OT_EXCEEDS_DAILY_CAP");
    expect(res.body.params.cap).toBe(12);
  });

  it("step 9 — rejects the request that would cross the 40h monthly cap", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    // Three full Saturdays = 36h, all accepted.
    for (const date of SATURDAYS.slice(0, 3)) {
      expect((await apply(org.tokens.dev, fullSaturday(date))).status).toBe(201);
    }
    // The fourth would make 48h.
    const res = await apply(org.tokens.dev, fullSaturday(SATURDAYS[3]));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("OT_EXCEEDS_MONTHLY_CAP");
    expect(res.body.params.cap).toBe(40);
    expect(res.body.params.used).toBe(36);
  });

  it("step 9 — a pending request consumes the monthly allowance, a rejected one releases it", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const created = [];
    for (const date of SATURDAYS.slice(0, 3)) {
      created.push((await apply(org.tokens.dev, fullSaturday(date))).body.data);
    }
    // Nothing has been approved, yet the cap already binds.
    expect((await apply(org.tokens.dev, fullSaturday(SATURDAYS[3]))).status).toBe(409);

    await request
      .patch(`${URL}/${created[0].id}/review`)
      .set(auth(org.tokens.hr))
      .send({ decision: "rejected" });

    expect((await apply(org.tokens.dev, fullSaturday(SATURDAYS[3]))).status).toBe(201);
  });

  it("returns a field-named 400 for a malformed body, before touching the database", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const res = await apply(org.tokens.dev, { date: TOMORROW, plannedStart: "6pm", plannedEnd: "25:00" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Start time|End time/);
  });

  it('accepts "24:00" as an end time but not as a start time', async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const ok = await apply(org.tokens.dev, fullSaturday(SATURDAYS[0]));
    expect(ok.status).toBe(201);
    expect(ok.body.data.plannedEnd).toBe("24:00");

    const bad = await apply(org.tokens.dev, {
      date: SATURDAYS[1], plannedStart: "24:00", plannedEnd: "24:00",
    });
    expect(bad.status).toBe(400);
  });
});

describe("GET /overtime-requests — role scoping", () => {
  async function seedOne(token, date) {
    return apply(token, weekdayEvening(date));
  }

  it("an employee sees only their own requests", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    await seedOne(org.tokens.dev, TOMORROW);
    await seedOne(org.tokens.designer, TOMORROW);

    const res = await request.get(URL).set(auth(org.tokens.dev));
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].employeeId).toBe(String(org.employees.dev._id));
  });

  it("a manager sees their own department only", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    await seedOne(org.tokens.dev, TOMORROW); // engineering
    await seedOne(org.tokens.designer, TOMORROW); // design

    const res = await request.get(URL).set(auth(org.tokens.manager));
    expect(res.status).toBe(200);
    const ids = res.body.items.map((i) => i.employeeId);
    expect(ids).toContain(String(org.employees.dev._id));
    expect(ids).not.toContain(String(org.employees.designer._id));
  });

  it("an admin sees everything", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    await seedOne(org.tokens.dev, TOMORROW);
    await seedOne(org.tokens.designer, TOMORROW);

    const res = await request.get(URL).set(auth(org.tokens.admin));
    expect(res.body.items).toHaveLength(2);
  });
});

describe("PATCH /overtime-requests/:id/review", () => {
  async function pending(token = org.tokens.dev) {
    const res = await apply(token, weekdayEvening());
    return res.body.data;
  }

  it("HR approves a pending request and notifies the employee", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const req0 = await pending();
    const res = await request
      .patch(`${URL}/${req0.id}/review`)
      .set(auth(org.tokens.hr))
      .send({ decision: "approved" });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("approved");

    const { default: NotificationModel } = await import("../model/Notification.js");
    const notified = await NotificationModel.findOne({ user: org.users.dev.user._id, titleKey: "overtimeApproved" });
    expect(notified).toBeTruthy();
  });

  it("a manager may review their own department but not another", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const own = await pending(org.tokens.dev);
    const other = (await apply(org.tokens.designer, weekdayEvening())).body.data;

    const ok = await request
      .patch(`${URL}/${own.id}/review`).set(auth(org.tokens.manager)).send({ decision: "approved" });
    expect(ok.status).toBe(200);

    const denied = await request
      .patch(`${URL}/${other.id}/review`).set(auth(org.tokens.manager)).send({ decision: "approved" });
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe("MANAGER_REVIEW_OUT_OF_DEPARTMENT");
  });

  it("respects the approveOvertimeRequests capability toggle for a manager", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { default: RolePermissionModel } = await import("../model/RolePermission.js");
    await RolePermissionModel.create({
      role: "MANAGER", capability: "approveOvertimeRequests", enabled: false,
    });

    const req0 = await pending();
    const res = await request
      .patch(`${URL}/${req0.id}/review`).set(auth(org.tokens.manager)).send({ decision: "approved" });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CAPABILITY_DISABLED");

    // HR is unaffected — the capability only ever narrows MANAGER.
    const hr = await request
      .patch(`${URL}/${req0.id}/review`).set(auth(org.tokens.hr)).send({ decision: "approved" });
    expect(hr.status).toBe(200);
  });

  it("refuses to review the same request twice", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const req0 = await pending();
    await request.patch(`${URL}/${req0.id}/review`).set(auth(org.tokens.hr)).send({ decision: "approved" });

    const again = await request
      .patch(`${URL}/${req0.id}/review`).set(auth(org.tokens.hr)).send({ decision: "rejected" });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("REVIEW_REQUEST_ALREADY_REVIEWED");
  });

  it("an employee cannot review anything", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const req0 = await pending();
    const res = await request
      .patch(`${URL}/${req0.id}/review`).set(auth(org.tokens.dev)).send({ decision: "approved" });
    expect(res.status).toBe(403);
  });
});

describe("POST /overtime-requests/assign", () => {
  it("HR assigns to several employees at once, marked as assigned", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const res = await assign(org.tokens.hr, {
      ...weekdayEvening(),
      employeeIds: [String(org.employees.dev._id), String(org.employees.designer._id)],
    });

    expect(res.status).toBe(201);
    expect(res.body.created).toHaveLength(2);
    expect(res.body.skipped).toHaveLength(0);
    expect(res.body.created.every((r) => r.origin === "assigned")).toBe(true);
    expect(res.body.created.every((r) => r.status === "pending")).toBe(true);
  });

  it("assigns past the cutoff — the demo's 13:01 HR path", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const res = await assign(
      org.tokens.hr,
      { ...weekdayEvening(TODAY), employeeIds: [String(org.employees.dev._id)] },
      NOW_PAST_CUTOFF,
    );
    expect(res.status).toBe(201);
    expect(res.body.created).toHaveLength(1);
  });

  it("reports per-employee failures without discarding the successes", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    // dev already has a live request for that date; designer does not.
    await apply(org.tokens.dev, weekdayEvening());

    const res = await assign(org.tokens.hr, {
      ...weekdayEvening(),
      employeeIds: [String(org.employees.dev._id), String(org.employees.designer._id)],
    });

    expect(res.status).toBe(201);
    expect(res.body.created).toHaveLength(1);
    expect(res.body.created[0].employeeId).toBe(String(org.employees.designer._id));
    expect(res.body.skipped).toHaveLength(1);
    expect(res.body.skipped[0].code).toBe("OT_DUPLICATE_FOR_DATE");
  });

  it("carries error params on a skipped entry so the client can interpolate", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    // Push dev over the monthly cap first, so the skip reason is a code whose
    // message interpolates {{cap}} rather than a bare sentence.
    for (const date of SATURDAYS.slice(0, 3)) {
      expect((await apply(org.tokens.dev, fullSaturday(date))).status).toBe(201);
    }

    const res = await assign(org.tokens.hr, {
      ...fullSaturday(SATURDAYS[3]),
      employeeIds: [String(org.employees.dev._id), String(org.employees.designer._id)],
    });

    expect(res.body.created).toHaveLength(1);
    const skipped = res.body.skipped[0];
    expect(skipped.code).toBe("OT_EXCEEDS_MONTHLY_CAP");
    // Without params the assign panel renders the literal "{{cap}}".
    expect(skipped.params).toBeDefined();
    expect(skipped.params.cap).toBe(40);
  });

  it("still reports reasons when every employee is skipped", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    // Both already have a live request for that date.
    await apply(org.tokens.dev, weekdayEvening());
    await apply(org.tokens.designer, weekdayEvening());

    const res = await assign(org.tokens.hr, {
      ...weekdayEvening(),
      employeeIds: [String(org.employees.dev._id), String(org.employees.designer._id)],
    });

    // 200, not 4xx: the request was well-formed and produced a full answer.
    // Returning success:false here would make the client throw and discard
    // `skipped`, losing the only explanation of what happened.
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.created).toHaveLength(0);
    expect(res.body.skipped).toHaveLength(2);
    expect(res.body.skipped.every((s) => s.code === "OT_DUPLICATE_FOR_DATE")).toBe(true);
  });

  it("scopes a manager to their own department", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const res = await assign(org.tokens.manager, {
      ...weekdayEvening(),
      employeeIds: [String(org.employees.dev._id), String(org.employees.designer._id)],
    });

    expect(res.body.created).toHaveLength(1);
    expect(res.body.created[0].employeeId).toBe(String(org.employees.dev._id));
    expect(res.body.skipped[0].code).toBe("OT_ASSIGN_OUT_OF_DEPARTMENT");
  });

  it("refuses an employee outright", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const res = await assign(org.tokens.dev, {
      ...weekdayEvening(),
      employeeIds: [String(org.employees.designer._id)],
    });
    expect(res.status).toBe(403);
  });

  it("rejects an empty selection", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const res = await assign(org.tokens.hr, { ...weekdayEvening(), employeeIds: [] });
    expect(res.status).toBe(400);
  });
});

describe("GET /overtime-requests/balance", () => {
  const balance = (token, query = "", now = NOW) =>
    request.get(`${URL}/balance${query}`).set(auth(token)).set("X-App-Now", now);

  it("starts at zero against the statutory caps", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const res = await balance(org.tokens.dev, "?year=2026&month=7");

    expect(res.status).toBe(200);
    expect(res.body.data.monthUsed).toBe(0);
    expect(res.body.data.monthCap).toBe(40);
    expect(res.body.data.yearCap).toBe(200);
  });

  it("counts pending and approved requests, and excludes rejected ones", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const first = (await apply(org.tokens.dev, fullSaturday(SATURDAYS[0]))).body.data;
    await apply(org.tokens.dev, fullSaturday(SATURDAYS[1]));

    let res = await balance(org.tokens.dev, "?year=2026&month=7");
    expect(res.body.data.monthUsed).toBe(24);
    expect(res.body.data.monthRemaining).toBe(16);

    await request
      .patch(`${URL}/${first.id}/review`).set(auth(org.tokens.hr)).send({ decision: "rejected" });

    res = await balance(org.tokens.dev, "?year=2026&month=7");
    expect(res.body.data.monthUsed).toBe(12);
  });

  it("defaults to the month of the current (demo) clock", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const res = await balance(org.tokens.dev);
    expect(res.body.data.year).toBe(2026);
    expect(res.body.data.month).toBe(7);
  });

  it("ignores an employeeId from an employee, and scopes a manager to their department", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    await apply(org.tokens.designer, fullSaturday(SATURDAYS[0]));

    // The employee's own (empty) balance, not the designer's 12h.
    const asEmployee = await balance(
      org.tokens.dev, `?year=2026&month=7&employeeId=${org.employees.designer._id}`,
    );
    expect(asEmployee.body.data.monthUsed).toBe(0);

    const outOfDept = await balance(
      org.tokens.manager, `?year=2026&month=7&employeeId=${org.employees.designer._id}`,
    );
    expect(outOfDept.status).toBe(403);
    expect(outOfDept.body.code).toBe("OT_BALANCE_ACCESS_DENIED");
  });
});

describe("DELETE /overtime-requests/:id — withdraw", () => {
  it("the owner cancels their own pending request and frees the date", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const req0 = (await apply(org.tokens.dev, weekdayEvening())).body.data;

    const res = await request
      .delete(`${URL}/${req0.id}`).set(auth(org.tokens.dev)).set("X-App-Now", NOW);
    expect(res.status).toBe(200);

    // Withdrawing is not a rejection — it leaves no row behind at all.
    const list = await request.get(URL).set(auth(org.tokens.admin));
    expect(list.body.items).toHaveLength(0);

    expect((await apply(org.tokens.dev, weekdayEvening())).status).toBe(201);
  });

  it("refuses someone else's request", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const req0 = (await apply(org.tokens.dev, weekdayEvening())).body.data;

    const res = await request
      .delete(`${URL}/${req0.id}`).set(auth(org.tokens.designer)).set("X-App-Now", NOW);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("OT_CANCEL_NOT_OWNER");
  });

  it("refuses an already-reviewed request", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const req0 = (await apply(org.tokens.dev, weekdayEvening())).body.data;
    await request.patch(`${URL}/${req0.id}/review`).set(auth(org.tokens.hr)).send({ decision: "approved" });

    const res = await request
      .delete(`${URL}/${req0.id}`).set(auth(org.tokens.dev)).set("X-App-Now", NOW);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("OT_CANCEL_NOT_PENDING");
  });

  it("refuses once the cutoff has passed on the overtime date", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const req0 = (await apply(org.tokens.dev, weekdayEvening(TODAY), NOW)).body.data;

    const res = await request
      .delete(`${URL}/${req0.id}`).set(auth(org.tokens.dev)).set("X-App-Now", NOW_PAST_CUTOFF);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("OT_CANCEL_PAST_CUTOFF");
  });
});
/* ══════════════════════════════════════════════════
   M3 — approval writes hours onto the attendance record

   The case worth protecting is the LATE approval. With nothing approved at
   23:00 the close job shuts the day at 18:00 and overwrites checkOut, so by
   the time HR approves the next morning, checkOut no longer shows when the
   employee actually left. rawCheckOut does — and whether it is set is exactly
   what separates "credit the hours they clocked" from "credit what was
   planned, and flag it".
══════════════════════════════════════════════════ */
describe("PATCH /:id/review — attendance side effect (M3)", () => {
  async function makeAttendance(employee, dateKey, overrides = {}) {
    const { default: AttendanceModel } = await import("../model/Attendance.js");
    const { utcMidnight } = await import("../utils/workday.js");
    return AttendanceModel.create({
      employee: employee._id,
      date: utcMidnight(dateKey),
      checkIn: "09:00",
      status: "present",
      ...overrides,
    });
  }

  const reload = async (id) => {
    const { default: AttendanceModel } = await import("../model/Attendance.js");
    return AttendanceModel.findById(id);
  };

  async function applyAndApprove(attendanceOverrides) {
    const record = await makeAttendance(org.employees.dev, TOMORROW, attendanceOverrides);
    const created = (await apply(org.tokens.dev, weekdayEvening())).body.data;
    const res = await request
      .patch(`${URL}/${created.id}/review`)
      .set(auth(org.tokens.hr))
      .send({ decision: "approved" });
    expect(res.status).toBe(200);
    return { record, created };
  }

  it("credits real clocked hours when the close job already overwrote checkOut", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    // Exactly what the job leaves behind when nothing was approved in time:
    // checkOut forced to 18:00, but rawCheckOut still remembering 21:30.
    const { record, created } = await applyAndApprove({ checkOut: "18:00", rawCheckOut: "21:30" });

    const after = await reload(record._id);
    expect(after.otMinutes).toBe(210); // 3.5h actually worked, not the planned 4h
    expect(after.otEvidence).toBe("clocked");
    expect(after.otDayType).toBe("normal");
    expect(String(after.otRequest)).toBe(created.id);
    expect(after.otUnapprovedMinutes).toBe(0);
  });

  it("falls back to the planned span when there is no clock evidence", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    // Never clocked out; the job closed the day at the 18:00 default.
    const { record } = await applyAndApprove({ checkOut: "18:00", rawCheckOut: null });

    const after = await reload(record._id);
    // Nothing past 18:00 is evidenced, so nothing is credited yet - the close
    // job will extend checkOut to the planned end on its next run.
    expect(after.otMinutes).toBe(0);
    expect(after.otEvidence).toBeNull();
  });

  it("moves unapproved minutes into paid ones on approval", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { record } = await applyAndApprove({ checkOut: "21:00", rawCheckOut: "21:00" });

    const after = await reload(record._id);
    expect(after.otMinutes).toBe(180);
    expect(after.otUnapprovedMinutes).toBe(0);
    expect(after.otEvidence).toBe("clocked");
  });

  it("never pays beyond the approved window", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { record } = await applyAndApprove({ checkOut: "23:30", rawCheckOut: "23:30" });

    const after = await reload(record._id);
    expect(after.otMinutes).toBe(240); // the approved 18:00-22:00
    expect(after.otUnapprovedMinutes).toBe(90); // 22:00-23:30, recorded not paid
  });

  it("is a no-op when no attendance record exists for that day yet", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const created = (await apply(org.tokens.dev, weekdayEvening())).body.data;

    // Approving ahead of the day must not fail just because nobody has clocked in.
    const res = await request
      .patch(`${URL}/${created.id}/review`)
      .set(auth(org.tokens.hr))
      .send({ decision: "approved" });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("approved");
  });

  it("rejecting leaves the attendance record untouched", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const record = await makeAttendance(org.employees.dev, TOMORROW, {
      checkOut: "21:00", rawCheckOut: "21:00",
    });
    const created = (await apply(org.tokens.dev, weekdayEvening())).body.data;

    await request
      .patch(`${URL}/${created.id}/review`)
      .set(auth(org.tokens.hr))
      .send({ decision: "rejected" });

    const after = await reload(record._id);
    expect(after.otMinutes).toBe(0);
    expect(after.otRequest).toBeNull();
  });
});

describe("POST /attendance/check-out — rawCheckOut (M3)", () => {
  it("records the employee's own clock-out as evidence", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { default: AttendanceModel } = await import("../model/Attendance.js");
    const { utcMidnight } = await import("../utils/workday.js");

    await AttendanceModel.create({
      employee: org.employees.dev._id,
      date: utcMidnight(TODAY),
      checkIn: "09:00",
      status: "present",
    });

    const res = await request
      .post("/api/v1/attendance/check-out")
      .set(auth(org.tokens.dev))
      .send({ employeeId: String(org.employees.dev._id), date: TODAY, checkOut: "21:30" });

    expect(res.status).toBe(200);

    const after = await AttendanceModel.findOne({
      employee: org.employees.dev._id, date: utcMidnight(TODAY),
    });
    // rawCheckOut is what survives the close job overwriting checkOut.
    expect(after.rawCheckOut).toBe("21:30");
    expect(after.checkOut).toBe("21:30");
    // Nothing approved, so it is recorded as unapproved overtime.
    expect(after.otUnapprovedMinutes).toBe(210);
    expect(after.otMinutes).toBe(0);
  });
});

describe("POST /overtime-requests - working-day start boundary", () => {
  it("rejects a working-day request that starts before 18:00", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    // 17:00-20:00 is 3h and clears the 4h daily cap, but only 18:00-20:00
    // would ever be paid - the recompute clamps to the overtime boundary.
    // Accepting a request the engine will silently shorten is the bug.
    const res = await apply(org.tokens.dev, {
      date: TOMORROW, plannedStart: "17:00", plannedEnd: "20:00",
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("OT_STARTS_BEFORE_WINDOW");
    expect(res.body.params.start).toBe("18:00");
  });

  it("accepts a working-day request starting exactly at 18:00", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const res = await apply(org.tokens.dev, {
      date: TOMORROW, plannedStart: "18:00", plannedEnd: "20:00",
    });
    expect(res.status).toBe(201);
  });

  it("does not apply the rule to a rest day, where the whole span is overtime", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const res = await apply(org.tokens.dev, {
      date: SATURDAYS[0], plannedStart: "09:00", plannedEnd: "17:00",
    });
    expect(res.status).toBe(201);
    expect(res.body.data.dayType).toBe("restDay");
  });
});

describe("GET /overtime-requests - attendance evidence on queue rows", () => {
  async function makeAttendance(employee, dateKey, overrides) {
    const { default: AttendanceModel } = await import("../model/Attendance.js");
    const { utcMidnight } = await import("../utils/workday.js");
    return AttendanceModel.create({
      employee: employee._id,
      date: utcMidnight(dateKey),
      checkIn: "09:00",
      status: "present",
      ...overrides,
    });
  }

  it("attaches otEvidence from the attendance record, not the request", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    // The request records what was ASKED FOR; the attendance record what
    // actually happened. The queue's warning triangle needs the latter, and
    // without this join the field is simply absent from the payload - so the
    // flag renders nothing at all, silently.
    await makeAttendance(org.employees.dev, TOMORROW, {
      checkOut: "22:00", rawCheckOut: "22:00",
      otMinutes: 240, otNightMinutes: 0, otUnapprovedMinutes: 30,
      otDayType: "normal", otEvidence: "clocked",
    });
    await apply(org.tokens.dev, weekdayEvening());

    const res = await request.get(`${URL}?status=pending`).set(auth(org.tokens.hr));
    const row = res.body.items.find((i) => i.employeeId === String(org.employees.dev._id));

    expect(row.otEvidence).toBe("clocked");
    expect(row.actualHours).toBe(4);
    expect(row.unapprovedHours).toBe(0.5);
  });

  it("reports null evidence when no attendance record exists yet", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    await apply(org.tokens.dev, weekdayEvening());

    const res = await request.get(`${URL}?status=pending`).set(auth(org.tokens.hr));
    const row = res.body.items.find((i) => i.employeeId === String(org.employees.dev._id));

    // Null, not undefined: the field is always present so the client can
    // decide, rather than having to distinguish "absent" from "none".
    expect(row.otEvidence).toBeNull();
    expect(row.actualHours).toBe(0);
  });

  it("does not match another employee's record for the same date", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    await makeAttendance(org.employees.designer, TOMORROW, {
      checkOut: "22:00", rawCheckOut: "22:00",
      otMinutes: 240, otDayType: "normal", otEvidence: "clocked",
    });
    await apply(org.tokens.dev, weekdayEvening());

    const res = await request.get(`${URL}?status=pending`).set(auth(org.tokens.hr));
    const row = res.body.items.find((i) => i.employeeId === String(org.employees.dev._id));
    expect(row.otEvidence).toBeNull();
  });
});

describe("employment status — overtime may only go to someone payroll pays", () => {
  async function setStatus(employee, status) {
    const { default: EmployeeModel } = await import("../model/Employee.js");
    await EmployeeModel.updateOne({ _id: employee._id }, { status });
  }

  const loadRequest = async (id) => {
    const { default: OvertimeRequestModel } = await import("../model/OvertimeRequest.js");
    return OvertimeRequestModel.findById(id);
  };

  const loadAttendance = async (employee, dateKey) => {
    const { default: AttendanceModel } = await import("../model/Attendance.js");
    const { utcMidnight } = await import("../utils/workday.js");
    return AttendanceModel.findOne({ employee: employee._id, date: utcMidnight(dateKey) });
  };

  it("refuses an application from a terminated employee", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    await setStatus(org.employees.dev, "terminated");

    const res = await apply(org.tokens.dev, weekdayEvening());
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("OT_EMPLOYEE_NOT_EMPLOYED");
    expect(res.body.params.status).toBe("terminated");
  });

  it("still allows an on-leave employee — payroll pays them", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    // "on-leave" is an employment status, not a booked day off. Payroll
    // includes it (PAYABLE_EMPLOYEE_STATUSES), so overtime must too; a
    // specific approved-leave DATE is what step 5 rejects, separately.
    await setStatus(org.employees.dev, "on-leave");

    const res = await apply(org.tokens.dev, weekdayEvening());
    expect(res.status).toBe(201);
  });

  it("runs before the date checks — the cheapest failure is the one reported", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    // Both rules are broken here. Step 1b is meant to win, so a terminated
    // employee is never told to go fix their date first.
    await setStatus(org.employees.dev, "terminated");

    const res = await apply(org.tokens.dev, weekdayEvening(YESTERDAY));
    expect(res.body.code).toBe("OT_EMPLOYEE_NOT_EMPLOYED");
  });

  it("skips a terminated employee in a bulk assign without losing the rest", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    await setStatus(org.employees.designer, "terminated");

    const res = await assign(org.tokens.hr, {
      ...weekdayEvening(),
      employeeIds: [String(org.employees.dev._id), String(org.employees.designer._id)],
    });

    expect(res.status).toBe(201);
    expect(res.body.created).toHaveLength(1);
    expect(res.body.created[0].employeeId).toBe(String(org.employees.dev._id));
    expect(res.body.skipped).toHaveLength(1);
    expect(res.body.skipped[0].employeeId).toBe(String(org.employees.designer._id));
    expect(res.body.skipped[0].code).toBe("OT_EMPLOYEE_NOT_EMPLOYED");
  });

  it("refuses approval when the employee was terminated after applying", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    // The gap the application-time check alone cannot close: nothing bounds
    // how long a request may sit in the queue, and employment can end while
    // it does.
    const created = (await apply(org.tokens.dev, weekdayEvening())).body.data;
    await setStatus(org.employees.dev, "terminated");

    const res = await request
      .patch(`${URL}/${created.id}/review`)
      .set(auth(org.tokens.hr))
      .send({ decision: "approved" });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("OT_EMPLOYEE_NOT_EMPLOYED");
  });

  it("leaves that request pending, with nothing written to attendance", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    // onApprove runs before request.save(), so a throw must roll the whole
    // decision back — not leave "approved" persisted with the side effect
    // skipped, which is the shape of bug that produces unpayable hours.
    const { default: AttendanceModel } = await import("../model/Attendance.js");
    const { utcMidnight } = await import("../utils/workday.js");
    await AttendanceModel.create({
      employee: org.employees.dev._id,
      date: utcMidnight(TOMORROW),
      checkIn: "09:00",
      checkOut: "22:00",
      rawCheckOut: "22:00",
      status: "present",
    });

    const created = (await apply(org.tokens.dev, weekdayEvening())).body.data;
    await setStatus(org.employees.dev, "terminated");
    await request
      .patch(`${URL}/${created.id}/review`)
      .set(auth(org.tokens.hr))
      .send({ decision: "approved" });

    expect((await loadRequest(created.id)).status).toBe("pending");
    expect((await loadAttendance(org.employees.dev, TOMORROW)).otMinutes).toBe(0);
  });

  it("still allows rejecting it, so the request can be closed out", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    // Blocking approval must not strand the request: without a working
    // rejection the live-status row would keep the date permanently blocked.
    const created = (await apply(org.tokens.dev, weekdayEvening())).body.data;
    await setStatus(org.employees.dev, "terminated");

    const res = await request
      .patch(`${URL}/${created.id}/review`)
      .set(auth(org.tokens.hr))
      .send({ decision: "rejected", reviewNote: "left the company" });

    expect(res.status).toBe(200);
    expect((await loadRequest(created.id)).status).toBe("rejected");
  });
});

/* ══════════════════════════════════════════════════════════════════
   Who is told a request arrived.

   The department's manager approves overtime for their own team
   (router/overtimeRequestRouter.js), but MANAGER is not in the "hr"
   broadcast audience — a broadcast carries no department, so it cannot
   be scoped. notifyHR alone therefore reached everyone EXCEPT the person
   who had to act, while leave (the identical workflow) notified them.
   ══════════════════════════════════════════════════════════════════ */
describe("POST /overtime-requests — reviewers are notified", () => {
  async function notices(filter = {}) {
    const { default: NotificationModel } = await import("../model/Notification.js");
    return NotificationModel.find({ titleKey: "overtimeRequestSubmitted", ...filter });
  }


  it("tells the requester's own department manager, addressed not broadcast", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    expect((await apply(org.tokens.dev, weekdayEvening())).status).toBe(201);

    const addressed = await notices({ user: { $ne: null } });
    expect(addressed).toHaveLength(1);
    expect(String(addressed[0].user)).toBe(String(org.users.manager.userId));
  });

  it("still notifies the unscoped HR tier as before", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    await apply(org.tokens.dev, weekdayEvening());

    // The existing broadcast is unchanged — this is an addition, not a swap.
    const broadcast = await notices({ user: null });
    expect(broadcast).toHaveLength(1);
    expect(broadcast[0].audience).toBe("hr");
  });

  it("does not tell a manager from another department", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const designManager = await seedDepartmentManager(app, org.departments.design);

    await apply(org.tokens.dev, weekdayEvening());

    // Engineering's request is not Design's business, and that manager has
    // no authority to approve it. This is the leak leaveRequestController
    // still has, and the reason this fan-out is department-scoped.
    const recipients = (await notices({ user: { $ne: null } })).map((n) => String(n.user));
    expect(recipients).toContain(String(org.users.manager.userId));
    expect(recipients).not.toContain(String(designManager.user._id));
  });

  it("does not notify a manager applying for their own overtime", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    expect((await apply(org.tokens.manager, weekdayEvening())).status).toBe(201);

    // They already know. HR/ADMIN still get the broadcast above.
    expect(await notices({ user: { $ne: null } })).toHaveLength(0);
    expect(await notices({ user: null })).toHaveLength(1);
  });

  it("does not fail when the requester's department has no manager", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    // Design has no manager in the base fixture. An empty recipient list is a
    // normal state, not an error — and must not fall back to a broadcast.
    expect((await apply(org.tokens.designer, weekdayEvening())).status).toBe(201);

    expect(await notices({ user: { $ne: null } })).toHaveLength(0);
    expect(await notices({ user: null })).toHaveLength(1);
  });

  it("carries the same copy to both audiences", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    await apply(org.tokens.dev, weekdayEvening());

    const [addressed] = await notices({ user: { $ne: null } });
    const [broadcast] = await notices({ user: null });
    // One notice object, two recipient sets — the manager must not get a
    // subtly different message from HR.
    expect(addressed.title).toBe(broadcast.title);
    expect(addressed.messageKey).toBe(broadcast.messageKey);
    expect(addressed.params.employeeName).toBe(broadcast.params.employeeName);
    expect(addressed.link).toBe("/attendance");
  });
});
