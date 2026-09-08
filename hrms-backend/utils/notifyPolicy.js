/**
 * notifyPolicy.js — what is allowed to leave the app.
 *
 * HRMS_REALTIME_NOTIFICATIONS_PLAN.md §0.4 calls this "the single table that
 * separates a notification system from a spam machine", and that is the whole
 * job: an in-app notice costs the reader nothing, a phone buzz at 22:00 costs
 * them something, and the difference has to be a decision someone made once
 * rather than whatever each call site happened to pass.
 *
 * Scope note: only channels the SERVER sends are listed. Desktop toasts are
 * enforced in the browser, because permission and visibility both live there
 * — see SILENT_CATEGORIES in hrms-react/src/utils/desktopNotify.js. The two
 * lists are not shared code and cannot be; the rule that must agree between
 * them is that "system" never leaves the app by any route.
 *
 * Keys are DATABASE category values (model/Notification.js). The client sees
 * "interview" where the database says "hiring" — mapping happens in
 * utils/mappers.js, after this decision has been made.
 */

export const OUT_OF_APP_CHANNELS = ["push", "email", "telegram"];

const CATEGORY_CHANNELS = {
  // Someone is waiting on a decision, or has just received one. The clearest
  // case for reaching a phone.
  leave: ["push", "email", "telegram"],
  performance: ["push", "email", "telegram"],

  // Same three channels as leave, and for a stronger reason: overtime has a
  // 13:00 application cutoff (utils/overtimeCutoff.js), so a reviewer who does
  // not look at the bell before lunch cannot act at all. This was
  // category "employee" — in-app only — until 2026-09-07, which made the most
  // deadline-bound notice in the system the quietest one.
  overtime: ["push", "email", "telegram"],

  // Money is worth an email and a push, but a payslip is not urgent enough to
  // buzz a private messenger — it will still be there in the morning.
  payroll: ["push", "email"],

  // Everything below is ambient: useful in the bell, not worth an interruption.
  employee: [],
  hiring: [],
  holiday: [],
  announcement: [],

  // Housekeeping ("attendance closed for Sep 12"). Highest volume, least
  // actionable — the category most likely to make someone mute the system.
  system: [],
};

/**
 * The categories this table has actually decided about.
 *
 * Exported for tests/notifyPolicy.test.js, which compares it against
 * NOTIFICATION_CATEGORIES in model/Notification.js. That comparison is the
 * only thing that can catch a category added to the schema enum without a
 * delivery decision: channelsFor() cannot detect it, because falling through
 * to [] is exactly what it is supposed to do for unknown input.
 */
export const DECIDED_CATEGORIES = Object.keys(CATEGORY_CHANNELS);

/**
 * Channels a category may use. Unknown categories get nothing.
 *
 * Fail-closed on purpose: adding a tenth category to the Notification enum
 * without deciding its policy should make it in-app only, never "inherits
 * whatever the default was and starts emailing 50 people".
 */
export function channelsFor(category) {
  return CATEGORY_CHANNELS[category] ?? [];
}

export function allowsChannel(category, channel) {
  return channelsFor(category).includes(channel);
}

export default channelsFor;
