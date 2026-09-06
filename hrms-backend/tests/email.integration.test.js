/**
 * email.integration.test.js — who gets an email, and who does not.
 *
 * nodemailer is mocked, so nothing leaves the machine. What is proven is the
 * decision layer: the policy table, the opt-in, and — the part unique to
 * email — turning a BROADCAST into an actual list of people. Telegram dodges
 * that by only serving addressed notifications; email cannot, because
 * "payroll has been paid" to the whole roster is the best case it has.
 */

process.env.MAIL_HOST = "smtp.test";
process.env.MAIL_USER = "hrms@test";
process.env.MAIL_PASS = "test-pass";
process.env.MAIL_FROM = "HRMS <no-reply@test>";
process.env.APP_BASE_URL = "https://hrms.example.com";

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { startDb, stopDb, clearDb, createApp } from "./testHelpers.js";
import { seedPerformanceOrg } from "./performanceFixtures.js";

const sendMailMock = vi.fn(async () => ({ accepted: ["ok"] }));
vi.mock("nodemailer", () => ({
  default: { createTransport: () => ({ sendMail: sendMailMock }) },
}));

let dbAvailable = false;
let app;
let org;

beforeAll(async () => {
  try {
    await startDb();
    dbAvailable = true;
  } catch (err) {
    console.warn(`[email.integration] MongoDB unavailable — skipping.\n${err.message}`);
    return;
  }
  app = await createApp();
});

afterAll(async () => {
  await stopDb();
});

beforeEach(async () => {
  if (!dbAvailable) return;
  await clearDb();
  sendMailMock.mockClear();
  sendMailMock.mockImplementation(async () => ({ accepted: ["ok"] }));
  const { resetMailer } = await import("../utils/mailer.js");
  resetMailer();
  org = await seedPerformanceOrg(app);
});

/** Turn email on for the named org users. */
async function optIn(names, language = "en") {
  const { default: UserModel } = await import("../model/User.js");
  await UserModel.updateMany(
    { _id: { $in: names.map((n) => org.users[n].userId) } },
    { $set: { "notify.email": true, language } },
  );
}

const recipients = () => sendMailMock.mock.calls.map(([msg]) => msg.to).sort();

const leaveApproved = (overrides = {}) => ({
  user: org.users.dev.userId,
  category: "leave",
  title: "Leave request approved",
  message: "Your annual leave has been approved.",
  titleKey: "leaveApproved",
  messageKey: "leaveApproved",
  params: { leaveType: "annual", startDate: "2027-03-01", endDate: "2027-03-02" },
  link: "/dashboard",
  ...overrides,
});

describe("addressed notifications", () => {
  it("emails an opted-in recipient, with both message parts", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { emitNotification } = await import("../utils/notify.js");
    await optIn(["dev"]);

    await emitNotification(leaveApproved());

    await vi.waitFor(() => expect(sendMailMock).toHaveBeenCalledTimes(1));
    const [msg] = sendMailMock.mock.calls[0];
    expect(msg.to).toBe("dev@t.test");
    expect(msg.subject).toBe("Leave request approved");
    expect(msg.html).toContain("Annual/PTO");
    expect(msg.text).toBeTruthy();
    // In-app paths are meaningless in an inbox.
    expect(msg.html).toContain("https://hrms.example.com/dashboard");
  });

  it("renders in the recipient's stored language", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { emitNotification } = await import("../utils/notify.js");
    await optIn(["dev"], "vi");

    await emitNotification(leaveApproved());

    await vi.waitFor(() => expect(sendMailMock).toHaveBeenCalledTimes(1));
    const [msg] = sendMailMock.mock.calls[0];
    expect(msg.subject).toBe("Yêu cầu nghỉ phép đã được duyệt");
    expect(msg.html).toContain("Phép năm");
  });

  it("stays silent for someone who has not opted in", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { emitNotification } = await import("../utils/notify.js");

    await emitNotification(leaveApproved());

    await new Promise((r) => setTimeout(r, 150));
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("stays silent for a category the policy keeps in-app", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { emitNotification } = await import("../utils/notify.js");
    await optIn(["dev"]);

    // `employee` is ambient — "a department was created" is not inbox-worthy.
    await emitNotification(leaveApproved({ category: "employee" }));

    await new Promise((r) => setTimeout(r, 150));
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("emails payroll, which Telegram deliberately does not carry", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { emitNotification } = await import("../utils/notify.js");
    await optIn(["dev"]);

    // The two channels differ here on purpose: a payslip belongs in an inbox,
    // not in a private messenger at 22:00.
    await emitNotification({
      user: org.users.dev.userId,
      category: "payroll",
      title: "Payroll paid",
      titleKey: "payrollPaid",
      messageKey: "payrollPaid",
      params: { periodLabel: "March 2027" },
    });

    await vi.waitFor(() => expect(sendMailMock).toHaveBeenCalledTimes(1));
  });
});

