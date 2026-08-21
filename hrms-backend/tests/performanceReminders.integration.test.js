/**
 * performanceReminders.integration.test.js — task 5.
 *
 * Covers jobs/performanceReminders.js against a real database: notifications
 * fire for the employee (self pending), their manager (pending count), and
 * HR (aggregate), and — the actual point of moving off the demo's
 * localStorage hack — running the job twice for the same cycle sends zero
 * additional notifications the second time.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startDb, stopDb, clearDb, createApp } from "./testHelpers.js";
import { seedPerformanceOrg } from "./performanceFixtures.js";

let dbAvailable = false;
let app;

beforeAll(async () => {
  try {
    await startDb();
    dbAvailable = true;
  } catch (err) {
    console.warn(`[performanceReminders.integration] MongoDB unavailable — skipping.\n${err.message}`);
    return;
  }
  app = await createApp();
});

afterAll(async () => {
  await stopDb();
});

beforeEach(async () => {
  if (dbAvailable) await clearDb();
});

async function makeDueSoonCycle(daysUntilEnd = 3) {
  const { default: PerformanceCycleModel } = await import("../model/PerformanceCycle.js");
  const end = new Date(Date.now() + daysUntilEnd * 86400000);
  return PerformanceCycleModel.create({
    key: "custom-reminder-test",
    label: "Reminder Test Cycle",
    kind: "custom",
    status: "Open",
    start: new Date(Date.now() - 30 * 86400000),
    end,
  });
}

describe("sendPerformanceReminders", () => {
  it("notifies the employee, their manager, and HR for a cycle nearing its deadline", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { sendPerformanceReminders } = await import("../jobs/performanceReminders.js");
    const { default: NotificationModel } = await import("../model/Notification.js");

    const org = await seedPerformanceOrg(app);
    await makeDueSoonCycle(3);

    const result = await sendPerformanceReminders({ asOf: new Date() });
    expect(result.cyclesChecked).toBe(1);
    expect(result.remindersSent).toBeGreaterThan(0);

    const devReminder = await NotificationModel.findOne({
      user: org.users.dev.user._id,
      title: "Self review reminder — custom-reminder-test",
    });
    expect(devReminder).not.toBeNull();
    expect(devReminder.message).toMatch(/due in 3 days/);

    const managerReminder = await NotificationModel.findOne({
      user: org.users.manager.user._id,
      title: "Manager review reminder — custom-reminder-test",
    });
    expect(managerReminder).not.toBeNull();

    const hrReminder = await NotificationModel.findOne({
      user: null,
      audience: "hr",
      title: "Performance reviews due soon — custom-reminder-test",
    });
    expect(hrReminder).not.toBeNull();
  });

  it("does not re-send reminders for the same cycle on a second run", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { sendPerformanceReminders } = await import("../jobs/performanceReminders.js");
    const { default: NotificationModel } = await import("../model/Notification.js");

    await seedPerformanceOrg(app);
    await makeDueSoonCycle(3);

    await sendPerformanceReminders({ asOf: new Date() });
    const countAfterFirst = await NotificationModel.countDocuments({});

    const second = await sendPerformanceReminders({ asOf: new Date() });
    const countAfterSecond = await NotificationModel.countDocuments({});

    expect(second.remindersSent).toBe(0);
    expect(countAfterSecond).toBe(countAfterFirst);
  });

  it("ignores cycles whose deadline is further out than the reminder window", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { sendPerformanceReminders } = await import("../jobs/performanceReminders.js");

    await seedPerformanceOrg(app);
    await makeDueSoonCycle(30);

    const result = await sendPerformanceReminders({ asOf: new Date() });
    expect(result.cyclesChecked).toBe(0);
    expect(result.remindersSent).toBe(0);
  });
});
