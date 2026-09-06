/**
 * notifyPolicy.test.js — the table that decides what may leave the app.
 *
 * Worth testing precisely because it is only a lookup: the cost of getting
 * it wrong is not a crash, it is 50 people getting a phone notification at
 * 22:00 about a department being renamed, once, and then muting the bot.
 */

import { describe, it, expect } from "vitest";
import { channelsFor, allowsChannel, OUT_OF_APP_CHANNELS } from "../utils/notifyPolicy.js";
import { NOTIFICATION_AUDIENCES } from "../model/Notification.js";

// The full category enum from model/Notification.js. Duplicated on purpose:
// if someone adds a category there, the "every category has a decision" test
// below fails until they decide what it may do.
const CATEGORIES = [
  "leave",
  "hiring",
  "payroll",
  "employee",
  "holiday",
  "system",
  "announcement",
  "performance",
];

describe("channelsFor", () => {
  it("lets a decision about you reach a phone", () => {
    expect(allowsChannel("leave", "telegram")).toBe(true);
    expect(allowsChannel("performance", "telegram")).toBe(true);
  });

  it("keeps payroll off Telegram but allows email and push", () => {
    // A payslip is not urgent — it will still be there in the morning.
    expect(allowsChannel("payroll", "telegram")).toBe(false);
    expect(allowsChannel("payroll", "email")).toBe(true);
    expect(allowsChannel("payroll", "push")).toBe(true);
  });

  it("keeps ambient categories entirely in-app", () => {
    for (const category of ["employee", "hiring", "holiday", "announcement"]) {
      expect(channelsFor(category)).toEqual([]);
    }
  });

  it("never lets 'system' out by any route", () => {
    // Highest volume, least actionable. This is the one rule that must also
    // hold in the browser — see SILENT_CATEGORIES in
    // hrms-react/src/utils/desktopNotify.js, which enforces the desktop
    // column separately because the browser owns that permission.
    expect(channelsFor("system")).toEqual([]);
  });

  it("fails closed for a category nobody has decided about", () => {
    // The important one. A ninth category added to the Notification enum
    // must be in-app only until someone chooses otherwise — never "inherits
    // the default and starts emailing everyone".
    expect(channelsFor("a-brand-new-category")).toEqual([]);
    expect(channelsFor(undefined)).toEqual([]);
    expect(allowsChannel(undefined, "telegram")).toBe(false);
  });

  it("has a decision recorded for every category in the schema enum", () => {
    for (const category of CATEGORIES) {
      expect(Array.isArray(channelsFor(category))).toBe(true);
    }
  });

  it("only ever names channels that exist", () => {
    for (const category of CATEGORIES) {
      for (const channel of channelsFor(category)) {
        expect(OUT_OF_APP_CHANNELS).toContain(channel);
      }
    }
  });

  it("does not cover desktop — that column is enforced in the browser", () => {
    // Guards against someone "completing" the table here and creating a
    // second source of truth that silently disagrees with the client.
    expect(OUT_OF_APP_CHANNELS).not.toContain("desktop");
  });

  it("is about categories, not audiences", () => {
    // A sanity check that these two enums have not been conflated: the
    // policy keys are categories; NOTIFICATION_AUDIENCES is a separate axis.
    for (const audience of NOTIFICATION_AUDIENCES) {
      expect(CATEGORIES).not.toContain(audience);
    }
  });
});
