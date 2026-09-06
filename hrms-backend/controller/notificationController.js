import NotificationModel, { broadcastAudiencesFor } from "../model/Notification.js";
import { emitNotification, emitNotificationEach } from "../utils/notify.js";
import EmployeeModel from "../model/Employee.js";
import { notificationToClient, notificationFromClient } from "../utils/mappers.js";
import { AppError } from "../utils/appError.js";
import {
  signStreamTicket,
  verifyStreamTicket,
  STREAM_TICKET_TTL_SECONDS,
} from "../utils/tokens.js";
import { subscribe, consumeTicketId } from "../utils/sseHub.js";

/* ── Level 1: live delivery over SSE ─────────────────────────────── */

// Render's proxy closes an idle connection at ~60s and the browser then
// reconnects, so a quiet app would otherwise produce a steady reconnect
// churn. 25s leaves room to miss one beat and still stay under that.
const HEARTBEAT_MS = Number(process.env.SSE_HEARTBEAT_MS) || 25_000;

// A connection caches the viewer's role at handshake time — sseHub matches
// broadcasts against it without a DB lookup. Capping the connection bounds
// how long someone demoted from HR keeps receiving "hr" broadcasts: the
// client reconnects straight away and re-handshakes with a fresh ticket,
// so this is invisible in the UI.
const MAX_CONNECTION_MS = Number(process.env.SSE_MAX_CONNECTION_MS) || 15 * 60_000;