describe("broadcasts", () => {
  const payrollBroadcast = (audience) => ({
    audience,
    category: "payroll",
    title: "Payroll paid",
    titleKey: "payrollPaid",
    messageKey: "payrollPaid",
    params: { periodLabel: "March 2027" },
  });

  it("resolves an 'employees' broadcast to MANAGER and EMPLOYEE only", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { emitNotification } = await import("../utils/notify.js");
    await optIn(["admin", "hr", "manager", "dev", "designer"]);

    await emitNotification(payrollBroadcast("employees"));

    await vi.waitFor(() => expect(sendMailMock).toHaveBeenCalledTimes(3));
    // Derived from the same map the in-app read path uses, so the inbox and
    // the bell can never disagree about who a broadcast was for.
    expect(recipients()).toEqual(["designer@t.test", "dev@t.test", "mgr@t.test"]);
  });

  it("resolves an 'hr' broadcast to ADMIN and HR only", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { emitNotification } = await import("../utils/notify.js");
    await optIn(["admin", "hr", "manager", "dev", "designer"]);

    await emitNotification(payrollBroadcast("hr"));

    await vi.waitFor(() => expect(sendMailMock).toHaveBeenCalledTimes(2));
    expect(recipients()).toEqual(["admin@hrms.com", "hr@t.test"]);
  });

  it("reaches only people who opted in", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { emitNotification } = await import("../utils/notify.js");
    await optIn(["dev"]);

    await emitNotification(payrollBroadcast("all"));

    // The whole reason notify.email defaults to false: a company-wide notice
    // must not mail the roster before anyone asked for it.
    await vi.waitFor(() => expect(sendMailMock).toHaveBeenCalledTimes(1));
    expect(recipients()).toEqual(["dev@t.test"]);
  });

  it("drains the whole queue despite the concurrency limit", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { emitNotification } = await import("../utils/notify.js");
    await optIn(["admin", "hr", "manager", "dev", "designer"]);

    await emitNotification(payrollBroadcast("all"));

    // Five recipients through three workers — the limiter must not drop the
    // two that do not fit the first pass.
    await vi.waitFor(() => expect(sendMailMock).toHaveBeenCalledTimes(5));
  });

  it("does not let one bad address strand the rest of the queue", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { emitNotification } = await import("../utils/notify.js");
    await optIn(["admin", "hr", "manager", "dev", "designer"]);
    sendMailMock.mockImplementationOnce(async () => {
      throw new Error("550 mailbox unavailable");
    });

    await emitNotification(payrollBroadcast("all"));

    // A bounce is normal. Every other recipient must still be attempted.
    await vi.waitFor(() => expect(sendMailMock).toHaveBeenCalledTimes(5));
  });
});

describe("failure isolation", () => {
  it("still writes the notification when SMTP is refusing connections", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { emitNotification } = await import("../utils/notify.js");
    const { default: NotificationModel } = await import("../model/Notification.js");
    await optIn(["dev"]);
    sendMailMock.mockImplementation(async () => {
      throw new Error("ECONNREFUSED");
    });

    await expect(emitNotification(leaveApproved())).resolves.toBeTruthy();
    expect(await NotificationModel.countDocuments({})).toBe(1);
  });

  it("no-ops entirely when the server has no mail configured", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { emitNotification } = await import("../utils/notify.js");
    const { resetMailer } = await import("../utils/mailer.js");
    const host = process.env.MAIL_HOST;
    delete process.env.MAIL_HOST;
    resetMailer();
    try {
      await optIn(["dev"]);
      await emitNotification(leaveApproved());
      await new Promise((r) => setTimeout(r, 150));
      expect(sendMailMock).not.toHaveBeenCalled();
    } finally {
      process.env.MAIL_HOST = host;
      resetMailer();
    }
  });
});
