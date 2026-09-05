/**
 * appNow.js — Attendance Overtime, milestone M1.
 *
 * The frontend already has a demo clock: StoreContext's clockOffset, with a
 * picker in HeaderDateTime. It is browser-only — the server has never known
 * the clock was moved, which is fine for rendering but useless for
 * demonstrating a server-side rule like the 13:00 overtime cutoff.
 *
 * serverNow() is the server-side half. It is gated behind DEMO_MODE so the
 * ability to override server time is not something that ships to production:
 * a time-travel header is a bypass for every date rule in the system, not
 * just the one it was added for.
 *
 * DEMO_MODE must be unset or "false" in the Render production environment.
 * See warnIfDemoMode() below — call it at startup so a misconfiguration is
 * loud rather than silent.
 */

/**
 * Real server time, except in DEMO_MODE where an X-App-Now header may
 * override it — so the demo can show both the accepted and the rejected
 * cutoff path without waiting for 13:00 to actually arrive.
 *
 * Reads process.env at call time, not module load, so a test (or a deploy
 * that toggles the flag) does not need a module reset to take effect.
 * Anything unusable — flag off, header absent, unparseable value — falls
 * through to real time rather than erroring: a bad demo header should
 * degrade to normal behavior, never break the request.
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

/** Startup warning so DEMO_MODE reaching production is impossible to miss. */
export function warnIfDemoMode() {
  if (process.env.DEMO_MODE === "true") {
    console.warn("[startup] ⚠  DEMO_MODE is ON — X-App-Now header can override server time");
    return true;
  }
  return false;
}

export default serverNow;
