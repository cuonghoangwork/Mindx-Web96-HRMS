import { describe, it, expect, afterEach } from "vitest";
import {
  assertCanAssignRole,
  assignableRoles,
  generateTempPassword,
  resolveAccountEmail,
} from "../utils/credentials.js";

const originalDomain = process.env.ACCOUNT_EMAIL_DOMAIN;

afterEach(() => {
  if (originalDomain === undefined) delete process.env.ACCOUNT_EMAIL_DOMAIN;
  else process.env.ACCOUNT_EMAIL_DOMAIN = originalDomain;
});

describe("generateTempPassword", () => {
  it("respects the requested length and a minimum of 8", () => {
    expect(generateTempPassword()).toHaveLength(12);
    expect(generateTempPassword(16)).toHaveLength(16);
    expect(generateTempPassword(4)).toHaveLength(8);
  });

  it("always contains upper, lower, digit and symbol", () => {
    for (let i = 0; i < 100; i += 1) {
      const pw = generateTempPassword();
      expect(pw).toMatch(/[A-Z]/);
      expect(pw).toMatch(/[a-z]/);
      expect(pw).toMatch(/[0-9]/);
      expect(pw).toMatch(/[!@#$%&*?]/);
    }
  });

  it("never uses easily confused characters", () => {
    for (let i = 0; i < 100; i += 1) {
      expect(generateTempPassword(20)).not.toMatch(/[0O1lI]/);
    }
  });

  it("does not repeat across 200 draws", () => {
    const seen = new Set();
    for (let i = 0; i < 200; i += 1) seen.add(generateTempPassword());
    expect(seen.size).toBe(200);
  });
});

describe("resolveAccountEmail", () => {
  it("normalises a supplied email", () => {
    expect(resolveAccountEmail("EMP009", "  John.Doe@HRMS.com  ")).toBe("john.doe@hrms.com");
  });

  it("derives an email from the employee id when none is supplied", () => {
    expect(resolveAccountEmail("EMP009", "")).toBe("emp009@hrms.com");
    expect(resolveAccountEmail("EMP009", undefined)).toBe("emp009@hrms.com");
    expect(resolveAccountEmail("EMP009", "   ")).toBe("emp009@hrms.com");
  });

  it("honours ACCOUNT_EMAIL_DOMAIN", () => {
    process.env.ACCOUNT_EMAIL_DOMAIN = "Acme.VN";
    expect(resolveAccountEmail("emp010", null)).toBe("emp010@acme.vn");
  });

  it("throws when neither an email nor an employee id is available", () => {
    expect(() => resolveAccountEmail("", "")).toThrow(/employeeId is required/);
  });
});

describe("assignableRoles / assertCanAssignRole", () => {
  it("lets ADMIN assign every role", () => {
    expect(assignableRoles("ADMIN")).toEqual(["EMPLOYEE", "MANAGER", "HR", "ADMIN"]);
    expect(assertCanAssignRole("ADMIN", "EMPLOYEE")).toBe("EMPLOYEE");
    expect(assertCanAssignRole("ADMIN", "MANAGER")).toBe("MANAGER");
    expect(assertCanAssignRole("ADMIN", "HR")).toBe("HR");
    expect(assertCanAssignRole("ADMIN", "ADMIN")).toBe("ADMIN");
  });

  it("lets HR assign EMPLOYEE and MANAGER but not HR or ADMIN", () => {
    expect(assignableRoles("HR")).toEqual(["EMPLOYEE", "MANAGER"]);
    expect(assertCanAssignRole("HR", "EMPLOYEE")).toBe("EMPLOYEE");
    expect(assertCanAssignRole("HR", "MANAGER")).toBe("MANAGER");
    expect(() => assertCanAssignRole("HR", "HR")).toThrow(/cannot create HR/);
    expect(() => assertCanAssignRole("HR", "ADMIN")).toThrow(/cannot create ADMIN/);
  });

  it("limits MANAGER to EMPLOYEE", () => {
    expect(assignableRoles("MANAGER")).toEqual(["EMPLOYEE"]);
    expect(assertCanAssignRole("MANAGER", "EMPLOYEE")).toBe("EMPLOYEE");
    expect(() => assertCanAssignRole("MANAGER", "MANAGER")).toThrow(/cannot create MANAGER/);
    expect(() => assertCanAssignRole("MANAGER", "HR")).toThrow(/cannot create HR/);
    expect(() => assertCanAssignRole("MANAGER", "ADMIN")).toThrow(/cannot create ADMIN/);
  });

  it("lets EMPLOYEE and unknown roles assign nothing", () => {
    expect(assignableRoles("EMPLOYEE")).toEqual([]);
    ["EMPLOYEE", "MANAGER", "HR", "ADMIN"].forEach((role) => {
      expect(() => assertCanAssignRole("EMPLOYEE", role)).toThrow();
      expect(() => assertCanAssignRole(undefined, role)).toThrow();
    });
  });

  it("marks the refusal as a 403 so the controller can pass it through", () => {
    try {
      assertCanAssignRole("MANAGER", "ADMIN");
      throw new Error("should have thrown");
    } catch (err) {
      expect(err.status).toBe(403);
    }
  });
});
