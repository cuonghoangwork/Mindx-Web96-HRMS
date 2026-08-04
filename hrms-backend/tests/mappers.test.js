/**
 * mappers.test.js — unit tests for utils/mappers.js
 *
 * Covers every toClient() and fromClient() function.
 * No DB connection required — pure functions only.
 */

import { describe, it, expect } from "vitest";
import {
  employeeToClient, employeeFromClient,
  departmentToClient, departmentFromClient,
  jobToClient, jobFromClient,
  candidateToClient, candidateFromClient,
  holidayToClient, holidayFromClient,
  attendanceToClient, attendanceFromClient,
  notificationToClient, notificationFromClient,
} from "../utils/mappers.js";

// ─── helpers ───────────────────────────────────────────────
function fakeId(n = 1) {
  return `507f1f77bcf86cd79943901${n}`;
}

function fakeMongo(fields) {
  // Simulate a plain Mongoose toObject() result
  return { _id: fakeId(), ...fields };
}

// ══════════════════════════════════════════════════════════
// EMPLOYEE
// ══════════════════════════════════════════════════════════
describe("employeeToClient", () => {
  it("maps _id → id string", () => {
    const doc = fakeMongo({ employeeId: "EMP001", name: "John", email: "j@test.com" });
    const result = employeeToClient(doc);
    expect(result.id).toBe(String(doc._id));
    expect(result).not.toHaveProperty("_id");
  });

  it("translates DB enum → client label for status", () => {
    expect(employeeToClient(fakeMongo({ status: "active" })).status).toBe("Active");
    expect(employeeToClient(fakeMongo({ status: "on-leave" })).status).toBe("On Leave");
    expect(employeeToClient(fakeMongo({ status: "terminated" })).status).toBe("Terminated");
  });

  it("translates DB enum → client label for contractType", () => {
    expect(employeeToClient(fakeMongo({ contractType: "full-time" })).type).toBe("Full-time");
    expect(employeeToClient(fakeMongo({ contractType: "part-time" })).type).toBe("Part-time");
    expect(employeeToClient(fakeMongo({ contractType: "contract" })).type).toBe("Contract");
    expect(employeeToClient(fakeMongo({ contractType: "intern" })).type).toBe("Intern");
  });

  it("translates DB gender → client sex", () => {
    expect(employeeToClient(fakeMongo({ gender: "male" })).sex).toBe("Male");
    expect(employeeToClient(fakeMongo({ gender: "female" })).sex).toBe("Female");
    expect(employeeToClient(fakeMongo({ gender: "other" })).sex).toBe("Other");
  });

  it("maps annualSalary → salary", () => {
    const result = employeeToClient(fakeMongo({ annualSalary: 60000 }));
    expect(result.salary).toBe(60000);
  });

  it("populates department name from nested object", () => {
    const doc = fakeMongo({ department: { _id: fakeId(2), name: "Engineering" } });
    const result = employeeToClient(doc);
    expect(result.department).toBe("Engineering");
    expect(result.departmentId).toBe(String(doc.department._id));
  });

  it("returns null department when field is absent", () => {
    const result = employeeToClient(fakeMongo({}));
    expect(result.department).toBeNull();
  });

  it("handles null input gracefully", () => {
    expect(employeeToClient(null)).toBeNull();
  });
});

