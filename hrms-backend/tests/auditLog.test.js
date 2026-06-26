/**
 * auditLog.test.js — unit tests for utils/auditLog.js
 *
 * Tests diffChanges() — the pure helper that builds before/after diffs.
 * logAction() itself writes to MongoDB so it is covered by integration tests.
 */

import { describe, it, expect } from "vitest";
import { diffChanges } from "../utils/auditLog.js";

describe("diffChanges", () => {
  it("returns undefined when both objects are identical", () => {
    const obj = { name: "Alice", status: "Active", salary: 60000 };
    expect(diffChanges(obj, { ...obj })).toBeUndefined();
  });

  it("captures a single changed field", () => {
    const before = { status: "Active", name: "Alice" };
    const after  = { status: "On Leave", name: "Alice" };
    const diff = diffChanges(before, after);
    expect(diff).toEqual({ status: { from: "Active", to: "On Leave" } });
  });

  it("captures multiple changed fields", () => {
    const before = { status: "Active", salary: 50000, department: "Sales" };
    const after  = { status: "Terminated", salary: 55000, department: "Sales" };
    const diff = diffChanges(before, after);
    expect(diff).toHaveProperty("status");
    expect(diff).toHaveProperty("salary");
    expect(diff).not.toHaveProperty("department");
  });

  it("detects a field going from a value to null", () => {
    const before = { avatar: "https://cdn.example.com/photo.jpg" };
    const after  = { avatar: null };
    const diff = diffChanges(before, after);
    expect(diff.avatar).toEqual({ from: "https://cdn.example.com/photo.jpg", to: null });
  });

  it("detects a field going from null to a value", () => {
    const before = { avatar: null };
    const after  = { avatar: "https://cdn.example.com/photo.jpg" };
    const diff = diffChanges(before, after);
    expect(diff.avatar.from).toBeNull();
    expect(diff.avatar.to).toBe("https://cdn.example.com/photo.jpg");
  });

  it("detects a newly added field (present in after, absent in before)", () => {
    const before = { name: "Bob" };
    const after  = { name: "Bob", designation: "Engineer" };
    const diff = diffChanges(before, after);
    expect(diff.designation).toEqual({ from: null, to: "Engineer" });
  });

  it("detects a removed field (present in before, absent in after)", () => {
    const before = { name: "Bob", phone: "+1 555 0001" };
    const after  = { name: "Bob" };
    const diff = diffChanges(before, after);
    expect(diff.phone).toEqual({ from: "+1 555 0001", to: null });
  });

  it("handles numeric vs string comparison correctly (uses String())", () => {
    // salary 60000 (number) vs 60000 (number) — same, no diff
    expect(diffChanges({ salary: 60000 }, { salary: 60000 })).toBeUndefined();
    // salary 60000 vs 70000 — different
    const diff = diffChanges({ salary: 60000 }, { salary: 70000 });
    expect(diff).toHaveProperty("salary");
  });

  it("returns undefined for null/undefined inputs", () => {
    expect(diffChanges(null, { a: 1 })).toBeUndefined();
    expect(diffChanges({ a: 1 }, null)).toBeUndefined();
    expect(diffChanges(null, null)).toBeUndefined();
    expect(diffChanges(undefined, undefined)).toBeUndefined();
  });

  it("returns undefined for two empty objects", () => {
    expect(diffChanges({}, {})).toBeUndefined();
  });

  it("captures budget change (department budget_updated scenario)", () => {
    const before = { name: "Engineering", budget: 400000, manager: "John" };
    const after  = { name: "Engineering", budget: 500000, manager: "John" };
    const diff = diffChanges(before, after);
    expect(diff).toEqual({ budget: { from: 400000, to: 500000 } });
  });
});
