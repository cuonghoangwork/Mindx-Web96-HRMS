/**
 * notifyPolicy.test.js — the table that decides what may leave the app.
 *
 * Worth testing precisely because it is only a lookup: the cost of getting
 * it wrong is not a crash, it is 50 people getting a phone notification at
 * 22:00 about a department being renamed, once, and then muting the bot.
 */

import { describe, it, expect } from "vitest";
import {
  channelsFor,
  allowsChannel,
  OUT_OF_APP_CHANNELS,
  DECIDED_CATEGORIES,
} from "../utils/notifyPolicy.js";
import { NOTIFICATION_AUDIENCES, NOTIFICATION_CATEGORIES } from "../model/Notification.js";

// The schema enum itself, not a copy of it. It used to be hand-duplicated
// here, which is how "overtime" went missing: it was added to the enum on
// 2026-09-07 and never added to the copy, so every loop below silently
// skipped the category with the WIDEST channel set in the table.
const CATEGORIES = NOTIFICATION_CATEGORIES;

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

  it("lets overtime reach a phone, like leave and performance", () => {
    // The widest channel set in the table, for a stronger reason than leave:
    // overtime has a 13:00 same-day application cutoff
    // (utils/overtimeCutoff.js), so a reviewer who does not check the bell
    // before lunch cannot act at all. Asserted by name rather than left to
    // the loops below, because this was category "employee" -- in-app only --
    // until 2026-09-07, which made the most deadline-bound notice in the
    // system the quietest one.
    expect(channelsFor("overtime")).toEqual(["push", "email", "telegram"]);
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
    // The important one. A tenth category added to the Notification enum
    // must be in-app only until someone chooses otherwise — never "inherits
    // the default and starts emailing everyone".
    expect(channelsFor("a-brand-new-category")).toEqual([]);
    expect(channelsFor(undefined)).toEqual([]);
    expect(allowsChannel(undefined, "telegram")).toBe(false);
  });

  it("has a decision recorded for every category in the schema enum", () => {
    // Set equality, both directions. The previous version of this test looped
    // the enum asserting Array.isArray(channelsFor(c)), which could never
    // fail: channelsFor falls back to [] for ANY input by design, so it
    // returned an array for "banana" just as happily. Comparing the policy
    // table's own keys against the enum is what actually catches a category
    // added to the schema with no delivery decision -- and, the other way,
    // a policy entry for a category that no longer exists.
    expect([...DECIDED_CATEGORIES].sort()).toEqual([...NOTIFICATION_CATEGORIES].sort());
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
