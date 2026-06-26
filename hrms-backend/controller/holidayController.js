import HolidayModel from "../model/Holiday.js";
import { holidayToClient, holidayFromClient } from "../utils/mappers.js";
import { logAction } from "../utils/auditLog.js";

const holidayController = {
  getAll: async (req, res) => {
    try {
      const { year } = req.query;
      const condition = {};
      if (year) {
        condition.date = { $gte: new Date(`${year}-01-01`), $lte: new Date(`${year}-12-31`) };
      }
      const items = await HolidayModel.find(condition).sort({ date: 1 });
      res.json({ success: true, items: items.map(holidayToClient) });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  create: async (req, res) => {
    try {
      const { name, date } = req.body;
      if (!name) throw new Error("Holiday name is required.");
      if (!date) throw new Error("Date is required.");
      const duplicate = await HolidayModel.findOne({ name, date: new Date(date) });
      if (duplicate) throw new Error("A holiday with this name and date already exists.");
      const data = holidayFromClient(req.body);
      const holiday = await HolidayModel.create(data);

      await logAction(req, {
        action:     "created",
        resource:   "holiday",
        resourceId: holiday._id,
        label:      `${holiday.name} (${holidayToClient(holiday).date})`,
      });

      res.status(201).json({ success: true, data: holidayToClient(holiday) });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  },

  update: async (req, res) => {
    try {
      const data = holidayFromClient(req.body);
      const holiday = await HolidayModel.findByIdAndUpdate(req.params.id, data, {
        new: true, runValidators: true,
      });
      if (!holiday) throw new Error("Holiday not found.");

      await logAction(req, {
        action:     "updated",
        resource:   "holiday",
        resourceId: holiday._id,
        label:      holiday.name,
      });

      res.json({ success: true, data: holidayToClient(holiday) });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  },

  remove: async (req, res) => {
    try {
      const holiday = await HolidayModel.findByIdAndDelete(req.params.id);
      if (!holiday) throw new Error("Holiday not found.");

      await logAction(req, {
        action:     "deleted",
        resource:   "holiday",
        resourceId: req.params.id,
        label:      holiday.name,
      });

      res.json({ success: true, message: "Holiday deleted." });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  },
};

export default holidayController;
