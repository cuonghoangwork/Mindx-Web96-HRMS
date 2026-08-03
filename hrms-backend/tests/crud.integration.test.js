/**
 * crud.integration.test.js — Supertest tests for key CRUD routes.
 *
 * Covers employees (full CRUD + validation) and departments (create + budget update),
 * which exercises the validate middleware, auth guards, mappers, and audit log wiring
 * in one end-to-end pass.
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
    console.warn(`[crud.integration] MongoDB unavailable — integration tests will be skipped.\n${err.message}`);
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

// ── helpers ──────────────────────────────────────────────
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
    name:        "Jane Doe",
    employeeId:  "EMP001",
    email:       "jane@hrms.com",
    age:         29,
    sex:         "Female",
    type:        "Full-time",
    status:      "Active",
    salary:      70000,
    department:  dept.name,
    designation: "Engineer",
  };
  const res = await request
    .post("/api/v1/employees")
    .set(auth())
    .send({ ...base, ...overrides });
  return { employee: res.body.data, dept, res };
}

// ══════════════════════════════════════════════════════════
// DEPARTMENTS
// ══════════════════════════════════════════════════════════
describe("Department CRUD", () => {
  it("GET /departments returns empty list initially", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
    const res = await request.get("/api/v1/departments").set(auth());
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  it("POST /departments creates a department", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
    const dept = await createDepartment("Design");
    expect(dept.name).toBe("Design");
    expect(dept.budget).toBe(500000);
    expect(dept.id).toBeTruthy();
  });

  it("POST /departments rejects missing name (validate middleware)", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
    const res = await request.post("/api/v1/departments").set(auth()).send({ budget: 100000 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Department name/i);
  });

  it("POST /departments rejects negative budget", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
    const res = await request.post("/api/v1/departments").set(auth()).send({ name: "X", budget: -1000 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Budget/i);
  });

  it("POST /departments rejects duplicate name", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
    await createDepartment("HR");
    const res = await request.post("/api/v1/departments").set(auth()).send({ name: "HR", budget: 0 });
    expect(res.status).toBe(400);
  });

  it("PUT /departments/:id updates budget", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
    const dept = await createDepartment("Finance");
    const res = await request.put(`/api/v1/departments/${dept.id}`).set(auth()).send({ budget: 999999 });
    expect(res.status).toBe(200);
    expect(res.body.data.budget).toBe(999999);
  });

  it("GET /departments returns created departments", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
    await createDepartment("Marketing");
    await createDepartment("Sales");
    const res = await request.get("/api/v1/departments").set(auth());
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(2);
  });

  it("requires authentication", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
    const res = await request.get("/api/v1/departments");
    expect(res.status).toBe(401);
  });
});

// ══════════════════════════════════════════════════════════
// EMPLOYEES
// ══════════════════════════════════════════════════════════
describe("Employee CRUD", () => {
  it("POST /employees creates an employee", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
    const { employee, res } = await createEmployee();
    expect(res.status).toBe(201);
    expect(employee.name).toBe("Jane Doe");
    expect(employee.employeeId).toBe("EMP001");
    expect(employee.status).toBe("Active");
    expect(employee.type).toBe("Full-time");
    expect(employee.salary).toBe(70000);
    expect(employee.id).toBeTruthy();
  });

  it("POST /employees rejects missing name (validate)", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
    const dept = await createDepartment();
    const res = await request.post("/api/v1/employees").set(auth()).send({
      employeeId: "EMP002", email: "x@test.com", age: 25, department: dept.name, salary: 50000,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/name/i);
  });

  it("POST /employees rejects invalid employeeId format (validate)", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
    const dept = await createDepartment();
    const res = await request.post("/api/v1/employees").set(auth()).send({
      name: "Bob", employeeId: "123", email: "b@test.com", age: 25, department: dept.name, salary: 50000,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Employee ID/i);
  });

  it("POST /employees rejects age out of range (validate)", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
    const dept = await createDepartment();
    const res = await request.post("/api/v1/employees").set(auth()).send({
      name: "Bob", employeeId: "EMP099", email: "b@test.com", age: 15, department: dept.name, salary: 50000,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Age/i);
  });

  it("GET /employees returns created employees", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
    await createEmployee();
    const res = await request.get("/api/v1/employees").set(auth());
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(1);
    expect(res.body.totalItems).toBe(1);
  });

  it("GET /employees/:id returns a single employee", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
    const { employee } = await createEmployee();
    const res = await request.get(`/api/v1/employees/${employee.id}`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(employee.id);
    expect(res.body.data.name).toBe("Jane Doe");
  });

  it("GET /employees/:id returns 404 for unknown id", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
    const res = await request.get("/api/v1/employees/507f1f77bcf86cd799439099").set(auth());
    expect(res.status).toBe(404);
  });

  it("PUT /employees/:id updates status", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
    const { employee } = await createEmployee();
    const res = await request
      .put(`/api/v1/employees/${employee.id}`)
      .set(auth())
      .send({ status: "On Leave" });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("On Leave");
  });

  it("PUT /employees/:id rejects invalid status (validate)", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
    const { employee } = await createEmployee();
    const res = await request
      .put(`/api/v1/employees/${employee.id}`)
      .set(auth())
      .send({ status: "Napping" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Status/i);
  });

  it("DELETE /employees/:id removes the employee", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
    const { employee } = await createEmployee();
    const delRes = await request.delete(`/api/v1/employees/${employee.id}`).set(auth());
    expect(delRes.status).toBe(200);
    const getRes = await request.get(`/api/v1/employees/${employee.id}`).set(auth());
    expect(getRes.status).toBe(404);
  });

  it("requires authentication", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
    const res = await request.get("/api/v1/employees");
    expect(res.status).toBe(401);
  });

  it("rejects EMPLOYEE role from creating staff (authorize middleware)", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
    // Create a plain EMPLOYEE account directly (registration is gated by
    // Sprint 1's ALLOW_PUBLIC_REGISTRATION; this test only cares about the
    // authorize() middleware, not the registration endpoint, so it bypasses
    // the gate the same way seedAdminAndLogin bypasses it for the admin user).
    const bcrypt = (await import("bcryptjs")).default;
    const { default: UserModel } = await import("../model/User.js");
    const hash = bcrypt.hashSync("staffpass1", 10);
    await UserModel.create({ email: "staff@hrms.com", password: hash, name: "Staff", role: "EMPLOYEE" });

    const loginRes = await request.post("/api/v1/auth/login").send({ email: "staff@hrms.com", password: "staffpass1" });
    const staffToken = loginRes.body.data?.access_token;
    const dept = await createDepartment();
    const res = await request
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ name: "X", employeeId: "EMP999", email: "x@hrms.com", age: 25, department: dept.name, salary: 40000 });
    expect(res.status).toBe(403);
  });
});

// ══════════════════════════════════════════════════════════
// AUDIT LOG
// ══════════════════════════════════════════════════════════
describe("Audit log", () => {
  it("GET /audit-log/recent returns entries after employee creation", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
    await createEmployee();
    const res = await request.get("/api/v1/audit-log/recent?limit=5").set(auth());
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    // Should include department + employee creation entries
    const actions = res.body.items.map((e) => e.action);
    expect(actions).toContain("created");
  });

  it("GET /audit-log/recent entries have title and category fields", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
    await createEmployee();
    const res = await request.get("/api/v1/audit-log/recent").set(auth());
    const entry = res.body.items[0];
    expect(entry.title).toBeTruthy();
    expect(entry.category).toBeTruthy();
  });

  it("GET /audit-log requires authentication", async (ctx) => {
      if (!dbAvailable) return ctx.skip();
    const res = await request.get("/api/v1/audit-log");
    expect(res.status).toBe(401);
  });
});
