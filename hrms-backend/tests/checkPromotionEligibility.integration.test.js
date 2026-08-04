/**
 * checkPromotionEligibility.integration.test.js
 *
 * Covers task 2.4 (jobs/checkPromotionEligibility.js) and the connected
 * pieces of 2.5 (promotionRequestController.js) that only make sense
 * end-to-end against a real database:
 *   - An employee who has completed the tenure threshold for their level
 *     gets a *pending* PromotionRequest auto-created — never auto-promoted.
 *   - The job never re-flags the same employee/level transition twice.
 *   - Approving a system-flagged request actually updates the employee's
 *     positionLevel and resets levelStartDate.
 *   - An employee short of the threshold is left alone.
 *
 * Uses the same in-memory MongoDB harness as closeAttendanceDay.integration.test.js.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startDb, stopDb, clearDb } from "./testHelpers.js";

let dbAvailable = false;

beforeAll(async () => {
  try {
    await startDb();
    dbAvailable = true;
  } catch (err) {
    console.warn(`[checkPromotionEligibility.integration] MongoDB unavailable — skipping.\n${err.message}`);
  }
});

afterAll(async () => {
  await stopDb();
});

beforeEach(async () => {
  if (dbAvailable) await clearDb();
});

async function makeEmployee(overrides = {}) {
  const { default: EmployeeModel } = await import("../model/Employee.js");
  return EmployeeModel.create({
    employeeId: overrides.employeeId ?? `EMP${Math.floor(Math.random() * 100000)}`,
    name: overrides.name ?? "Test Employee",
    email: overrides.email ?? `test${Math.random()}@hrms.com`,
    status: "active",
    positionLevel: overrides.positionLevel ?? "Intern",
    levelStartDate: overrides.levelStartDate ?? new Date("2026-01-01"),
    ...overrides,
  });
}

describe("checkPromotionEligibility (task 2.4)", () => {
  it("auto-flags an Intern who has completed 2 months as eligible for Full-time", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { checkPromotionEligibility } = await import("../jobs/checkPromotionEligibility.js");
    const { default: PromotionRequestModel } = await import("../model/PromotionRequest.js");

    const employee = await makeEmployee({ positionLevel: "Intern", levelStartDate: new Date("2026-01-01") });

    const result = await checkPromotionEligibility({ asOf: new Date("2026-03-01") });
    expect(result.flagged).toBe(1);

    const request = await PromotionRequestModel.findOne({ employee: employee._id });
    expect(request).toBeTruthy();
    expect(request.status).toBe("pending");
    expect(request.systemGenerated).toBe(true);
    expect(request.proposedPositionLevel).toBe("Full-time");
    expect(request.requestedBy).toBeNull();

    const { default: EmployeeModel } = await import("../model/Employee.js");
    const stillIntern = await EmployeeModel.findById(employee._id);
    expect(stillIntern.positionLevel).toBe("Intern");
  });

  it("does not flag an Intern who is 1 day short of 2 months", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { checkPromotionEligibility } = await import("../jobs/checkPromotionEligibility.js");

    await makeEmployee({ positionLevel: "Intern", levelStartDate: new Date("2026-01-15") });

    const result = await checkPromotionEligibility({ asOf: new Date("2026-03-10") });
    expect(result.flagged).toBe(0);
  });

  it("never re-flags the same employee/level transition twice", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { checkPromotionEligibility } = await import("../jobs/checkPromotionEligibility.js");
    const { default: PromotionRequestModel } = await import("../model/PromotionRequest.js");

    await makeEmployee({ positionLevel: "Intern", levelStartDate: new Date("2026-01-01") });

    const first = await checkPromotionEligibility({ asOf: new Date("2026-03-01") });
    expect(first.flagged).toBe(1);

    const second = await checkPromotionEligibility({ asOf: new Date("2026-03-02") });
    expect(second.flagged).toBe(0);

    const count = await PromotionRequestModel.countDocuments();
    expect(count).toBe(1);
  });

  it("does not re-flag after the system-generated request was rejected", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { checkPromotionEligibility } = await import("../jobs/checkPromotionEligibility.js");
    const { default: PromotionRequestModel } = await import("../model/PromotionRequest.js");

    await makeEmployee({ positionLevel: "Intern", levelStartDate: new Date("2026-01-01") });
    await checkPromotionEligibility({ asOf: new Date("2026-03-01") });

    await PromotionRequestModel.updateOne({}, { $set: { status: "rejected" } });

    const later = await checkPromotionEligibility({ asOf: new Date("2026-06-01") });
    expect(later.flagged).toBe(0);

    const count = await PromotionRequestModel.countDocuments();
    expect(count).toBe(1);
  });

  it("skips an employee who already has any pending promotion proposal", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { checkPromotionEligibility } = await import("../jobs/checkPromotionEligibility.js");
    const { default: PromotionRequestModel } = await import("../model/PromotionRequest.js");

    const employee = await makeEmployee({ positionLevel: "Intern", levelStartDate: new Date("2026-01-01") });

    await PromotionRequestModel.create({
      employee: employee._id,
      requestedBy: null,
      status: "pending",
      currentDesignation: "Junior Engineer",
      proposedDesignation: "Engineer",
    });

    const result = await checkPromotionEligibility({ asOf: new Date("2026-03-01") });
    expect(result.flagged).toBe(0);

    const count = await PromotionRequestModel.countDocuments();
    expect(count).toBe(1);
  });

  it("pre-fills the proposed salary from PositionLevel's base salary when it's higher", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { checkPromotionEligibility } = await import("../jobs/checkPromotionEligibility.js");
    const { default: PromotionRequestModel } = await import("../model/PromotionRequest.js");
    const { default: PositionLevelModel } = await import("../model/PositionLevel.js");

    await PositionLevelModel.create({ level: "Full-time", order: 1, baseSalary: 60000 });
    const employee = await makeEmployee({
      positionLevel: "Intern",
      levelStartDate: new Date("2026-01-01"),
      annualSalary: 20000,
    });

    await checkPromotionEligibility({ asOf: new Date("2026-03-01") });

    const request = await PromotionRequestModel.findOne({ employee: employee._id });
    expect(request.proposedAnnualSalary).toBe(60000);
  });

  it("approving a system-flagged request updates positionLevel and resets levelStartDate", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { checkPromotionEligibility } = await import("../jobs/checkPromotionEligibility.js");
    const { default: PromotionRequestModel } = await import("../model/PromotionRequest.js");
    const { default: EmployeeModel } = await import("../model/Employee.js");
    const { createApp, seedAdminAndLogin } = await import("./testHelpers.js");
    const supertest = (await import("supertest")).default;

    const employee = await makeEmployee({ positionLevel: "Intern", levelStartDate: new Date("2026-01-01") });
    await checkPromotionEligibility({ asOf: new Date("2026-03-01") });

    const request = await PromotionRequestModel.findOne({ employee: employee._id });

    const app = await createApp();
    const httpRequest = supertest(app);
    const { token } = await seedAdminAndLogin(app);

    const beforeApproval = new Date();
    const res = await httpRequest
      .patch(`/api/v1/promotion-requests/${request._id}/review`)
      .set("Authorization", `Bearer ${token}`)
      .send({ decision: "approved" });

    expect(res.status).toBe(200);

    const updatedEmployee = await EmployeeModel.findById(employee._id);
    expect(updatedEmployee.positionLevel).toBe("Full-time");
    expect(new Date(updatedEmployee.levelStartDate).getTime()).toBeGreaterThanOrEqual(beforeApproval.getTime());
  });
});
