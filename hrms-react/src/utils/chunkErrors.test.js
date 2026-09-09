import { describe, it, expect } from "vitest";
import { isChunkLoadError } from "./chunkErrors";

describe("isChunkLoadError", () => {
  // The whole point of the predicate is that the three engines disagree about
  // the wording, so each one gets its own case. If a browser changes its
  // message these are the tests that should fail.
  it("matches Chrome's wording", () => {
    expect(
      isChunkLoadError(
        new TypeError(
          "Failed to fetch dynamically imported module: https://app/assets/Payroll-a1b2c3.js",
        ),
      ),
    ).toBe(true);
  });

  it("matches Firefox's wording", () => {
    expect(
      isChunkLoadError(new TypeError("error loading dynamically imported module")),
    ).toBe(true);
  });

  it("matches Safari's wording", () => {
    expect(isChunkLoadError(new TypeError("Importing a module script failed."))).toBe(true);
  });

  it("matches the raw SyntaxError from parsing index.html as JavaScript", () => {
    // This is what the browser actually throws when the catch-all rewrite
    // serves index.html with a 200 in place of a missing chunk.
    expect(isChunkLoadError(new SyntaxError("Unexpected token '<'"))).toBe(true);
  });

  it("does not match an ordinary application error", () => {
    // A reload cannot fix a real bug, and reloading on one would turn a
    // readable stack trace into a refresh the user cannot escape.
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined"))).toBe(false);
  });

  it("does not match a failed API call", () => {
    expect(isChunkLoadError(new Error("Network request failed"))).toBe(false);
  });

  it("survives being handed something that is not an Error", () => {
    // getDerivedStateFromError receives whatever was thrown, which is not
    // guaranteed to be an Error instance.
    expect(isChunkLoadError(undefined)).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError("Failed to fetch dynamically imported module")).toBe(true);
  });
});
