import { describe, it, expect } from "vitest";
import { isPasswordGateAllowed } from "../middleware/auth.js";

describe("isPasswordGateAllowed", () => {
  it("allows the three routes a locked account still needs", () => {
    expect(isPasswordGateAllowed("/api/v1/auth", "/change-password")).toBe(true);
    expect(isPasswordGateAllowed("/api/v1/auth", "/me")).toBe(true);
    expect(isPasswordGateAllowed("/api/v1/auth", "/logout")).toBe(true);
  });

  it("blocks every other authenticated route", () => {
    expect(isPasswordGateAllowed("/api/v1/employees", "/")).toBe(false);
    expect(isPasswordGateAllowed("/api/v1/employees", "/me")).toBe(false);
    expect(isPasswordGateAllowed("/api/v1/departments", "/")).toBe(false);
    expect(isPasswordGateAllowed("/api/v1/attendance", "/check-in")).toBe(false);
    expect(isPasswordGateAllowed("/api/v1/notifications", "/read-all")).toBe(false);
    expect(isPasswordGateAllowed("/api/v1/auth", "/users")).toBe(false);
    expect(isPasswordGateAllowed("/api/v1/auth", "/login")).toBe(false);
  });

  it("works regardless of the api mount prefix", () => {
    expect(isPasswordGateAllowed("/auth", "/change-password")).toBe(true);
    expect(isPasswordGateAllowed("/api/v2/auth", "/change-password")).toBe(true);
  });

  it("tolerates a trailing slash", () => {
    expect(isPasswordGateAllowed("/api/v1/auth/change-password", "/")).toBe(true);
    expect(isPasswordGateAllowed("/api/v1/employees", "/")).toBe(false);
  });

  it("does not crash on missing arguments", () => {
    expect(isPasswordGateAllowed()).toBe(false);
    expect(isPasswordGateAllowed(undefined, "/me")).toBe(false);
  });
});
