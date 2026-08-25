/**
 * employeeDocuments.integration.test.js — Solo Gaps Milestone 1
 * (multi-document upload).
 *
 * Covers what's testable without a real Cloudinary account — same
 * constraint noted in employeeContract.integration.test.js: testHelpers.js
 * sets fake CLOUD_NAME/API_KEY/API_SECRET so isCloudinaryConfigured()
 * passes, but an actual upload_stream call against those fake credentials
 * isn't something to assert a real secure_url from. So this covers route
 * wiring, role gating, MANAGER own-department scope, validation errors,
 * and documents[] write-protection through the generic update endpoint —
 * not a successful end-to-end upload.
 *
 * Reuses seedPerformanceOrg (tests/performanceFixtures.js) for its
 * department/MANAGER/EMPLOYEE scaffolding — a generic org fixture with no
 * performance-specific coupling, saving a second copy of the
 * User->Employee->department linking logic it already builds.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import supertest from "supertest";
import { startDb, stopDb, clearDb, createApp } from "./testHelpers.js";
import { seedPerformanceOrg, auth } from "./performanceFixtures.js";

let app;
let request;
let dbAvailable = false;

beforeAll(async () => {
  try {
    await startDb();
    dbAvailable = true;
  } catch (err) {
    console.warn(`[employeeDocuments.integration] MongoDB unavailable — skipping.\n${err.message}`);
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
});

const UNKNOWN_DOC_ID = "507f1f77bcf86cd799439011";

describe("POST /employees/:id/documents (Solo Gaps Milestone 1)", () => {
  it("defaults documents to [] on a freshly created employee", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { employees, tokens } = await seedPerformanceOrg(app);

    const res = await request.get(`/api/v1/employees/${employees.dev._id}`).set(auth(tokens.admin));
    expect(res.body.data.documents).toEqual([]);
  });

  it("rejects EMPLOYEE role (authorize middleware) — same gate as the contract route", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { employees, tokens } = await seedPerformanceOrg(app);

    const res = await request
      .post(`/api/v1/employees/${employees.dev._id}/documents`)
      .set(auth(tokens.dev))
      .attach("documents", Buffer.from("%PDF-1.4 fake"), { filename: "doc.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(403);
  });

  it("rejects a request with no files attached (ADMIN, past the auth guard)", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { employees, tokens } = await seedPerformanceOrg(app);

    const res = await request.post(`/api/v1/employees/${employees.dev._id}/documents`).set(auth(tokens.admin));

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/no document files|not configured/i);
  });

  it("rejects a non-PDF file", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { employees, tokens } = await seedPerformanceOrg(app);

    const res = await request
      .post(`/api/v1/employees/${employees.dev._id}/documents`)
      .set(auth(tokens.admin))
      .attach("documents", Buffer.from("not a pdf"), { filename: "doc.txt", contentType: "text/plain" });

    expect(res.status).toBe(400);
  });

  it("rejects a batch of more than 5 files", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { employees, tokens } = await seedPerformanceOrg(app);

    let req = request.post(`/api/v1/employees/${employees.dev._id}/documents`).set(auth(tokens.admin));
    for (let i = 0; i < 6; i += 1) {
      req = req.attach("documents", Buffer.from("%PDF-1.4 fake"), { filename: `doc${i}.pdf`, contentType: "application/pdf" });
    }
    const res = await req;

    expect(res.status).toBe(400);
  });

  it("MANAGER outside the employee's department gets 403", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { employees, tokens } = await seedPerformanceOrg(app);

    // manager is scoped to Engineering; designer belongs to Design.
    const res = await request
      .post(`/api/v1/employees/${employees.designer._id}/documents`)
      .set(auth(tokens.manager))
      .attach("documents", Buffer.from("%PDF-1.4 fake"), { filename: "doc.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/own department/i);
  });

  it("cannot be set through the generic PUT /employees/:id update", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { employees, tokens } = await seedPerformanceOrg(app);

    const res = await request
      .put(`/api/v1/employees/${employees.dev._id}`)
      .set(auth(tokens.admin))
      .send({ documents: [{ url: "https://evil.example/x.pdf", label: "x", type: "other" }] });

    expect(res.status).toBe(200);
    expect(res.body.data.documents).toEqual([]);
  });
});

describe("DELETE /employees/:id/documents/:docId (Solo Gaps Milestone 1)", () => {
  it("rejects EMPLOYEE role", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { employees, tokens } = await seedPerformanceOrg(app);

    const res = await request
      .delete(`/api/v1/employees/${employees.dev._id}/documents/${UNKNOWN_DOC_ID}`)
      .set(auth(tokens.dev));

    expect(res.status).toBe(403);
  });

  it("MANAGER outside the employee's department gets 403", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { employees, tokens } = await seedPerformanceOrg(app);

    const res = await request
      .delete(`/api/v1/employees/${employees.designer._id}/documents/${UNKNOWN_DOC_ID}`)
      .set(auth(tokens.manager));

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/own department/i);
  });

  it("returns 404 for an unknown docId (ADMIN, past the scope check)", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { employees, tokens } = await seedPerformanceOrg(app);

    const res = await request
      .delete(`/api/v1/employees/${employees.dev._id}/documents/${UNKNOWN_DOC_ID}`)
      .set(auth(tokens.admin));

    expect(res.status).toBe(404);
  });
});
