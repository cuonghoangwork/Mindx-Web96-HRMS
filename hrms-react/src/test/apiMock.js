import { vi } from "vitest";

/**
 * Replace every method on every exported API namespace with a vi.fn().
 *
 * Derived from the real module rather than hand-listed, so adding an endpoint
 * to api/index.js does not silently leave a hole in the mock — a hand-written
 * list is exactly the kind of duplicate that goes stale (see the CATEGORIES
 * list that lost "overtime" in hrms-backend/tests/notifyPolicy.test.js).
 *
 * Usage, in a test file:
 *
 *   vi.mock("../api", async (importOriginal) => {
 *     const { mockAllApis } = await import("../test/apiMock");
 *     return mockAllApis(importOriginal);
 *   });
 *
 * Every mocked call resolves to { items: [], data: null } by default, which is
 * the shape almost all call sites destructure (`res.items || []`, `res.data`).
 * A test that cares about a specific response overrides that one method.
 */
export async function mockAllApis(importOriginal) {
  const actual = await importOriginal();
  const mocked = {};

  for (const [namespace, value] of Object.entries(actual)) {
    if (!value || typeof value !== "object") {
      // API_BASE and friends — plain values, pass them through untouched.
      mocked[namespace] = value;
      continue;
    }
    mocked[namespace] = Object.fromEntries(
      Object.entries(value).map(([method, impl]) => [
        method,
        typeof impl === "function"
          ? vi.fn().mockResolvedValue({ items: [], data: null })
          : impl,
      ]),
    );
  }

  return mocked;
}

/**
 * Stand-in for api/notificationStream.
 *
 * StoreProvider opens an SSE connection on mount and calls connection.close()
 * on cleanup, so the fake has to return something closable or every unmount
 * throws. jsdom has no EventSource, so the real module cannot run here.
 */
export function mockNotificationStream() {
  const close = vi.fn();
  const connect = vi.fn(() => ({ close }));
  return { connectNotificationStream: connect, default: connect };
}
