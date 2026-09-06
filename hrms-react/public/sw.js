/**
 * sw.js — service worker for Web Push (Level 3).
 *
 * Lives in public/ so Vite serves it verbatim at /sw.js in both dev and the
 * built dist/. A service worker can only control pages at or below its own
 * path, so this MUST stay at the root — moving it under /assets/ would
 * silently scope it to /assets/ and it would never receive a push.
 *
 * Deliberately not bundled: no imports, no build step, plain ES5-ish syntax.
 * A service worker updates on its own schedule and an old one can linger for
 * a long time, so the less it does the fewer versions can be in play at once.
 */

// Take over as soon as installed rather than waiting for every tab to close.
// Without these two, a returning user runs last week's worker until they
// close every HRMS tab they have open.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // A payload we cannot parse is not worth a blank notification.
    return;
  }

  const title = data.title || "HRMS";
  const options = {
    body: data.body || "",
    tag: data.tag || data.id || undefined,
    data: { url: data.url || "/" },
  };

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // THE DOUBLE-TOAST FIX. With a tab open, the SSE stream has already
        // delivered this notification and the app has already decided whether
        // to raise a desktop toast (see hrms-react/src/utils/desktopNotify.js).
        // Showing an OS notification here as well would produce two for one
        // event. Hand it to the page instead and let the existing logic run.
        const visible = clients.some((client) => client.visibilityState === "visible");
        if (visible) {
          clients.forEach((client) => client.postMessage({ type: "notification", data }));
          return undefined;
        }
        return self.registration.showNotification(title, options);
      }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Prefer focusing a tab that is already open over spawning another one:
      // clicking three notifications should not leave three HRMS tabs.
      for (const client of clients) {
        if ("focus" in client) {
          client.postMessage({ type: "navigate", url: target });
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
