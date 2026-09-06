/**
 * telegram.integration.test.js — account linking and out-of-app delivery.
 *
 * The Bot API is mocked at `fetch`. There is no bot token in this
 * environment and creating one requires a human talking to @BotFather, so
 * what is proven here is everything up to the wire: which requests we make,
 * with what body, and — mostly — when we correctly make none at all.
 */

process.env.TELEGRAM_BOT_TOKEN = "test-token";
process.env.TELEGRAM_BOT_USERNAME = "hrms_test_bot";
process.env.TELEGRAM_WEBHOOK_SECRET = "s3cret-webhook-path";
process.env.APP_BASE_URL = "https://hrms.example.com";

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import supertest from "supertest";
import { startDb, stopDb, clearDb, createApp } from "./testHelpers.js";
import { auth, seedPerformanceOrg } from "./performanceFixtures.js";

let dbAvailable = false;
let app;
let request;
let org;
let fetchMock;

/** Telegram replies 200 {ok:true} unless a test says otherwise. */
function okResponse() {
  return { ok: true, status: 200, json: async () => ({ ok: true, result: {} }) };
}

function telegramCalls(method) {
  return fetchMock.mock.calls
    .filter(([url]) => String(url).endsWith(`/${method}`))
    .map(([, init]) => JSON.parse(init.body));
}

beforeAll(async () => {
  try {
    await startDb();
    dbAvailable = true;
  } catch (err) {
    console.warn(`[telegram.integration] MongoDB unavailable — skipping.\n${err.message}`);
    return;
  }
  app = await createApp();
  request = supertest(app);
});

afterAll(async () => {
  await stopDb();
});

beforeEach(async () => {
  if (!dbAvailable) return;
  await clearDb();
  fetchMock = vi.fn(async () => okResponse());
  vi.stubGlobal("fetch", fetchMock);
  org = await seedPerformanceOrg(app);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/* ══════════════════════════════════════════════════════════════════
   Linking
   ══════════════════════════════════════════════════════════════════ */
describe("POST /notifications/telegram/link-code", () => {
  it("requires authentication", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    expect((await request.post("/api/v1/notifications/telegram/link-code")).status).toBe(401);
  });

  it("mints a code and the deep link that carries it", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const res = await request
      .post("/api/v1/notifications/telegram/link-code")
      .set(auth(org.tokens.dev));

    expect(res.status).toBe(201);
    expect(res.body.data.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(res.body.data.deepLink).toBe(
      `https://t.me/hrms_test_bot?start=${res.body.data.code}`,
    );
    expect(res.body.data.expiresInMinutes).toBe(10);
  });

  it("uses an alphabet without the characters people misread", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    // The code gets read off a screen and retyped on a phone. O/0, I/1 and
    // S/5 confusions would look like "the bot is broken".
    for (let i = 0; i < 12; i += 1) {
      const res = await request
        .post("/api/v1/notifications/telegram/link-code")
        .set(auth(org.tokens.dev));
      expect(res.body.data.code).not.toMatch(/[O0I1S5]/);
    }
  });

  it("invalidates the previous code when a new one is minted", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { default: LinkCode } = await import("../model/TelegramLinkCode.js");

    const first = (await request.post("/api/v1/notifications/telegram/link-code").set(auth(org.tokens.dev))).body.data.code;
    await request.post("/api/v1/notifications/telegram/link-code").set(auth(org.tokens.dev));

    // A code left live on a stale Settings tab would otherwise still link.
    expect(await LinkCode.findOne({ code: first })).toBeNull();
    expect(await LinkCode.countDocuments({})).toBe(1);
  });

  it("reports 503 when the server has no bot configured", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const token = process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_BOT_TOKEN;
    try {
      const res = await request.post("/api/v1/notifications/telegram/link-code").set(auth(org.tokens.dev));
      expect(res.status).toBe(503);
      expect(res.body.code).toBe("TELEGRAM_NOT_CONFIGURED");
    } finally {
      process.env.TELEGRAM_BOT_TOKEN = token;
    }
  });
});

