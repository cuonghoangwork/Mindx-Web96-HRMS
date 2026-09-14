/**
 * Server-side demo clock. In DEMO_MODE an X-App-Now header overrides the
 * time, so a server-side rule like the 13:00 overtime cutoff can be shown
 * without waiting for 13:00. A time-travel header bypasses every date rule
 * in the system, so DEMO_MODE must be unset or "false" in production —
 * warnIfDemoMode() runs at startup to make a misconfiguration loud.
 *
 * Reads process.env at call time so tests need no module reset. Anything
 * unusable falls through to real time rather than erroring.
 */
export function serverNow(req) {
  if (process.env.DEMO_MODE === "true" && typeof req?.get === "function") {
    const raw = req.get("X-App-Now");
    if (raw) {
      const d = new Date(raw);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  return new Date();
}

export function warnIfDemoMode() {
  if (process.env.DEMO_MODE === "true") {
    console.warn("[startup] ⚠  DEMO_MODE is ON — X-App-Now header can override server time");
    return true;
  }
  return false;
}

export default serverNow;
