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
 * Channels a category may use. Unknown categories get nothing.
 *
 * Fail-closed on purpose: adding a ninth category to the Notification enum
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
