/**
 * notificationCategories.test.jsx — the middle link in the chain that keeps a
 * notification category from being half-wired.
 *
 * The chain: the backend's model enum -> the i18n category labels (guarded in
 * hrms-backend/tests/notifyI18n.test.js, which reads these same locale files)
 * -> CATEGORY_CONFIG here. Each hop is checked somewhere, so a category added
 * to the enum cannot reach production without a tab and a label.
 *
 * Why it needs guarding at all: a missing entry is invisible. Notifications.jsx
 * falls back to `CATEGORY_CONFIG.system`, so the rows render — as grey "System"
 * with a gear icon — and FILTERS, being derived from this object, simply omits
 * the tab. `performance` shipped in that state and stayed there.
 */

import en from "../i18n/locales/en.json";
import vi from "../i18n/locales/vi.json";
import { describe, it, expect } from "vitest";
import { CATEGORY_CONFIG, FILTERS } from "./notificationCategories";

const configKeys = Object.keys(CATEGORY_CONFIG).sort();

describe("CATEGORY_CONFIG", () => {
  it.each([["en", en], ["vi", vi]])(
    "%s: has a label for every category, and a category for every label",
    (_lang, bundle) => {
      // Equality both ways on purpose. A label with no config is a category
      // that renders as "System"; a config with no label renders the raw
      // i18n key as the tab text, e.g. "notifications.categories.overtime".
      expect(Object.keys(bundle.notifications.categories).sort()).toEqual(configKeys);
    },
  );

  it("gives every category a label key, colour, background and icon", () => {
    for (const [key, cfg] of Object.entries(CATEGORY_CONFIG)) {
      expect(cfg.labelKey, `${key}.labelKey`).toBe(`notifications.categories.${key}`);
      // Tokens, never literals — the page has to work in both themes, and a
      // hardcoded hex is invisible against the dark background.
      expect(cfg.color, `${key}.color`).toMatch(/^var\(--/);
      expect(cfg.bg, `${key}.bg`).toMatch(/^var\(--/);
      expect(cfg.icon, `${key}.icon`).toBeTruthy();
    }
  });

  it("includes the two categories that were missing a tab", () => {
    // Regression pins, both fixed 2026-09-07. overtime was folded into
    // "employee"; performance was in the model enum and in notifyPolicy with
    // all three out-of-app channels but was never given a tab.
    expect(configKeys).toContain("overtime");
    expect(configKeys).toContain("performance");
  });
});

describe("FILTERS", () => {
  it("is All + Unread followed by one tab per category, in config order", () => {
    expect(FILTERS.slice(0, 2).map((f) => f.key)).toEqual(["all", "unread"]);
    expect(FILTERS.slice(2).map((f) => f.key)).toEqual(Object.keys(CATEGORY_CONFIG));
  });

  it("points every tab at a real translation key", () => {
    for (const f of FILTERS) {
      const path = f.labelKey.split(".");
      const resolved = path.reduce((node, part) => node?.[part], en);
      expect(typeof resolved, `${f.labelKey} unresolved in en`).toBe("string");
    }
  });
});
