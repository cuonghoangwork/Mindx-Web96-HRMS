/**
 * validate.test.js — unit tests for middleware/validate.js
 *
 * Each validator is tested by calling it as Express middleware with a
 * synthetic req/res pair. No DB or server needed.
 */

import { describe, it, expect, vi } from "vitest";
import { validate } from "../middleware/validate.js";
import { APPEAL_REASON_CATEGORIES, COMPETENCIES } from "../model/PerformanceReview.js";

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

describe("validate.performance.createCycle", () => {
  const v = validate.performance.createCycle;
  const ok = { label: "FY26 mid-year", start: "2026-01-01", end: "2026-06-30" };

  it("passes with a label and an ordered date range", async () => {
    expect(await passes(v, ok)).toBe(true);
  });

  it("rejects a missing or blank label", async () => {
    expect(await failsWith(v, { ...ok, label: undefined }, "Cycle label is required")).toBe(true);
    expect(await failsWith(v, { ...ok, label: "   " }, "Cycle label is required")).toBe(true);
  });

  it("rejects a non-string label with 400 rather than throwing", async () => {
    expect(await failsWith(v, { ...ok, label: 7 }, "Cycle label is required")).toBe(true);
  });

  it("rejects a missing or unparseable date", async () => {
    expect(await failsWith(v, { ...ok, start: undefined }, "Start date")).toBe(true);
    expect(await failsWith(v, { ...ok, end: "not-a-date" }, "End date")).toBe(true);
  });

  it("rejects an end date before the start date", async () => {
    expect(await failsWith(v, { ...ok, start: "2026-06-30", end: "2026-01-01" }, "End date cannot be before")).toBe(true);
  });

  it("accepts a single-day cycle", async () => {
    expect(await passes(v, { ...ok, start: "2026-03-01", end: "2026-03-01" })).toBe(true);
  });
});

describe("validate.performance.cycleStatus", () => {
  const v = validate.performance.cycleStatus;

  it("accepts Open and Closed", async () => {
    expect(await passes(v, { status: "Open" })).toBe(true);
    expect(await passes(v, { status: "Closed" })).toBe(true);
  });

  it("rejects a missing or unknown status", async () => {
    expect(await failsWith(v, {}, "Cycle status is required")).toBe(true);
    expect(await failsWith(v, { status: "open" }, "must be one of")).toBe(true);
    expect(await failsWith(v, { status: "Archived" }, "must be one of")).toBe(true);
  });
});

describe("validate.performance.selfReview", () => {
  const v = validate.performance.selfReview;

  it("accepts a rating with or without comments", async () => {
    expect(await passes(v, { selfRating: 3 })).toBe(true);
    expect(await passes(v, { selfRating: 5, selfComments: "Shipped the payroll job." })).toBe(true);
  });

  it("accepts a numeric string rating, matching the payroll validators", async () => {
    expect(await passes(v, { selfRating: "4" })).toBe(true);
  });

  it("rejects a missing or out-of-scale rating", async () => {
    expect(await failsWith(v, {}, "Self rating is required")).toBe(true);
    expect(await failsWith(v, { selfRating: 0 }, "Self rating is required")).toBe(true);
    expect(await failsWith(v, { selfRating: 6 }, "between 1 and 5")).toBe(true);
    expect(await failsWith(v, { selfRating: 3.5 }, "between 1 and 5")).toBe(true);
  });

  it("rejects a non-string comment with 400 rather than letting it reach the query", async () => {
    expect(await failsWith(v, { selfRating: 3, selfComments: { $gt: "" } }, "Self comments must be text")).toBe(true);
    expect(await failsWith(v, { selfRating: 3, selfComments: 12345 }, "Self comments must be text")).toBe(true);
  });

  it("rejects comments longer than 2000 characters", async () => {
    expect(await failsWith(v, { selfRating: 3, selfComments: "x".repeat(2001) }, "at most 2000")).toBe(true);
  });
});

describe("validate.performance.managerReview", () => {
  const v = validate.performance.managerReview;

  it("accepts a rating and rejects a missing one", async () => {
    expect(await passes(v, { managerRating: 4, managerComments: "Strong half." })).toBe(true);
    expect(await failsWith(v, {}, "Manager rating is required")).toBe(true);
    expect(await failsWith(v, { managerRating: 9 }, "between 1 and 5")).toBe(true);
  });
});

describe("validate.performance.competency", () => {
  const v = validate.performance.competency;

  it("accepts every competency key the model defines", async () => {
    for (const key of COMPETENCIES) {
      expect(await passes(v, { key, value: 3 })).toBe(true);
    }
    expect(COMPETENCIES).toHaveLength(6);
  });

  it("rejects a key the model does not define", async () => {
    expect(await failsWith(v, { key: "charisma", value: 3 }, "must be one of")).toBe(true);
    expect(await failsWith(v, { key: "Communication", value: 3 }, "must be one of")).toBe(true);
    expect(await failsWith(v, { value: 3 }, "Competency is required")).toBe(true);
  });

  it("rejects a rating outside the 1-5 scale", async () => {
    expect(await failsWith(v, { key: "execution", value: 0 }, "between 1 and 5")).toBe(true);
    expect(await failsWith(v, { key: "execution", value: 6 }, "between 1 and 5")).toBe(true);
  });

  it("ignores a client-supplied rater field", async () => {
    expect(await passes(v, { key: "ownership", value: 2, rater: "manager" })).toBe(true);
  });

  it("accepts a comment with no rating, and a rating with no comment", async () => {
    expect(await passes(v, { key: "execution", comment: "Consistently delivers." })).toBe(true);
    expect(await passes(v, { key: "execution", value: 3 })).toBe(true);
    expect(await passes(v, { key: "execution", value: 3, comment: "Consistently delivers." })).toBe(true);
  });

  it("rejects a comment over the length limit", async () => {
    expect(await failsWith(v, { key: "execution", comment: "x".repeat(2001) }, "at most 2000")).toBe(true);
  });

  it("rejects a request with neither a rating nor a comment", async () => {
    expect(await failsWith(v, { key: "execution" }, "Provide a rating, a comment, or both")).toBe(true);
  });
});

