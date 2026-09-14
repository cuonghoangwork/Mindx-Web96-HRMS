/**
 * Which categories may leave the app, per channel (DECISIONS.md D7). Server
 * channels only — desktop toasts are decided in the browser
 * (hrms-react/src/utils/desktopNotify.js); the one rule both must agree on is
 * that "system" never leaves the app. Keys are database category values.
 */

export const OUT_OF_APP_CHANNELS = ["push", "email", "telegram"];

const CATEGORY_CHANNELS = {
  // Someone is waiting on a decision, or has just received one.
  leave: ["push", "email", "telegram"],
  performance: ["push", "email", "telegram"],
  // The 13:00 cutoff makes this the most deadline-bound notice in the system.
  overtime: ["push", "email", "telegram"],
  // Worth an email, not a private-messenger buzz — it will still be there in the morning.
  payroll: ["push", "email"],
  // Ambient: useful in the bell, not worth an interruption.
  employee: [],
  hiring: [],
  holiday: [],
  announcement: [],
  system: [],
};

/** Compared against NOTIFICATION_CATEGORIES by tests/notifyPolicy.test.js — the only check that catches an undecided category. */
export const DECIDED_CATEGORIES = Object.keys(CATEGORY_CHANNELS);

/** Fail-closed: an unknown category is in-app only. */
export function channelsFor(category) {
  return CATEGORY_CHANNELS[category] ?? [];
}

export function allowsChannel(category, channel) {
  return channelsFor(category).includes(channel);
}

export default channelsFor;