describe("POST /notifications/telegram/webhook/:secret", () => {
  const hook = (secret) => `/api/v1/notifications/telegram/webhook/${secret}`;
  const startUpdate = (code, chatId = 55501) => ({
    update_id: 1,
    message: { chat: { id: chatId }, text: `/start ${code}` },
  });

  async function mintCode(token = org.tokens.dev) {
    const res = await request.post("/api/v1/notifications/telegram/link-code").set(auth(token));
    return res.body.data.code;
  }

  it("answers 404 to a wrong secret, leaking nothing", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const res = await request.post(hook("not-the-secret")).send(startUpdate("ABC234"));
    expect(res.status).toBe(404);
  });

  it("answers 404 when no secret is configured at all", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    try {
      // Must not degrade into "any secret works" when unset.
      expect((await request.post(hook("anything")).send(startUpdate("ABC234"))).status).toBe(404);
      expect((await request.post(hook("undefined")).send(startUpdate("ABC234"))).status).toBe(404);
    } finally {
      process.env.TELEGRAM_WEBHOOK_SECRET = secret;
    }
  });

  it("links the account and burns the code", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { default: UserModel } = await import("../model/User.js");
    const { default: LinkCode } = await import("../model/TelegramLinkCode.js");
    const code = await mintCode();

    const res = await request.post(hook(process.env.TELEGRAM_WEBHOOK_SECRET)).send(startUpdate(code));

    expect(res.status).toBe(200);
    const user = await UserModel.findById(org.users.dev.userId);
    expect(user.notify.telegramChatId).toBe("55501");
    expect(user.notify.telegram).toBe(true);
    // Single-use: a code posted twice must not re-link a different chat.
    expect(await LinkCode.findOne({ code })).toBeNull();
    expect(telegramCalls("sendMessage")[0].text).toContain("Dev One");
  });

  it("accepts the code case-insensitively", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { default: UserModel } = await import("../model/User.js");
    const code = await mintCode();

    await request.post(hook(process.env.TELEGRAM_WEBHOOK_SECRET)).send(startUpdate(code.toLowerCase()));

    expect((await UserModel.findById(org.users.dev.userId)).notify.telegramChatId).toBe("55501");
  });

  it("refuses an expired code even before Mongo has swept it", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { default: UserModel } = await import("../model/User.js");
    const { default: LinkCode } = await import("../model/TelegramLinkCode.js");
    const code = await mintCode();
    // The TTL index sweeps about once a minute, so an expired document is
    // routinely still readable. The explicit check is the real rule.
    await LinkCode.updateOne({ code }, { $set: { expiresAt: new Date(Date.now() - 1000) } });

    await request.post(hook(process.env.TELEGRAM_WEBHOOK_SECRET)).send(startUpdate(code));

    expect((await UserModel.findById(org.users.dev.userId)).notify.telegramChatId).toBeNull();
  });

  it("ignores an unknown code", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { default: UserModel } = await import("../model/User.js");
    await request.post(hook(process.env.TELEGRAM_WEBHOOK_SECRET)).send(startUpdate("ZZZZZZ"));
    expect((await UserModel.findById(org.users.dev.userId)).notify.telegramChatId).toBeNull();
  });

  it("always answers 200 so Telegram does not retry forever", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    for (const body of [{}, { message: {} }, { message: { chat: { id: 1 }, text: "hello" } }, startUpdate("NOPE12")]) {
      expect((await request.post(hook(secret)).send(body)).status).toBe(200);
    }
  });
});