describe("validate.performance.goalCreate", () => {
  const v = validate.performance.goalCreate;

  it("accepts text with an optional progress value", async () => {
    expect(await passes(v, { text: "Ship the analytics panel" })).toBe(true);
    expect(await passes(v, { text: "Ship it", progress: 40 })).toBe(true);
  });

  it("rejects blank, missing or non-string text", async () => {
    expect(await failsWith(v, {}, "Goal is required")).toBe(true);
    expect(await failsWith(v, { text: "  " }, "Goal is required")).toBe(true);
    expect(await failsWith(v, { text: 42 }, "Goal is required")).toBe(true);
  });

  it("rejects progress that is not a multiple of ten", async () => {
    expect(await failsWith(v, { text: "Ship it", progress: 35 }, "steps of 10")).toBe(true);
    expect(await failsWith(v, { text: "Ship it", progress: 110 }, "steps of 10")).toBe(true);
  });
});

describe("validate.performance.goalUpdate", () => {
  const v = validate.performance.goalUpdate;

  it("accepts progress of 0, which a falsy required() check would have rejected", async () => {
    expect(await passes(v, { progress: 0 })).toBe(true);
  });

  it("accepts every valid step and the numeric-string form", async () => {
    for (let progress = 0; progress <= 100; progress += 10) {
      expect(await passes(v, { progress })).toBe(true);
    }
    expect(await passes(v, { progress: "70" })).toBe(true);
  });

  it("rejects a missing progress value", async () => {
    expect(await failsWith(v, {}, "Progress is required")).toBe(true);
    expect(await failsWith(v, { progress: null }, "Progress is required")).toBe(true);
    expect(await failsWith(v, { progress: "" }, "Progress is required")).toBe(true);
  });

  it("rejects off-step and out-of-range values", async () => {
    expect(await failsWith(v, { progress: 37 }, "steps of 10")).toBe(true);
    expect(await failsWith(v, { progress: -10 }, "steps of 10")).toBe(true);
    expect(await failsWith(v, { progress: 101 }, "steps of 10")).toBe(true);
  });
});

describe("validate.performance.peerFeedback", () => {
  const v = validate.performance.peerFeedback;

  it("accepts a name and comments, with relation optional", async () => {
    expect(await passes(v, { name: "Dana", comments: "Great pairing partner." })).toBe(true);
    expect(await passes(v, { name: "Dana", relation: "Peer", comments: "Great." })).toBe(true);
  });

  it("rejects a missing name or missing comments", async () => {
    expect(await failsWith(v, { comments: "Great." }, "Reviewer name is required")).toBe(true);
    expect(await failsWith(v, { name: "Dana" }, "Comments is required")).toBe(true);
  });

  it("rejects a non-string relation with 400", async () => {
    expect(await failsWith(v, { name: "Dana", comments: "Great.", relation: { $ne: null } }, "Relation must be text")).toBe(true);
  });
});

describe("validate.performance.appealCreate", () => {
  const v = validate.performance.appealCreate;

  it("accepts every reason category the contract defines", async () => {
    for (const reasonCategory of APPEAL_REASON_CATEGORIES) {
      expect(await passes(v, { reasonCategory, detail: "Please review the rating." })).toBe(true);
    }
  });

  it("rejects an unknown reason category or missing detail", async () => {
    expect(await failsWith(v, { reasonCategory: "unfair", detail: "x" }, "must be one of")).toBe(true);
    expect(await failsWith(v, { reasonCategory: "process" }, "Appeal detail is required")).toBe(true);
    expect(await failsWith(v, { detail: "x" }, "Reason category is required")).toBe(true);
  });
});

describe("validate.performance.appealResolve", () => {
  const v = validate.performance.appealResolve;

  it("accepts Upheld without a rating", async () => {
    expect(await passes(v, { resolution: "Upheld", resolverNote: "Rating stands." })).toBe(true);
  });

  it("accepts Adjusted with a valid rating", async () => {
    expect(await passes(v, { resolution: "Adjusted", resolvedRating: 4, resolverNote: "Raised after review." })).toBe(true);
  });

  it("rejects Adjusted without a rating", async () => {
    expect(await failsWith(v, { resolution: "Adjusted", resolverNote: "Raised." }, "Adjusted rating")).toBe(true);
  });

  it("rejects Adjusted with an out-of-scale rating", async () => {
    expect(await failsWith(v, { resolution: "Adjusted", resolvedRating: 0, resolverNote: "x" }, "between 1 and 5")).toBe(true);
  });

  it("rejects Upheld that also carries a rating", async () => {
    expect(await failsWith(v, { resolution: "Upheld", resolvedRating: 4, resolverNote: "x" }, "only applies when")).toBe(true);
  });

  it("requires a resolver note and a known resolution", async () => {
    expect(await failsWith(v, { resolution: "Upheld" }, "Resolver note is required")).toBe(true);
    expect(await failsWith(v, { resolution: "Reversed", resolverNote: "x" }, "must be one of")).toBe(true);
    expect(await failsWith(v, { resolverNote: "x" }, "Resolution is required")).toBe(true);
  });
});
