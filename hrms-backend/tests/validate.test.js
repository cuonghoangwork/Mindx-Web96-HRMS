/**
 * validate.test.js — unit tests for middleware/validate.js
 *
 * Each validator is tested by calling it as Express middleware with a
 * synthetic req/res pair. No DB or server needed.
 */

import { describe, it, expect, vi } from "vitest";
import { validate } from "../middleware/validate.js";

// ─── Mini test harness ────────────────────────────────────
function runValidator(middleware, body) {
  return new Promise((resolve) => {
    const req  = { body };
    const res  = {
      status(code) { this._status = code; return this; },
      json(data)   { resolve({ status: this._status ?? 200, data }); },
    };
    const next = () => resolve({ status: 200, data: null, passed: true });
    middleware(req, res, next);
  });
}

async function passes(middleware, body) {
  const result = await runValidator(middleware, body);
  return result.passed === true;
}

async function failsWith(middleware, body, substring) {
  const result = await runValidator(middleware, body);
  if (result.passed) return false;
  return result.status === 400 && result.data.message.includes(substring);
}

// ══════════════════════════════════════════════════════════
// AUTH — register
// ══════════════════════════════════════════════════════════
describe("validate.auth.register", () => {
  const v = validate.auth.register;

  it("passes with valid data", async () => {
    expect(await passes(v, { name: "Alice", email: "alice@test.com", password: "secret99" })).toBe(true);
  });

  it("rejects missing name", async () => {
    expect(await failsWith(v, { email: "a@b.com", password: "secret99" }, "Name")).toBe(true);
  });

  it("rejects name shorter than 2 chars", async () => {
    expect(await failsWith(v, { name: "A", email: "a@b.com", password: "secret99" }, "Name")).toBe(true);
  });

  it("rejects missing email", async () => {
    expect(await failsWith(v, { name: "Alice", password: "secret99" }, "Email")).toBe(true);
  });

  it("rejects invalid email format", async () => {
    expect(await failsWith(v, { name: "Alice", email: "not-an-email", password: "secret99" }, "Email")).toBe(true);
  });

  it("rejects missing password", async () => {
    expect(await failsWith(v, { name: "Alice", email: "a@b.com" }, "Password")).toBe(true);
  });

  it("rejects password shorter than 8 chars", async () => {
    expect(await failsWith(v, { name: "Alice", email: "a@b.com", password: "short" }, "Password")).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════
// AUTH — login
// ══════════════════════════════════════════════════════════
describe("validate.auth.login", () => {
  const v = validate.auth.login;

  it("passes with valid credentials", async () => {
    expect(await passes(v, { email: "admin@hrms.com", password: "admin123" })).toBe(true);
  });

  it("rejects missing email", async () => {
    expect(await failsWith(v, { password: "admin123" }, "Email")).toBe(true);
  });

  it("rejects bad email format", async () => {
    expect(await failsWith(v, { email: "notanemail", password: "admin123" }, "Email")).toBe(true);
  });

  it("rejects missing password", async () => {
    expect(await failsWith(v, { email: "admin@hrms.com" }, "Password")).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════
// EMPLOYEE — create
// ══════════════════════════════════════════════════════════
describe("validate.employee.create", () => {
  const v = validate.employee.create;

  const valid = {
    name: "John Doe",
    employeeId: "EMP001",
    email: "john@test.com",
    age: 28,
    sex: "Male",
    type: "Full-time",
    status: "Active",
    salary: 60000,
  };

  it("passes with all valid fields", async () => {
    expect(await passes(v, valid)).toBe(true);
  });

  it("rejects missing name", async () => {
    expect(await failsWith(v, { ...valid, name: "" }, "name")).toBe(true);
  });

  it("rejects missing employeeId", async () => {
    expect(await failsWith(v, { ...valid, employeeId: "" }, "Employee ID")).toBe(true);
  });

  it("rejects employeeId with wrong format (no letters prefix)", async () => {
    expect(await failsWith(v, { ...valid, employeeId: "123456" }, "Employee ID")).toBe(true);
  });

  it("accepts valid employeeId formats: EMP001, HR01, MGMT0012", async () => {
    for (const id of ["EMP001", "HR01", "MGMT0012"]) {
      expect(await passes(v, { ...valid, employeeId: id })).toBe(true);
    }
  });

  it("rejects missing email", async () => {
    expect(await failsWith(v, { ...valid, email: "" }, "Email")).toBe(true);
  });

  it("rejects invalid email", async () => {
    expect(await failsWith(v, { ...valid, email: "notvalid" }, "Email")).toBe(true);
  });

  it("rejects missing age", async () => {
    expect(await failsWith(v, { ...valid, age: "" }, "Age")).toBe(true);
  });

  it("rejects age below 18", async () => {
    expect(await failsWith(v, { ...valid, age: 17 }, "Age")).toBe(true);
  });

  it("rejects age above 80", async () => {
    expect(await failsWith(v, { ...valid, age: 81 }, "Age")).toBe(true);
  });

  it("rejects invalid status value", async () => {
    expect(await failsWith(v, { ...valid, status: "Sleeping" }, "Status")).toBe(true);
  });

  it("rejects invalid type value", async () => {
    expect(await failsWith(v, { ...valid, type: "Gig-worker" }, "Contract type")).toBe(true);
  });

  it("rejects salary of 0 or negative", async () => {
    expect(await failsWith(v, { ...valid, salary: 0 }, "salary")).toBe(true);
    expect(await failsWith(v, { ...valid, salary: -5000 }, "salary")).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════
// EMPLOYEE — update (all fields optional)
// ══════════════════════════════════════════════════════════
describe("validate.employee.update", () => {
  const v = validate.employee.update;

  it("passes empty body (no-op update)", async () => {
    expect(await passes(v, {})).toBe(true);
  });

  it("passes partial update with valid status", async () => {
    expect(await passes(v, { status: "On Leave" })).toBe(true);
  });

  it("rejects invalid status in partial update", async () => {
    expect(await failsWith(v, { status: "Unknown" }, "Status")).toBe(true);
  });

  it("rejects bad email if provided", async () => {
    expect(await failsWith(v, { email: "bad" }, "Email")).toBe(true);
  });

  it("rejects out-of-range age if provided", async () => {
    expect(await failsWith(v, { age: 10 }, "Age")).toBe(true);
  });

  it("rejects invalid employeeId format if provided", async () => {
    expect(await failsWith(v, { employeeId: "999" }, "Employee ID")).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════
// DEPARTMENT
// ══════════════════════════════════════════════════════════
describe("validate.department.create", () => {
  const v = validate.department.create;

  it("passes with valid name", async () => {
    expect(await passes(v, { name: "Engineering", budget: 500000 })).toBe(true);
  });

  it("rejects missing name", async () => {
    expect(await failsWith(v, { budget: 100000 }, "Department name")).toBe(true);
  });

  it("rejects name shorter than 2 chars", async () => {
    expect(await failsWith(v, { name: "A" }, "Department name")).toBe(true);
  });

  it("rejects negative budget", async () => {
    expect(await failsWith(v, { name: "Finance", budget: -1 }, "Budget")).toBe(true);
  });

  it("accepts zero budget", async () => {
    expect(await passes(v, { name: "New Dept", budget: 0 })).toBe(true);
  });
});

describe("validate.department.update", () => {
  const v = validate.department.update;

  it("passes empty body", async () => {
    expect(await passes(v, {})).toBe(true);
  });

  it("rejects negative budget if provided", async () => {
    expect(await failsWith(v, { budget: -500 }, "Budget")).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════
// JOB
// ══════════════════════════════════════════════════════════
describe("validate.job.create", () => {
  const v = validate.job.create;

  const valid = { title: "Frontend Engineer", location: "Remote", status: "Open", type: "Full-time" };

  it("passes with valid data", async () => {
    expect(await passes(v, valid)).toBe(true);
  });

  it("rejects missing title", async () => {
    expect(await failsWith(v, { ...valid, title: "" }, "Job title")).toBe(true);
  });

  it("rejects missing location", async () => {
    expect(await failsWith(v, { ...valid, location: "" }, "Location")).toBe(true);
  });

  it("rejects invalid job status", async () => {
    expect(await failsWith(v, { ...valid, status: "Maybe" }, "Job status")).toBe(true);
  });

  it("rejects invalid employment type", async () => {
    expect(await failsWith(v, { ...valid, type: "Freelance" }, "Employment type")).toBe(true);
  });

  // Task 5.1 — expanded Job fields
  it("passes with the full set of expanded fields", async () => {
    expect(await passes(v, {
      ...valid,
      description: "Build things.",
      requirements: "3+ years React\nOwns ambiguity",
      benefits: "Health insurance\nRemote-friendly",
      salaryMin: 50000,
      salaryMax: 70000,
      companyInfo: "We build HR software.",
      applicationInstructions: "Apply via careers@example.com",
      deadline: "2026-09-01",
    })).toBe(true);
  });

  it("rejects a negative salaryMin", async () => {
    expect(await failsWith(v, { ...valid, salaryMin: -100 }, "Minimum salary")).toBe(true);
  });

  it("rejects salaryMin greater than salaryMax", async () => {
    expect(await failsWith(v, { ...valid, salaryMin: 90000, salaryMax: 50000 }, "Minimum salary")).toBe(true);
  });

  it("rejects an invalid deadline", async () => {
    expect(await failsWith(v, { ...valid, deadline: "not-a-date" }, "Application deadline")).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════
// CANDIDATE
// ══════════════════════════════════════════════════════════
describe("validate.candidate.create", () => {
  const v = validate.candidate.create;

  const valid = { name: "Jane Cand", email: "jane@test.com", jobId: "507f1f77bcf86cd799439011", stage: "Applied", rating: 4 };

  it("passes with valid data", async () => {
    expect(await passes(v, valid)).toBe(true);
  });

  it("rejects missing name", async () => {
    expect(await failsWith(v, { ...valid, name: "" }, "Candidate name")).toBe(true);
  });

  it("rejects missing email", async () => {
    expect(await failsWith(v, { ...valid, email: "" }, "Email")).toBe(true);
  });

  it("rejects bad email", async () => {
    expect(await failsWith(v, { ...valid, email: "notvalid" }, "Email")).toBe(true);
  });

  it("rejects missing jobId", async () => {
    expect(await failsWith(v, { ...valid, jobId: "" }, "Job ID")).toBe(true);
  });

  it("rejects invalid pipeline stage", async () => {
    expect(await failsWith(v, { ...valid, stage: "Ghosted" }, "Pipeline stage")).toBe(true);
  });

  it("rejects rating above 5", async () => {
    expect(await failsWith(v, { ...valid, rating: 6 }, "Rating")).toBe(true);
  });

  it("rejects negative rating", async () => {
    expect(await failsWith(v, { ...valid, rating: -1 }, "Rating")).toBe(true);
  });

  it("accepts rating of 0", async () => {
    expect(await passes(v, { ...valid, rating: 0 })).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════
// HOLIDAY
// ══════════════════════════════════════════════════════════
describe("validate.holiday.create", () => {
  const v = validate.holiday.create;

  const valid = { name: "Tet Holiday", date: "2026-02-17", type: "Public" };

  it("passes with valid data", async () => {
    expect(await passes(v, valid)).toBe(true);
  });

  it("rejects missing name", async () => {
    expect(await failsWith(v, { ...valid, name: "" }, "Holiday name")).toBe(true);
  });

  it("rejects missing date", async () => {
    expect(await failsWith(v, { ...valid, date: "" }, "Date")).toBe(true);
  });

  it("rejects invalid date string", async () => {
    expect(await failsWith(v, { ...valid, date: "not-a-date" }, "Date")).toBe(true);
  });

  it("rejects invalid holiday type", async () => {
    expect(await failsWith(v, { ...valid, type: "Religious" }, "Holiday type")).toBe(true);
  });

  it("accepts all valid types", async () => {
    for (const type of ["Public", "Company", "Optional"]) {
      expect(await passes(v, { ...valid, type })).toBe(true);
    }
  });
});

// ══════════════════════════════════════════════════════════
// ATTENDANCE
// ══════════════════════════════════════════════════════════
describe("validate.attendance.checkIn", () => {
  const v = validate.attendance.checkIn;

  it("passes with valid data", async () => {
    expect(await passes(v, { employeeId: "abc123", date: "2026-01-15", checkIn: "09:00" })).toBe(true);
  });

  it("rejects missing employeeId", async () => {
    expect(await failsWith(v, { date: "2026-01-15" }, "Employee ID")).toBe(true);
  });

  it("rejects missing date", async () => {
    expect(await failsWith(v, { employeeId: "abc123" }, "Date")).toBe(true);
  });

  it("rejects invalid date", async () => {
    expect(await failsWith(v, { employeeId: "abc123", date: "yesterday" }, "Date")).toBe(true);
  });

  it("rejects checkIn not in HH:MM format", async () => {
    expect(await failsWith(v, { employeeId: "abc123", date: "2026-01-15", checkIn: "9am" }, "HH:MM")).toBe(true);
  });

  it("passes without optional checkIn field", async () => {
    expect(await passes(v, { employeeId: "abc123", date: "2026-01-15" })).toBe(true);
  });
});

describe("validate.attendance.checkOut", () => {
  const v = validate.attendance.checkOut;

  it("passes with valid data", async () => {
    expect(await passes(v, { employeeId: "abc123", date: "2026-01-15", checkOut: "18:00" })).toBe(true);
  });

  it("rejects checkOut not in HH:MM format", async () => {
    expect(await failsWith(v, { employeeId: "abc123", date: "2026-01-15", checkOut: "6pm" }, "HH:MM")).toBe(true);
  });
});

describe("validate.payroll.updatePayslip", () => {
  const v = validate.payroll.updatePayslip;

  it("passes with one money field and a reason", async () => {
    expect(await passes(v, { baseSalary: 9_000_000, reason: "Corrected base pay" })).toBe(true);
  });

  it("accepts zero as a money amount", async () => {
    expect(await passes(v, { bonus: 0, reason: "Bonus withdrawn" })).toBe(true);
  });

  it("rejects a body with no money field at all", async () => {
    expect(await failsWith(v, { reason: "Nothing to change" }, "at least one")).toBe(true);
  });

  it("rejects a missing reason", async () => {
    expect(await failsWith(v, { baseSalary: 9_000_000 }, "Adjustment reason is required")).toBe(true);
  });

  it("rejects a blank reason", async () => {
    expect(await failsWith(v, { baseSalary: 9_000_000, reason: "   " }, "Adjustment reason is required")).toBe(true);
  });

  it("rejects a reason longer than 300 characters", async () => {
    expect(await failsWith(v, { baseSalary: 9_000_000, reason: "x".repeat(301) }, "at most 300")).toBe(true);
  });

  it("rejects a non-string reason with 400 rather than throwing", async () => {
    expect(await failsWith(v, { baseSalary: 9_000_000, reason: 42 }, "Adjustment reason is required")).toBe(true);
    expect(await failsWith(v, { baseSalary: 9_000_000, reason: { text: "hi" } }, "Adjustment reason is required")).toBe(true);
  });

  it("rejects a decimal VND amount", async () => {
    expect(await failsWith(v, { baseSalary: 9_000_000.5, reason: "Rounding" }, "whole number")).toBe(true);
  });

  it("rejects a negative VND amount", async () => {
    expect(await failsWith(v, { deduction: -1, reason: "Negative" }, "non-negative")).toBe(true);
  });

  it("treats an empty-string money field as not provided", async () => {
    expect(await failsWith(v, { baseSalary: "", reason: "Blank" }, "at least one")).toBe(true);
  });
});