describe("employeeFromClient", () => {
  it("translates client status → DB value", () => {
    expect(employeeFromClient({ status: "Active" }).status).toBe("active");
    expect(employeeFromClient({ status: "On Leave" }).status).toBe("on-leave");
    expect(employeeFromClient({ status: "Terminated" }).status).toBe("terminated");
  });

  it("translates client type → contractType DB value", () => {
    expect(employeeFromClient({ type: "Full-time" }).contractType).toBe("full-time");
    expect(employeeFromClient({ type: "Intern" }).contractType).toBe("intern");
  });

  it("translates client sex → gender DB value", () => {
    expect(employeeFromClient({ sex: "Male" }).gender).toBe("male");
    expect(employeeFromClient({ sex: "Female" }).gender).toBe("female");
  });

  it("maps salary → annualSalary as number", () => {
    expect(employeeFromClient({ salary: "85000" }).annualSalary).toBe(85000);
    expect(employeeFromClient({ salary: 0 }).annualSalary).toBe(0);
  });

  it("omits undefined fields", () => {
    const result = employeeFromClient({ name: "Jane" });
    expect(result).toHaveProperty("name", "Jane");
    expect(result).not.toHaveProperty("status");
    expect(result).not.toHaveProperty("contractType");
  });
});

// ══════════════════════════════════════════════════════════
// DEPARTMENT
// ══════════════════════════════════════════════════════════
describe("departmentToClient", () => {
  it("exposes id, name, budget", () => {
    const doc = fakeMongo({ name: "Design", budget: 200000 });
    const result = departmentToClient({ ...doc, employeeCount: 3, totalSalary: 90000 });
    expect(result.id).toBeTruthy();
    expect(result.name).toBe("Design");
    expect(result.budget).toBe(200000);
    expect(result.employees).toBe(3);
    expect(result.totalSalary).toBe(90000);
  });

  it("prefers managerName over populated manager.name", () => {
    const doc = fakeMongo({
      managerName: "Alice",
      manager: { _id: fakeId(3), name: "Bob" },
    });
    expect(departmentToClient({ ...doc, employeeCount: 0, totalSalary: 0 }).manager).toBe("Alice");
  });
});

describe("departmentFromClient", () => {
  it("converts budget to number", () => {
    expect(departmentFromClient({ budget: "150000" }).budget).toBe(150000);
  });

  it("does not include manager (resolved separately)", () => {
    const result = departmentFromClient({ name: "HR", manager: "Bob" });
    expect(result).not.toHaveProperty("manager");
  });
});

// ══════════════════════════════════════════════════════════
// JOB
// ══════════════════════════════════════════════════════════
describe("jobToClient", () => {
  it("maps status open → Open", () => {
    expect(jobToClient(fakeMongo({ status: "open" })).status).toBe("Open");
    expect(jobToClient(fakeMongo({ status: "filled" })).status).toBe("Filled");
    expect(jobToClient(fakeMongo({ status: "closed" })).status).toBe("Closed");
  });

  it("maps type full-time → Full-time", () => {
    expect(jobToClient(fakeMongo({ type: "full-time" })).type).toBe("Full-time");
    expect(jobToClient(fakeMongo({ type: "intern" })).type).toBe("Intern");
  });

  it("formats postedDate as YYYY-MM-DD", () => {
    const doc = fakeMongo({ postedDate: new Date("2026-03-15T00:00:00Z") });
    expect(jobToClient(doc).postedDate).toBe("2026-03-15");
  });

  it("defaults applicantCount to 0 when absent", () => {
    expect(jobToClient(fakeMongo({})).applicantCount).toBe(0);
  });

  // Task 5.1 — expanded Job fields
  it("passes through requirements/benefits arrays, defaulting to []", () => {
    expect(jobToClient(fakeMongo({})).requirements).toEqual([]);
    expect(jobToClient(fakeMongo({})).benefits).toEqual([]);
    const doc = fakeMongo({ requirements: ["3+ years React"], benefits: ["Health insurance"] });
    expect(jobToClient(doc).requirements).toEqual(["3+ years React"]);
    expect(jobToClient(doc).benefits).toEqual(["Health insurance"]);
  });

  it("defaults salaryCurrency to USD and leaves min/max null when absent", () => {
    const client = jobToClient(fakeMongo({}));
    expect(client.salaryCurrency).toBe("USD");
    expect(client.salaryMin).toBeNull();
    expect(client.salaryMax).toBeNull();
  });

  it("formats deadline as YYYY-MM-DD, null when absent", () => {
    expect(jobToClient(fakeMongo({})).deadline).toBeNull();
    const doc = fakeMongo({ deadline: new Date("2026-09-01T00:00:00Z") });
    expect(jobToClient(doc).deadline).toBe("2026-09-01");
  });
});

