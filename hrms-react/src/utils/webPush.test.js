/**
 * webPush.test.js — subscription plumbing.
 *
 * jsdom implements neither ServiceWorker nor PushManager, so both are stubbed.
 * That is fine for what matters here: every one of these is about refusing
 * cleanly rather than throwing at a user who is on an unsupported browser, has
 * declined the permission, or is on a deployment with no VAPID keys.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isPushSupported,
  urlBase64ToUint8Array,
  registerServiceWorker,
  currentSubscription,
  subscribeToPush,
  unsubscribeFromPush,
} from "./webPush";

function stubPushEnvironment({ permission = "granted", subscription = null, subscribeImpl } = {}) {
  const pushManager = {
    getSubscription: vi.fn(async () => subscription),
    subscribe: vi.fn(subscribeImpl ?? (async () => ({ toJSON: () => ({ endpoint: "https://push.test/x" }) }))),
  };
  const registration = { pushManager };

  navigator.serviceWorker = {
    register: vi.fn(async () => registration),
    getRegistration: vi.fn(async () => registration),
    ready: Promise.resolve(registration),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  window.PushManager = function PushManager() {};

  class FakeNotification {}
  FakeNotification.permission = permission;
  FakeNotification.requestPermission = vi.fn(async () => permission);
  window.Notification = FakeNotification;

  return { registration, pushManager };
}

beforeEach(() => {
  delete navigator.serviceWorker;
  delete window.PushManager;
  delete window.Notification;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete navigator.serviceWorker;
  delete window.PushManager;
  delete window.Notification;
});

describe("isPushSupported", () => {
  it("is false without a service worker or PushManager", () => {
    // iOS Safari outside a Home Screen PWA, and every browser in private mode
    // on some platforms. The toggle must render disabled, not explode.
    expect(isPushSupported()).toBe(false);
  });

  it("is true when both exist", () => {
    stubPushEnvironment();
    expect(isPushSupported()).toBe(true);
  });
});

describe("urlBase64ToUint8Array", () => {
  it("decodes a base64url VAPID key to raw bytes", () => {
    // applicationServerKey must be bytes. Passing the string through is the
    // single most common way this feature fails to start, and the browser's
    // error ("InvalidCharacterError") names nothing useful.
    const bytes = urlBase64ToUint8Array("SGVsbG8");
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(bytes)).toEqual([72, 101, 108, 108, 111]);
  });

  it("restores padding that base64url strips", () => {
    expect(Array.from(urlBase64ToUint8Array("QQ"))).toEqual([65]);
    expect(Array.from(urlBase64ToUint8Array("QUI"))).toEqual([65, 66]);
    expect(Array.from(urlBase64ToUint8Array("QUJD"))).toEqual([65, 66, 67]);
  });

  it("translates the URL-safe alphabet back to standard base64", () => {
    // Real VAPID keys contain - and _, which atob() rejects outright.
    expect(() => urlBase64ToUint8Array("a-b_cw")).not.toThrow();
    expect(Array.from(urlBase64ToUint8Array("a-b_cw"))).toEqual(
      Array.from(urlBase64ToUint8Array("a+b/cw")),
    );
  });
});

describe("registerServiceWorker", () => {
  it("returns null rather than throwing when unsupported", async () => {
    expect(await registerServiceWorker()).toBeNull();
  });

  it("registers at the root scope", async () => {
    stubPushEnvironment();
    await registerServiceWorker();
    // A worker only controls pages at or below its own path; registering it
    // anywhere but "/" means pushes silently never arrive.
    expect(navigator.serviceWorker.register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
  });

  it("returns null when registration is refused", async () => {
    stubPushEnvironment();
    navigator.serviceWorker.register = vi.fn(async () => {
      throw new Error("insecure context");
    });
    expect(await registerServiceWorker()).toBeNull();
  });
});

describe("subscribeToPush", () => {
  it("refuses on an unsupported browser", async () => {
    expect(await subscribeToPush("key")).toEqual({ ok: false, reason: "unsupported" });
  });

  it("refuses without a public key rather than calling subscribe", async () => {
    const { pushManager } = stubPushEnvironment();
    expect(await subscribeToPush("")).toEqual({ ok: false, reason: "no-public-key" });
    // A deployment with no VAPID keys must not raise a permission prompt it
    // cannot act on.
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });

  it("refuses when the OS permission was denied", async () => {
    const { pushManager } = stubPushEnvironment({ permission: "denied" });
    expect(await subscribeToPush("SGVsbG8")).toEqual({ ok: false, reason: "denied" });
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });

  it("subscribes with userVisibleOnly and a decoded key", async () => {
    const { pushManager } = stubPushEnvironment();

    const result = await subscribeToPush("SGVsbG8");

    expect(result.ok).toBe(true);
    expect(result.subscription).toEqual({ endpoint: "https://push.test/x" });
    const [options] = pushManager.subscribe.mock.calls[0];
    // Every browser requires this to be true — silent push does not exist on
    // the web, and omitting it makes subscribe() throw.
    expect(options.userVisibleOnly).toBe(true);
    expect(options.applicationServerKey).toBeInstanceOf(Uint8Array);
  });

  it("reports a failed subscribe instead of throwing", async () => {
    stubPushEnvironment({
      subscribeImpl: async () => {
        throw new Error("AbortError: registration failed");
      },
    });
    const result = await subscribeToPush("SGVsbG8");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("subscribe-failed");
  });
});

describe("unsubscribeFromPush", () => {
  it("returns a null endpoint when there was nothing subscribed", async () => {
    stubPushEnvironment({ subscription: null });
    expect(await unsubscribeFromPush()).toEqual({ ok: true, endpoint: null });
  });

  it("returns the endpoint so the caller can delete the server row", async () => {
    const unsubscribe = vi.fn(async () => true);
    stubPushEnvironment({ subscription: { endpoint: "https://push.test/gone", unsubscribe } });

    expect(await unsubscribeFromPush()).toEqual({ ok: true, endpoint: "https://push.test/gone" });
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("still reports the endpoint when the browser refuses to unsubscribe", async () => {
    stubPushEnvironment({
      subscription: {
        endpoint: "https://push.test/stuck",
        unsubscribe: async () => {
          throw new Error("nope");
        },
      },
    });
    // The server row must go regardless, or it keeps pushing to an endpoint
    // the user has disowned.
    expect(await unsubscribeFromPush()).toEqual({ ok: true, endpoint: "https://push.test/stuck" });
  });
});

describe("currentSubscription", () => {
  it("is null on an unsupported browser", async () => {
    expect(await currentSubscription()).toBeNull();
  });

  it("returns whatever this browser already holds", async () => {
    stubPushEnvironment({ subscription: { endpoint: "https://push.test/existing" } });
    expect(await currentSubscription()).toEqual({ endpoint: "https://push.test/existing" });
  });
});
