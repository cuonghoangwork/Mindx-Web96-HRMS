import HolidayModel from "../model/Holiday.js";
import { holidayToClient, holidayFromClient } from "../utils/mappers.js";
import { logAction } from "../utils/auditLog.js";
import { AppError } from "../utils/appError.js";

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
      res.status(500).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },

  create: async (req, res) => {
    try {
      const { name, date } = req.body;
      if (!name) throw new AppError("Holiday name is required.", "HOLIDAY_NAME_REQUIRED");
      if (!date) throw new AppError("Date is required.", "DATE_REQUIRED");
      const duplicate = await HolidayModel.findOne({ name, date: new Date(date) });
      if (duplicate) throw new AppError("A holiday with this name and date already exists.", "HOLIDAY_ALREADY_EXISTS");
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
      res.status(400).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },

  update: async (req, res) => {
    try {
      const data = holidayFromClient(req.body);
      const holiday = await HolidayModel.findByIdAndUpdate(req.params.id, data, {
        new: true, runValidators: true,
      });
      if (!holiday) throw new AppError("Holiday not found.", "HOLIDAY_NOT_FOUND");

      await logAction(req, {
        action:     "updated",
        resource:   "holiday",
        resourceId: holiday._id,
        label:      holiday.name,
      });

      res.json({ success: true, data: holidayToClient(holiday) });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },

  remove: async (req, res) => {
    try {
      const holiday = await HolidayModel.findByIdAndDelete(req.params.id);
      if (!holiday) throw new AppError("Holiday not found.", "HOLIDAY_NOT_FOUND");

      await logAction(req, {
        action:     "deleted",
        resource:   "holiday",
        resourceId: req.params.id,
        label:      holiday.name,
      });

      res.json({ success: true, message: "Holiday deleted." });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },
};

export default holidayController;