describe("jobFromClient", () => {
  it("maps status Open → open", () => {
    expect(jobFromClient({ status: "Open" }).status).toBe("open");
    expect(jobFromClient({ status: "Closed" }).status).toBe("closed");
  });

  it("maps type Full-time → full-time", () => {
    expect(jobFromClient({ type: "Full-time" }).type).toBe("full-time");
    expect(jobFromClient({ type: "Contract" }).type).toBe("contract");
  });

  it("parses postedDate string to Date", () => {
    const result = jobFromClient({ postedDate: "2026-06-01" });
    expect(result.postedDate).toBeInstanceOf(Date);
  });

  // Task 5.1 — expanded Job fields
  it("splits a newline-separated requirements/benefits textarea value into a trimmed string array", () => {
    const result = jobFromClient({
      requirements: "3+ years React\n\nOwns ambiguity\n  Excellent communication  ",
      benefits: "Health insurance\nRemote-friendly",
    });
    expect(result.requirements).toEqual(["3+ years React", "Owns ambiguity", "Excellent communication"]);
    expect(result.benefits).toEqual(["Health insurance", "Remote-friendly"]);
  });

  it("accepts requirements/benefits already as arrays", () => {
    const result = jobFromClient({ requirements: ["A", " B "], benefits: [] });
    expect(result.requirements).toEqual(["A", "B"]);
    expect(result.benefits).toEqual([]);
  });

  it("coerces salaryMin/salaryMax to numbers, empty string to null", () => {
    expect(jobFromClient({ salaryMin: "50000", salaryMax: "70000" })).toMatchObject({
      salaryMin: 50000,
      salaryMax: 70000,
    });
    expect(jobFromClient({ salaryMin: "" }).salaryMin).toBeNull();
  });

  it("parses deadline string to Date, empty/null to null", () => {
    expect(jobFromClient({ deadline: "2026-09-01" }).deadline).toBeInstanceOf(Date);
    expect(jobFromClient({ deadline: "" }).deadline).toBeNull();
    expect(jobFromClient({ deadline: null }).deadline).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════
// CANDIDATE
// ══════════════════════════════════════════════════════════
describe("candidateToClient", () => {
  it("maps stage applied → Applied", () => {
    expect(candidateToClient(fakeMongo({ stage: "applied" })).stage).toBe("Applied");
    expect(candidateToClient(fakeMongo({ stage: "hired" })).stage).toBe("Hired");
    expect(candidateToClient(fakeMongo({ stage: "rejected" })).stage).toBe("Rejected");
  });

  it("maps job ObjectId → jobId string", () => {
    const doc = fakeMongo({ job: fakeId(5) });
    expect(candidateToClient(doc).jobId).toBe(fakeId(5));
  });

  it("formats appliedDate as YYYY-MM-DD", () => {
    const doc = fakeMongo({ appliedDate: new Date("2026-01-20T00:00:00Z") });
    expect(candidateToClient(doc).appliedDate).toBe("2026-01-20");
  });
});

describe("candidateFromClient", () => {
  it("maps stage Applied → applied", () => {
    expect(candidateFromClient({ stage: "Applied" }).stage).toBe("applied");
    expect(candidateFromClient({ stage: "Screening" }).stage).toBe("screening");
    expect(candidateFromClient({ stage: "Offer" }).stage).toBe("offer");
  });

  it("maps jobId → job field", () => {
    const id = fakeId(7);
    expect(candidateFromClient({ jobId: id }).job).toBe(id);
  });

  it("coerces rating to number", () => {
    expect(candidateFromClient({ rating: "4.5" }).rating).toBe(4.5);
  });
});

// ══════════════════════════════════════════════════════════
// HOLIDAY
// ══════════════════════════════════════════════════════════
describe("holidayToClient", () => {
  it("maps type public → Public", () => {
    expect(holidayToClient(fakeMongo({ type: "public" })).type).toBe("Public");
    expect(holidayToClient(fakeMongo({ type: "company" })).type).toBe("Company");
    expect(holidayToClient(fakeMongo({ type: "optional" })).type).toBe("Optional");
  });

  it("formats date as YYYY-MM-DD", () => {
    const doc = fakeMongo({ date: new Date("2026-09-02T00:00:00Z") });
    expect(holidayToClient(doc).date).toBe("2026-09-02");
  });
});

describe("holidayFromClient", () => {
  it("maps type Public → public", () => {
    expect(holidayFromClient({ type: "Public" }).type).toBe("public");
    expect(holidayFromClient({ type: "Optional" }).type).toBe("optional");
  });

  it("parses date string to Date object", () => {
    const result = holidayFromClient({ date: "2026-09-02" });
    expect(result.date).toBeInstanceOf(Date);
  });
});

// ══════════════════════════════════════════════════════════
// ATTENDANCE
// ══════════════════════════════════════════════════════════
describe("attendanceToClient", () => {
  it("maps status present → Present", () => {
    expect(attendanceToClient(fakeMongo({ status: "present" })).status).toBe("Present");
    expect(attendanceToClient(fakeMongo({ status: "late" })).status).toBe("Late");
    expect(attendanceToClient(fakeMongo({ status: "on-leave" })).status).toBe("On Leave");
    expect(attendanceToClient(fakeMongo({ status: "absent" })).status).toBe("Absent");
  });

  it("maps employee ref → employeeId string", () => {
    const doc = fakeMongo({ employee: fakeId(9) });
    expect(attendanceToClient(doc).employeeId).toBe(fakeId(9));
  });

  it("formats date as YYYY-MM-DD", () => {
    const doc = fakeMongo({ date: new Date("2026-01-15T00:00:00Z") });
    expect(attendanceToClient(doc).date).toBe("2026-01-15");
  });
});

describe("attendanceFromClient", () => {
  it("maps status Present → present", () => {
    expect(attendanceFromClient({ status: "Present" }).status).toBe("present");
    expect(attendanceFromClient({ status: "On Leave" }).status).toBe("on-leave");
  });

  it("maps employeeId → employee field", () => {
    const id = fakeId(11);
    expect(attendanceFromClient({ employeeId: id }).employee).toBe(id);
  });
});

// ══════════════════════════════════════════════════════════
// NOTIFICATION
// ══════════════════════════════════════════════════════════
describe("notificationToClient", () => {
  it("maps createdAt → timestamp", () => {
    const now = new Date();
    const doc = fakeMongo({ createdAt: now, category: "leave", title: "Test" });
    expect(notificationToClient(doc).timestamp).toBe(now);
  });

  it("bridges hiring → interview category for frontend", () => {
    const doc = fakeMongo({ category: "hiring", title: "Interview scheduled" });
    // "hiring" in DB maps back to "interview" for the frontend
    expect(notificationToClient(doc).category).toBe("interview");
  });

  it("exposes id, title, message, read", () => {
    const doc = fakeMongo({ title: "Hello", message: "World", read: false, category: "system" });
    const result = notificationToClient(doc);
    expect(result.title).toBe("Hello");
    expect(result.message).toBe("World");
    expect(result.read).toBe(false);
    expect(result.id).toBeTruthy();
  });
});

describe("notificationFromClient", () => {
  it("maps interview → hiring for DB storage", () => {
    expect(notificationFromClient({ category: "interview" }).category).toBe("hiring");
  });

  it("passes through non-bridged categories unchanged", () => {
    expect(notificationFromClient({ category: "leave" }).category).toBe("leave");
    expect(notificationFromClient({ category: "system" }).category).toBe("system");
  });
});