const notificationController = {
  // Returns notifications addressed to the current user PLUS broadcasts that match
  // their role-based audience (user: null, audience: "all" | role-appropriate).
  getAll: async (req, res) => {
    try {
      const { category, read } = req.query;
      const userId = req.user?.id;
      const role = req.user?.role;
      const broadcastAudiences = broadcastAudiencesFor(role);
      const condition = {
        $or: [
          { user: userId },
          { user: null, audience: { $in: broadcastAudiences } },
        ],
      };
      if (category) {
        const mapped = notificationFromClient({ category });
        if (mapped.category) condition.category = mapped.category;
      }
      if (read !== undefined) condition.read = read === "true";

      const items = await NotificationModel.find(condition).sort({ createdAt: -1 });
      const unreadCount = await NotificationModel.countDocuments({ ...condition, read: false });

      res.json({ success: true, items: items.map(notificationToClient), unreadCount });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },

  // ADMIN/HR compose a custom notice. Body:
  //   { title, message, category="announcement", link?, linkLabel?, recipientId? | recipientIds?: [], audience? }
  // - recipientId / recipientIds: send to one or more specific employees (resolved to their User ids)
  // - omit recipients entirely (or pass recipientId: "all"): broadcast per `audience`
  //     ("all" default, or "employees" to exclude HR/Admin from seeing it)
  create: async (req, res) => {
    try {
      const { category = "announcement", title, recipientId, recipientIds } = req.body;
      if (!title) throw new AppError("title is required.", "TITLE_REQUIRED");

      const data = notificationFromClient({ ...req.body, category });
      data.sender = { id: req.user.id, name: req.user.name };
      data.isCustom = true;

      const targets = Array.isArray(recipientIds) && recipientIds.length
        ? recipientIds
        : (recipientId && recipientId !== "all" ? [recipientId] : null);

      if (targets) {
        // Targeted send — resolve each Employee id to its linked User id (or accept a
        // User id directly if the frontend already has one).
        const userIds = [];
        for (const target of targets) {
          let uid = target;
          const employee = await EmployeeModel.findById(target).catch(() => null);
          if (employee?.userId) uid = String(employee.userId);
          userIds.push(uid);
        }
        const created = await emitNotificationEach(userIds, data);
        return res.status(201).json({
          success: true,
          data: notificationToClient(created[0]),
          count: created.length,
        });
      }

      // Broadcast
      const notification = await emitNotification({
        ...data,
        user: null,
        audience: data.audience || "all",
      });
      res.status(201).json({ success: true, data: notificationToClient(notification) });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },

  markRead: async (req, res) => {
    try {
      const notification = await NotificationModel.findByIdAndUpdate(
        req.params.id,
        { read: true },
        { new: true },
      );
      if (!notification) throw new AppError("Notification not found.", "NOTIFICATION_NOT_FOUND");
      res.json({ success: true, data: notificationToClient(notification) });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },

  markAllRead: async (req, res) => {
    try {
      const userId = req.user?.id;
      const role = req.user?.role;
      const broadcastAudiences = broadcastAudiencesFor(role);
      await NotificationModel.updateMany(
        { $or: [{ user: userId }, { user: null, audience: { $in: broadcastAudiences } }] },
        { read: true },
      );
      res.json({ success: true, message: "All notifications marked as read." });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },

  clearRead: async (req, res) => {
    try {
      const userId = req.user?.id;
      const role = req.user?.role;
      const broadcastAudiences = broadcastAudiencesFor(role);
      await NotificationModel.deleteMany({
        $or: [{ user: userId }, { user: null, audience: { $in: broadcastAudiences } }],
        read: true,
      });
      res.json({ success: true, message: "Read notifications cleared." });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },

  remove: async (req, res) => {
    try {
      const notification = await NotificationModel.findByIdAndDelete(req.params.id);
      if (!notification) throw new AppError("Notification not found.", "NOTIFICATION_NOT_FOUND");
      res.json({ success: true, message: "Notification deleted." });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },

  /**
   * GET /notifications/stream-ticket — normal Bearer auth.
   *
   * Hands back the short-lived, single-use credential the stream endpoint
   * wants, because EventSource cannot send an Authorization header. See
   * utils/tokens.js for why this is not just the access token in a query
   * string.
   */
  streamTicket: async (req, res) => {
    try {
      const ticket = signStreamTicket({ id: req.user.id, role: req.user.role });
      res.json({ success: true, data: { ticket, expiresIn: STREAM_TICKET_TTL_SECONDS } });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message, code: error.code });
    }
  },

  /**
   * GET /notifications/stream?ticket=... — the live feed.
   *
   * Deliberately NOT behind verifyToken: the credential is the ticket in
   * the query string, and verifyToken would reject it for having
   * tokenType "SSE" rather than "AT".
   */
  stream: async (req, res) => {
    let ticket;
    try {
      ticket = verifyStreamTicket(req.query.ticket ?? "");
    } catch {
      return res.status(401).json({
        success: false,
        message: "Stream ticket is missing, expired or invalid.",
        code: "STREAM_TICKET_INVALID",
      });
    }

    if (!consumeTicketId(ticket.jti, ticket.exp)) {
      return res.status(401).json({
        success: false,
        message: "Stream ticket has already been used.",
        code: "STREAM_TICKET_ALREADY_USED",
      });
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Stops nginx-style proxies (Render included) buffering the stream
      // into oblivion — without it nothing arrives until the buffer fills.
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders?.();
    res.write(": connected\n\n");

    const unsubscribe = subscribe({ res, userId: ticket.id, role: ticket.role });

    const heartbeat = setInterval(() => {
      try {
        res.write(": ping\n\n");
      } catch {
        cleanup();
      }
    }, HEARTBEAT_MS);

    const lifetime = setTimeout(() => res.end(), MAX_CONNECTION_MS);

    // Neither timer should hold the event loop open on its own.
    heartbeat.unref?.();
    lifetime.unref?.();

    // Miss this and every dropped connection leaks a 25s interval plus a
    // reference to a dead socket that publish() keeps writing to.
    function cleanup() {
      clearInterval(heartbeat);
      clearTimeout(lifetime);
      unsubscribe();
    }
    req.on("close", cleanup);
  },

  // GET /notifications/recipients — HR/Admin only: list of employees (id + name + email)
  // for the recipient picker in the compose modal.
  listRecipients: async (req, res) => {
    try {
      const employees = await EmployeeModel.find({}, "name email employeeId userId").sort({ name: 1 });
      res.json({
        success: true,
        items: employees.map((e) => ({
          id: String(e._id),
          name: e.name,
          email: e.email,
          employeeId: e.employeeId,
          hasAccount: Boolean(e.userId),
        })),
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },
};

export default notificationController;
