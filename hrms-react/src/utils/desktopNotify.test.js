/**
 * desktopNotify.test.js — the two-switch gate in front of OS toasts.
 *
 * Everything here is about NOT showing a notification. Showing one is the
 * easy path; the failure that matters is toasting when the user did not ask,
 * or when they are already looking at the app, because that is the kind of
 * thing people fix by blocking the site permanently.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isSupported,
  permissionState,
  isWanted,
  setWanted,
  isEnabled,
  ensurePermission,
  shouldNotify,
  showDesktopNotification,
} from "./desktopNotify";

/** Install a fake Notification API with a given permission. */
function stubNotification(permission, { requestPermission } = {}) {
  const instances = [];
  class FakeNotification {
    constructor(title, options) {
      this.title = title;
      this.options = options;
      this.close = vi.fn();
      instances.push(this);
    }
  }
  FakeNotification.permission = permission;
  FakeNotification.requestPermission = requestPermission ?? vi.fn(async () => permission);
  window.Notification = FakeNotification;
  return { FakeNotification, instances };
}

beforeEach(() => {
  localStorage.clear();
  delete window.Notification;
  // jsdom reports the document as visible; individual tests override.
  vi.spyOn(document, "hidden", "get").mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
  delete window.Notification;
});

describe("capability detection", () => {
  it("reports unsupported when the browser has no Notification API", () => {
    expect(isSupported()).toBe(false);
    expect(permissionState()).toBe("unsupported");
    // iOS Safari has never supported this. Treating absence as "not yet
    // granted" would render a toggle that can never succeed.
    expect(isEnabled()).toBe(false);
  });

  it("reads the live browser permission, not a cached copy", () => {
    stubNotification("default");
    expect(permissionState()).toBe("default");
    window.Notification.permission = "granted";
    expect(permissionState()).toBe("granted");
  });
});

describe("the wanted flag", () => {
  it("defaults to off, so a granted permission alone toasts nothing", () => {
    stubNotification("granted");
    // Permission may have been granted months ago, or by a previous feature.
    // It is not consent for this one.
    expect(isWanted()).toBe(false);
    expect(isEnabled()).toBe(false);
  });

  it("round-trips through localStorage", () => {
    stubNotification("granted");
    setWanted(true);
    expect(isWanted()).toBe(true);
    expect(isEnabled()).toBe(true);

    setWanted(false);
    expect(isWanted()).toBe(false);
    expect(isEnabled()).toBe(false);
  });

  it("treats unreadable storage as off rather than throwing", () => {
    stubNotification("granted");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    // A private window throws on access rather than returning null. Settings
    // has to render regardless.
    expect(() => isWanted()).not.toThrow();
    expect(isWanted()).toBe(false);
  });

  it("does not throw when the preference cannot be persisted", () => {
    stubNotification("granted");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => setWanted(true)).not.toThrow();
  });
});

describe("isEnabled — both switches required", () => {
  it.each([
    ["denied", true, false],
    ["default", true, false],
    ["granted", false, false],
    ["granted", true, true],
  ])("permission=%s wanted=%s -> %s", (permission, wanted, expected) => {
    stubNotification(permission);
    if (wanted) setWanted(true);
    expect(isEnabled()).toBe(expected);
  });
});

describe("ensurePermission", () => {
  it("asks the browser only when the user has not decided yet", async () => {
    const request = vi.fn(async () => "granted");
    stubNotification("default", { requestPermission: request });

    expect(await ensurePermission()).toBe("granted");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("does not re-ask once granted", async () => {
    const request = vi.fn(async () => "granted");
    stubNotification("granted", { requestPermission: request });

    expect(await ensurePermission()).toBe("granted");
    expect(request).not.toHaveBeenCalled();
  });

  it("does not re-ask once denied — that is unrecoverable from script", async () => {
    const request = vi.fn(async () => "denied");
    stubNotification("denied", { requestPermission: request });

    expect(await ensurePermission()).toBe("denied");
    expect(request).not.toHaveBeenCalled();
  });

  it("survives a browser that rejects the request", async () => {
    stubNotification("default", {
      requestPermission: vi.fn(async () => {
        throw new Error("not allowed");
      }),
    });
    await expect(ensurePermission()).resolves.toBe("default");
  });
});

describe("shouldNotify", () => {
  const notice = { id: "n1", category: "leave", title: "Leave approved" };

  function enabled() {
    stubNotification("granted");
    setWanted(true);
  }

  it("toasts an ordinary notification while the tab is hidden", () => {
    enabled();
    expect(shouldNotify(notice, { hidden: true })).toBe(true);
  });

  it("stays silent while the user is looking at the app", () => {
    enabled();
    // The in-app list already updated live over SSE. An OS toast on top of
    // something the user can see is pure noise.
    expect(shouldNotify(notice, { hidden: false })).toBe(false);
  });

  it("never toasts the 'system' category", () => {
    enabled();
    // Per the urgency map: housekeeping like "attendance closed for Sep 12"
    // is in-app only. It is the highest-volume category and the least
    // actionable, which is exactly how a notification system gets muted.
    expect(shouldNotify({ ...notice, category: "system" }, { hidden: true })).toBe(false);
  });

  it("stays silent when the feature is off, however hidden the tab is", () => {
    stubNotification("granted"); // permission yes, wanted no
    expect(shouldNotify(notice, { hidden: true })).toBe(false);
  });

  it("handles a missing notification without throwing", () => {
    enabled();
    expect(shouldNotify(null, { hidden: true })).toBe(false);
  });
});

describe("showDesktopNotification", () => {
  it("refuses to construct anything without permission", () => {
    const { instances } = stubNotification("default");
    expect(showDesktopNotification({ title: "x", body: "y" })).toBeNull();
    expect(instances).toHaveLength(0);
  });

  it("passes the id through as the tag so duplicates collapse", () => {
    const { instances } = stubNotification("granted");

    showDesktopNotification({ title: "Leave approved", body: "Two days", tag: "n1" });

    expect(instances).toHaveLength(1);
    expect(instances[0].title).toBe("Leave approved");
    expect(instances[0].options).toEqual({ body: "Two days", tag: "n1" });
  });

  it("routes a click to onActivate and closes the toast", () => {
    const { instances } = stubNotification("granted");
    const onActivate = vi.fn();

    const toast = showDesktopNotification({ title: "x", body: "y", tag: "n1", onActivate });
    toast.onclick();

    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(instances[0].close).toHaveBeenCalledTimes(1);
  });

  it("returns null instead of throwing when construction fails", () => {
    // Android Chrome throws here — it requires a service worker. Failing to
    // toast must never break the in-app notification that triggered it.
    window.Notification = class {
      constructor() {
        throw new Error("Illegal constructor");
      }
    };
    window.Notification.permission = "granted";

    expect(() => showDesktopNotification({ title: "x" })).not.toThrow();
    expect(showDesktopNotification({ title: "x" })).toBeNull();
  });
});