describe("DELETE /notifications/telegram", () => {
  it("unlinks the account", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { default: UserModel } = await import("../model/User.js");
    await UserModel.updateOne(
      { _id: org.users.dev.userId },
      { $set: { "notify.telegram": true, "notify.telegramChatId": "999" } },
    );

    const res = await request.delete("/api/v1/notifications/telegram").set(auth(org.tokens.dev));

    expect(res.status).toBe(200);
    const user = await UserModel.findById(org.users.dev.userId);
    expect(user.notify.telegramChatId).toBeNull();
    expect(user.notify.telegram).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════════
   Delivery
   ══════════════════════════════════════════════════════════════════ */
describe("out-of-app delivery", () => {
  async function link({ language = "vi", enabled = true } = {}) {
    const { default: UserModel } = await import("../model/User.js");
    await UserModel.updateOne(
      { _id: org.users.dev.userId },
      { $set: { language, "notify.telegram": enabled, "notify.telegramChatId": "42042" } },
    );
  }

  const leaveApproved = () => ({
    user: org.users.dev.userId,
    category: "leave",
    title: "Leave request approved",
    message: "Your annual leave from 2027-03-01 to 2027-03-02 has been approved.",
    titleKey: "leaveApproved",
    messageKey: "leaveApproved",
    params: { leaveType: "annual", startDate: "2027-03-01", endDate: "2027-03-02" },
    link: "/dashboard",
  });

  it("sends a linked user their leave decision, in their language", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { emitNotification } = await import("../utils/notify.js");
    await link({ language: "vi" });

    await emitNotification(leaveApproved());

    // Fan-out is fire-and-forget by design — the request never waits on it.
    await vi.waitFor(() => expect(telegramCalls("sendMessage")).toHaveLength(1));
    const [sent] = telegramCalls("sendMessage");
    expect(sent.chat_id).toBe("42042");
    expect(sent.text).toContain("Yêu cầu nghỉ phép đã được duyệt");
    expect(sent.text).toContain("Phép năm");
    // In-app paths are useless in Telegram; the button must be absolute.
    expect(sent.reply_markup.inline_keyboard[0][0].url).toBe("https://hrms.example.com/dashboard");
    expect(sent.reply_markup.inline_keyboard[0][0].text).toBe("Mở trong HRMS");
  });

  it("respects an English preference", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { emitNotification } = await import("../utils/notify.js");
    await link({ language: "en" });

    await emitNotification(leaveApproved());

    await vi.waitFor(() => expect(telegramCalls("sendMessage")).toHaveLength(1));
    expect(telegramCalls("sendMessage")[0].text).toContain("Leave request approved");
  });

  it("stays silent for a category the policy keeps in-app", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { emitNotification } = await import("../utils/notify.js");
    await link();

    await emitNotification({
      user: org.users.dev.userId,
      category: "payroll",
      title: "Payroll paid",
      titleKey: "payrollPaid",
    });

    await new Promise((r) => setTimeout(r, 150));
    expect(telegramCalls("sendMessage")).toHaveLength(0);
  });

  it("stays silent for a broadcast, however permitted its category", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { emitNotification } = await import("../utils/notify.js");
    await link();

    // "Review cycle open" is category `performance`, which the policy allows —
    // but it is addressed to nobody. Buzzing every linked phone in the company
    // for it is how a notification system gets muted.
    await emitNotification({
      audience: "all",
      category: "performance",
      title: "Review cycle open",
      titleKey: "reviewCycleOpen",
    });

    await new Promise((r) => setTimeout(r, 150));
    expect(telegramCalls("sendMessage")).toHaveLength(0);
  });

  it("stays silent when the user has the channel switched off", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { emitNotification } = await import("../utils/notify.js");
    await link({ enabled: false });

    await emitNotification(leaveApproved());

    // A user's toggle narrows the policy; it can never be overridden by it.
    await new Promise((r) => setTimeout(r, 150));
    expect(telegramCalls("sendMessage")).toHaveLength(0);
  });

  it("stays silent for a user who never linked", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { emitNotification } = await import("../utils/notify.js");

    await emitNotification(leaveApproved());

    await new Promise((r) => setTimeout(r, 150));
    expect(telegramCalls("sendMessage")).toHaveLength(0);
  });

  it("unlinks the user when Telegram reports the bot was blocked", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { emitNotification } = await import("../utils/notify.js");
    const { default: UserModel } = await import("../model/User.js");
    await link();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ ok: false, description: "Forbidden: bot was blocked by the user" }),
    });

    await emitNotification(leaveApproved());

    // Without this the failure count climbs forever against a chat that will
    // never accept another message.
    await vi.waitFor(async () => {
      const user = await UserModel.findById(org.users.dev.userId);
      expect(user.notify.telegramChatId).toBeNull();
      expect(user.notify.telegram).toBe(false);
    });
  });

  it("still writes the notification when Telegram is unreachable", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { emitNotification } = await import("../utils/notify.js");
    const { default: NotificationModel } = await import("../model/Notification.js");
    await link();
    fetchMock.mockRejectedValue(new Error("ENOTFOUND api.telegram.org"));

    // The whole point of the fan-out contract: a broken channel must never
    // fail the notification, or the request that produced it.
    await expect(emitNotification(leaveApproved())).resolves.toBeTruthy();
    expect(await NotificationModel.countDocuments({})).toBe(1);
  });

  it("escapes HTML in interpolated content", async (ctx) => {
    if (!dbAvailable) return ctx.skip();
    const { emitNotification } = await import("../utils/notify.js");
    await link({ language: "en" });

    await emitNotification({
      user: org.users.dev.userId,
      category: "leave",
      title: "Leave request rejected",
      message: 'Rejected by <b>"Boss" & co</b>',
    });

    await vi.waitFor(() => expect(telegramCalls("sendMessage")).toHaveLength(1));
    // parse_mode is HTML, so an unescaped "<" or "&" is a 400 from Telegram —
    // a name like "A & B Ltd" is enough to do it.
    const { text } = telegramCalls("sendMessage")[0];
    expect(text).toContain("&lt;b&gt;");
    expect(text).toContain("&amp;");
  });
});
