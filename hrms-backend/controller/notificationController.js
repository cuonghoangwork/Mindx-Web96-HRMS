import NotificationModel, { broadcastAudiencesFor } from "../model/Notification.js";
import EmployeeModel from "../model/Employee.js";
import { notificationToClient, notificationFromClient } from "../utils/mappers.js";
import { AppError } from "../utils/appError.js";

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
        const created = await Promise.all(
          userIds.map((uid) => NotificationModel.create({ ...data, user: uid })),
        );
        return res.status(201).json({
          success: true,
          data: notificationToClient(created[0]),
          count: created.length,
        });
      }

      // Broadcast
      data.user = null;
      data.audience = data.audience || "all";
      const notification = await NotificationModel.create(data);
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

/**
 * notifyHR — fire-and-forget helper other controllers call to alert all HR/Admin
 * users of a system event (e.g. employee or account created/deleted).
 * Never throws — failures are logged only, matching utils/auditLog.js's contract.
 */
export async function notifyHR({
  title,
  message,
  category = "employee",
  link,
  linkLabel,
  titleKey,
  messageKey,
  params,
}) {
  try {
    await NotificationModel.create({
      user: null,
      audience: "hr",
      category,
      title,
      message,
      link: link ?? null,
      linkLabel: linkLabel ?? null,
      isCustom: false,
      titleKey: titleKey ?? null,
      messageKey: messageKey ?? null,
      params: params ?? null,
    });
  } catch (err) {
    console.error("[notifyHR] Failed to create notification:", err.message);
  }
}

export default notificationController;
