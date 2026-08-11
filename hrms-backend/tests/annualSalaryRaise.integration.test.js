import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import supertest from "supertest";
import { startDb, stopDb, clearDb, createApp, seedAdminAndLogin } from "./testHelpers.js";

let dbAvailable = false;
let app;
let request;
let token;

const AS_OF = new Date(2026, 6, 1, 4);

beforeAll(async () => {
  try {
    await startDb();
    dbAvailable = true;
  } catch (err) {
    console.warn(`[annualSalaryRaise.integration] MongoDB unavailable — skipping.\n${err.message}`);
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
  ({ token } = await seedAdminAndLogin(app));
});

async function makeEmployee({ hiredAt, ...overrides } = {}) {
  const { default: EmployeeModel } = await import("../model/Employee.js");
  const employee = await EmployeeModel.create({
    employeeId: overrides.employeeId ?? `EMP${Math.floor(Math.random() * 100000)}`,
    name: overrides.name ?? "Tenured Employee",
    email: overrides.email ?? `tenured${Math.random()}@hrms.com`,
    status: overrides.status ?? "active",
    annualSalary: overrides.annualSalary ?? 50000,
    contractType: "full-time",
    ...overrides,
  });
  if (hiredAt) {
    await EmployeeModel.collection.updateOne({ _id: employee._id }, { $set: { createdAt: hiredAt } });
  }
  return employee;
}

describe("annualSalaryRaise", () => {
  it("proposes a 10% raise once an employee completes a year of service", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { annualSalaryRaise } = await import("../jobs/annualSalaryRaise.js");
    const { default: PromotionRequestModel } = await import("../model/PromotionRequest.js");

    const employee = await makeEmployee({ hiredAt: new Date(2025, 6, 1, 10) });

    const result = await annualSalaryRaise({ asOf: AS_OF });

    expect(result.proposed).toBe(1);
    const requests = await PromotionRequestModel.find({ employee: employee._id });
    expect(requests).toHaveLength(1);
    expect(requests[0].status).toBe("pending");
    expect(requests[0].systemGenerated).toBe(true);
    expect(requests[0].proposedAnnualSalary).toBe(55000);
    expect(requests[0].currentAnnualSalary).toBe(50000);
    expect(requests[0].proposedPositionLevel).toBe(null);
    expect(requests[0].proposedDesignation).toBe(null);
    expect(requests[0].proposedDepartment).toBe(null);
  });

  it("does not fire again on a later run for the same anniversary", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { annualSalaryRaise } = await import("../jobs/annualSalaryRaise.js");
    const { default: PromotionRequestModel } = await import("../model/PromotionRequest.js");

    await makeEmployee({ hiredAt: new Date(2025, 6, 1, 10) });

    await annualSalaryRaise({ asOf: AS_OF });
    await annualSalaryRaise({ asOf: AS_OF });
    await annualSalaryRaise({ asOf: new Date(2026, 6, 20, 4) });

    expect(await PromotionRequestModel.countDocuments({})).toBe(1);
  });

  it("proposes again at the next anniversary", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { annualSalaryRaise } = await import("../jobs/annualSalaryRaise.js");
    const { default: PromotionRequestModel } = await import("../model/PromotionRequest.js");

    await makeEmployee({ hiredAt: new Date(2025, 6, 1, 10) });

    await annualSalaryRaise({ asOf: AS_OF });
    await PromotionRequestModel.updateMany({}, { status: "approved" });
    await annualSalaryRaise({ asOf: new Date(2027, 6, 1, 4) });

    expect(await PromotionRequestModel.countDocuments({})).toBe(2);
  });

  it("skips an employee short of a full year", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { annualSalaryRaise } = await import("../jobs/annualSalaryRaise.js");
    const { default: PromotionRequestModel } = await import("../model/PromotionRequest.js");

    await makeEmployee({ hiredAt: new Date(2025, 6, 2, 10) });

    const result = await annualSalaryRaise({ asOf: AS_OF });

    expect(result.proposed).toBe(0);
    expect(await PromotionRequestModel.countDocuments({})).toBe(0);
  });

  it("skips an employee with no salary on record", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { annualSalaryRaise } = await import("../jobs/annualSalaryRaise.js");
    const { default: PromotionRequestModel } = await import("../model/PromotionRequest.js");

    await makeEmployee({ hiredAt: new Date(2024, 0, 1, 10), annualSalary: 0 });

    const result = await annualSalaryRaise({ asOf: AS_OF });

    expect(result.proposed).toBe(0);
    expect(await PromotionRequestModel.countDocuments({})).toBe(0);
  });

  it("skips an employee who already has a pending request in flight", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { annualSalaryRaise } = await import("../jobs/annualSalaryRaise.js");
    const { default: PromotionRequestModel } = await import("../model/PromotionRequest.js");

    const employee = await makeEmployee({ hiredAt: new Date(2025, 6, 1, 10) });
    await PromotionRequestModel.create({
      employee: employee._id,
      status: "pending",
      proposedDesignation: "Senior Engineer",
    });

    const result = await annualSalaryRaise({ asOf: AS_OF });

    expect(result.proposed).toBe(0);
    expect(await PromotionRequestModel.countDocuments({})).toBe(1);
  });

  it("skips a terminated employee", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { annualSalaryRaise } = await import("../jobs/annualSalaryRaise.js");
    const { default: PromotionRequestModel } = await import("../model/PromotionRequest.js");

    await makeEmployee({ hiredAt: new Date(2024, 0, 1, 10), status: "terminated" });

    const result = await annualSalaryRaise({ asOf: AS_OF });

    expect(result.proposed).toBe(0);
    expect(await PromotionRequestModel.countDocuments({})).toBe(0);
  });

  it("raises the salary and leaves the tenure clock alone once an ADMIN approves", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { annualSalaryRaise } = await import("../jobs/annualSalaryRaise.js");
    const { default: PromotionRequestModel } = await import("../model/PromotionRequest.js");
    const { default: EmployeeModel } = await import("../model/Employee.js");

    const employee = await makeEmployee({ hiredAt: new Date(2025, 6, 1, 10) });
    const levelStartBefore = employee.levelStartDate;

    await annualSalaryRaise({ asOf: AS_OF });
    const proposal = await PromotionRequestModel.findOne({ employee: employee._id });

    const res = await request
      .patch(`/api/v1/promotion-requests/${proposal._id}/review`)
      .set({ Authorization: `Bearer ${token}` })
      .send({ decision: "approved" });

    expect(res.status).toBe(200);

    const after = await EmployeeModel.findById(employee._id);
    expect(after.annualSalary).toBe(55000);
    expect(after.positionLevel).toBe(employee.positionLevel);
    expect(after.levelStartDate.getTime()).toBe(levelStartBefore.getTime());
  });
});
