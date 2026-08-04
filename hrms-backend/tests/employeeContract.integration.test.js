/**
 * employeeContract.integration.test.js — task 1.4 (contract PDF viewing).
 *
 * Covers what's testable without a real Cloudinary account (this repo has
 * no precedent for mocking the upload path — see employeeController.js's
 * uploadAvatar, which is likewise untested against a live upload):
 *   - POST /employees/:id/contract is HR/Admin-only (unlike the avatar
 *     route, which any authenticated user can hit for their own avatar).
 *   - The route is wired and reaches the controller's own validation (a
 *     missing file is rejected with a clear message) rather than 404ing.
 *   - A freshly created employee's contractUrl is null until uploaded.
 *   - contractUrl can't be set through the generic PUT /employees/:id
 *     update endpoint (see model/Employee.js / utils/mappers.js comments).
 *
 * Uses the same in-memory MongoDB harness as crud.integration.test.js.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import supertest from "supertest";
import { startDb, stopDb, clearDb, createApp, seedAdminAndLogin } from "./testHelpers.js";

let app;
let request;
let token;
let dbAvailable = false;

beforeAll(async () => {
  try {
    await startDb();
    dbAvailable = true;
  } catch (err) {
    console.warn(`[employeeContract.integration] MongoDB unavailable — skipping.\n${err.message}`);
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
  const result = await seedAdminAndLogin(app);
  token = result.token;
});

const auth = () => ({ Authorization: `Bearer ${token}` });

async function createDepartment(name = "Engineering") {
  const res = await request
    .post("/api/v1/departments")
    .set(auth())
    .send({ name, manager: "Test Manager", budget: 500000 });
  return res.body.data;
}

async function createEmployee(overrides = {}) {
  const dept = await createDepartment();
  const base = {
    name: "Jane Doe",
    employeeId: "EMP001",
    email: "jane@hrms.com",
    age: 29,
    sex: "Female",
    type: "Full-time",
    status: "Active",
    salary: 70000,
    department: dept.name,
    designation: "Engineer",
  };
  const res = await request.post("/api/v1/employees").set(auth()).send({ ...base, ...overrides });
  return res.body.data;
}

describe("POST /employees/:id/contract (task 1.4)", () => {
  it("defaults contractUrl/contractUploadedAt to null on a freshly created employee", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const employee = await createEmployee();
    expect(employee.contractUrl).toBeNull();
    expect(employee.contractUploadedAt).toBeNull();
  });

  it("rejects EMPLOYEE role (authorize middleware) — unlike the avatar route, this is HR/Admin-only", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const employee = await createEmployee();

    const bcrypt = (await import("bcryptjs")).default;
    const { default: UserModel } = await import("../model/User.js");
    const hash = bcrypt.hashSync("staffpass1", 10);
    await UserModel.create({ email: "staff@hrms.com", password: hash, name: "Staff", role: "EMPLOYEE" });
    const loginRes = await request.post("/api/v1/auth/login").send({ email: "staff@hrms.com", password: "staffpass1" });
    const staffToken = loginRes.body.data?.access_token;

    const res = await request
      .post(`/api/v1/employees/${employee.id}/contract`)
      .set("Authorization", `Bearer ${staffToken}`)
      .attach("contract", Buffer.from("%PDF-1.4 fake"), { filename: "contract.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(403);
  });

  it("rejects a request with no file attached (ADMIN, past the auth guard)", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const employee = await createEmployee();

    const res = await request
      .post(`/api/v1/employees/${employee.id}/contract`)
      .set(auth());

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/no contract file|not configured/i);
  });

  it("rejects a non-PDF file", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const employee = await createEmployee();

    const res = await request
      .post(`/api/v1/employees/${employee.id}/contract`)
      .set(auth())
      .attach("contract", Buffer.from("not a pdf"), { filename: "contract.txt", contentType: "text/plain" });

    expect(res.status).toBe(400);
  });

  it("cannot be set through the generic PUT /employees/:id update", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const employee = await createEmployee();

    const res = await request
      .put(`/api/v1/employees/${employee.id}`)
      .set(auth())
      .send({ contractUrl: "https://evil.example/x.pdf" });

    expect(res.status).toBe(200);
    expect(res.body.data.contractUrl).toBeNull();
  });
});
