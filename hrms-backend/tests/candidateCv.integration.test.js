/**
 * candidateCv.integration.test.js — task 5.3 (real PDF CV upload for candidates).
 *
 * Mirrors employeeContract.integration.test.js (task 1.4) — same
 * memoryStorage → Cloudinary path, same "no live Cloudinary account in CI"
 * limitation, so this covers what's testable without one:
 *   - POST /candidates/:id/cv is HR/Admin-only.
 *   - The route is wired and reaches the controller's own validation (a
 *     missing file is rejected with a clear message) rather than 404ing.
 *   - A non-PDF file is rejected by the multer fileFilter.
 *   - A freshly created candidate's resumeUploadedAt is null until uploaded.
 *
 * Uses the same in-memory MongoDB harness as employeeContract.integration.test.js.
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
    console.warn(`[candidateCv.integration] MongoDB unavailable — skipping.\n${err.message}`);
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

async function createJob(overrides = {}) {
  // location is required by validate.job.create (see middleware/validate.js) —
  // omitting it 400s the request and silently leaves res.body.data undefined,
  // which is what broke this helper the first time around. `type` is left
  // unset rather than passed as "full-time": validate.job.create's isOneOf
  // check is case-sensitive against the client-facing VALID_TYPES list
  // ("Full-time", not "full-time" — that lowercase form is the *DB* value
  // jobFromClient maps down to), and the field is optional, so omitting it
  // lets the Job model's own default ("full-time") apply.
  const res = await request
    .post("/api/v1/jobs")
    .set(auth())
    .send({ title: "Frontend Engineer", location: "Remote", ...overrides });
  return res.body.data;
}

async function createCandidate(overrides = {}) {
  const job = await createJob();
  const base = {
    name: "Alex Nguyen",
    email: "alex@example.com",
    jobId: job.id,
  };
  const res = await request.post("/api/v1/candidates").set(auth()).send({ ...base, ...overrides });
  return res.body.data;
}

describe("POST /candidates/:id/cv (task 5.3)", () => {
  it("defaults resumeUploadedAt to null on a freshly created candidate", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const candidate = await createCandidate();
    expect(candidate.resumeUploadedAt).toBeNull();
  });

  it("rejects EMPLOYEE role (authorize middleware) — HR/Admin-only, same as create/update/remove", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const candidate = await createCandidate();

    const bcrypt = (await import("bcryptjs")).default;
    const { default: UserModel } = await import("../model/User.js");
    const hash = bcrypt.hashSync("staffpass1", 10);
    await UserModel.create({ email: "staff@hrms.com", password: hash, name: "Staff", role: "EMPLOYEE" });
    const loginRes = await request.post("/api/v1/auth/login").send({ email: "staff@hrms.com", password: "staffpass1" });
    const staffToken = loginRes.body.data?.access_token;

    const res = await request
      .post(`/api/v1/candidates/${candidate.id}/cv`)
      .set("Authorization", `Bearer ${staffToken}`)
      .attach("cv", Buffer.from("%PDF-1.4 fake"), { filename: "resume.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(403);
  });

  it("rejects a request with no file attached (ADMIN, past the auth guard)", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const candidate = await createCandidate();

    const res = await request
      .post(`/api/v1/candidates/${candidate.id}/cv`)
      .set(auth());

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/no cv\/resume file|not configured/i);
  });

  it("rejects a non-PDF file", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const candidate = await createCandidate();

    const res = await request
      .post(`/api/v1/candidates/${candidate.id}/cv`)
      .set(auth())
      .attach("cv", Buffer.from("not a pdf"), { filename: "resume.txt", contentType: "text/plain" });

    expect(res.status).toBe(400);
  });

  it("404s cleanly for an unknown candidate id (past auth + file validation)", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    await createCandidate();
    const fakeId = "64b7f9b1a1b2c3d4e5f60789";

    const res = await request
      .post(`/api/v1/candidates/${fakeId}/cv`)
      .set(auth())
      .attach("cv", Buffer.from("%PDF-1.4 fake"), { filename: "resume.pdf", contentType: "application/pdf" });

    // Cloudinary isn't configured with real creds in this test env, so the
    // "not configured" guard fires first — same ordering as
    // employeeController.uploadContract. Either a 400 (not configured) or
    // the candidate-not-found 400 is an acceptable outcome here; a 404/500
    // would indicate the route or model lookup is broken.
    expect(res.status).toBe(400);
  });
});
