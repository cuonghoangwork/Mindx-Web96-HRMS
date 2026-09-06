/**
 * emailTemplate.test.js — the HTML shell every notification email uses.
 *
 * Email is the one channel where a rendering mistake is unrecoverable: the
 * message is already in someone's inbox. These pin the parts that would
 * either break the layout in Outlook or leak markup from a database field.
 */

import { describe, it, expect } from "vitest";
import { renderEmail, escapeHtml } from "../utils/emailTemplate.js";

describe("escapeHtml", () => {
  it("escapes everything that can break an HTML attribute or tag", () => {
    expect(escapeHtml('<script>"x" & y</script>')).toBe(
      "&lt;script&gt;&quot;x&quot; &amp; y&lt;/script&gt;",
    );
  });

  it("renders null and undefined as empty, not as the words", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });
});

describe("renderEmail", () => {
  const base = { title: "Leave request approved", message: "Two days in March." };

  it("returns both an HTML and a plain-text part", () => {
    const { html, text } = renderEmail(base);
    // Some corporate clients strip HTML entirely, and an HTML-only message
    // also scores worse for spam.
    expect(html).toContain("Leave request approved");
    expect(text).toContain("Leave request approved");
    expect(text).toContain("Two days in March.");
    expect(text).not.toContain("<");
  });

  it("escapes interpolated content in the HTML part", () => {
    const { html } = renderEmail({
      title: 'Approved by "A & B" <Ltd>',
      message: "Fine",
    });
    // Employee and department names come straight from the database.
    expect(html).toContain("&amp;");
    expect(html).toContain("&lt;Ltd&gt;");
    expect(html).not.toContain("<Ltd>");
  });

  it("renders a link button only when given an absolute url", () => {
    const withUrl = renderEmail({ ...base, url: "https://hrms.example.com/dashboard", urlLabel: "Open in HRMS" });
    expect(withUrl.html).toContain('href="https://hrms.example.com/dashboard"');
    expect(withUrl.text).toContain("https://hrms.example.com/dashboard");

    // A relative path is useless in an inbox — better no button than a dead one.
    const withoutUrl = renderEmail(base);
    expect(withoutUrl.html).not.toContain("<a href");
  });

  it("includes the why-am-I-getting-this footer when supplied", () => {
    const { html, text } = renderEmail({ ...base, footer: "Turn these off in Settings." });
    expect(html).toContain("Turn these off in Settings.");
    expect(text).toContain("Turn these off in Settings.");
  });

  it("uses table layout and inline styles, not modern CSS", () => {
    const { html } = renderEmail(base);
    // Outlook renders with Word's engine: no flexbox, no grid, and <style>
    // blocks are unreliable in Gmail.
    expect(html).toContain("<table");
    expect(html).toContain("style=");
    expect(html).not.toContain("display:flex");
    expect(html).not.toContain("<style");
  });

  it("brands with the app's real colour and font, not the plan's stale ones", () => {
    const { html } = renderEmail({ ...base, url: "https://x.test/y" });
    // #1359e1 is --clr-primary-400 ("signal blue"); Archivo replaced Lexend
    // in hrms-react/index.html. The plan document still names both old values.
    expect(html).toContain("#1359e1");
    expect(html).toContain("Archivo");
    expect(html).not.toContain("7152F3");
    expect(html).not.toContain("Lexend");
  });

  it("names a real fallback stack after the webfont", () => {
    // No @import: webfonts are unreliable-to-blocked in mail clients, so the
    // fallback is what most readers actually see.
    const { html } = renderEmail(base);
    expect(html).toMatch(/Archivo,[^"]*sans-serif/);
  });
});
