import NotificationModel from "../model/Notification.js";
import { notificationToClient, notificationFromClient } from "../utils/mappers.js";

const notificationController = {
  // Returns notifications addressed to the current user PLUS broadcasts (user: null),
  // matching the frontend's single shared notifications feed.
  getAll: async (req, res) => {
    try {
      const { category, read } = req.query;
      const userId = req.user?.id;

      const condition = { $or: [{ user: userId }, { user: null }] };
      if (category) {
        const mapped = notificationFromClient({ category });
        if (mapped.category) condition.category = mapped.category;
      }
      if (read !== undefined) condition.read = read === "true";

      const items = await NotificationModel.find(condition).sort({ createdAt: -1 });
      const unreadCount = await NotificationModel.countDocuments({ ...condition, read: false });

      res.json({ success: true, items: items.map(notificationToClient), unreadCount });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  create: async (req, res) => {
    try {
      const { category, title } = req.body;
      if (!category) throw new Error("category is required.");
      if (!title) throw new Error("title is required.");

      const data = notificationFromClient(req.body);
      const notification = await NotificationModel.create(data);
      res.status(201).json({ success: true, data: notificationToClient(notification) });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  },

  markRead: async (req, res) => {
    try {
      const notification = await NotificationModel.findByIdAndUpdate(
        req.params.id,
        { read: true },
        { new: true },
      );
      if (!notification) throw new Error("Notification not found.");
      res.json({ success: true, data: notificationToClient(notification) });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  },

  markAllRead: async (req, res) => {
    try {
      const userId = req.user?.id;
      await NotificationModel.updateMany({ $or: [{ user: userId }, { user: null }] }, { read: true });
      res.json({ success: true, message: "All notifications marked as read." });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  clearRead: async (req, res) => {
    try {
      const userId = req.user?.id;
      await NotificationModel.deleteMany({
        $or: [{ user: userId }, { user: null }],
        read: true,
      });
      res.json({ success: true, message: "Read notifications cleared." });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  remove: async (req, res) => {
    try {
      const notification = await NotificationModel.findByIdAndDelete(req.params.id);
      if (!notification) throw new Error("Notification not found.");
      res.json({ success: true, message: "Notification deleted." });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  },
};

export default notificationController;
