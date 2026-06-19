import AttendanceModel from "../model/Attendance.js";
import { attendanceToClient, attendanceFromClient } from "../utils/mappers.js";

const attendanceController = {
  getAll: async (req, res) => {
    try {
      const { pageSize = 50, pageNumber = 1, employeeId, from, to } = req.query;

      const condition = {};
      if (employeeId) condition.employee = employeeId;
      if (from || to) {
        condition.date = {};
        if (from) condition.date.$gte = new Date(from);
        if (to) condition.date.$lte = new Date(to);
      }

      const totalItems = await AttendanceModel.countDocuments(condition);
      const totalPages = Math.ceil(totalItems / pageSize);
      const skip = (pageNumber - 1) * pageSize;

      const items = await AttendanceModel.find(condition)
        .populate("employee", "name")
        .sort({ date: -1 })
        .skip(skip)
        .limit(Number(pageSize));

      res.json({
        success: true,
        totalItems,
        totalPages,
        currentPage: +pageNumber,
        items: items.map(attendanceToClient),
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // Upserts today's (or a given date's) record for an employee, mirroring a clock-in action.
  checkIn: async (req, res) => {
    try {
      const { employeeId, date } = req.body;
      if (!employeeId || !date) throw new Error("employeeId and date are required.");

      const data = attendanceFromClient(req.body);
      const record = await AttendanceModel.findOneAndUpdate(
        { employee: data.employee, date: data.date },
        { checkIn: data.checkIn || new Date().toTimeString().slice(0, 5), status: "present" },
        { new: true, upsert: true, runValidators: true },
      ).populate("employee", "name");

      res.status(201).json({ success: true, data: attendanceToClient(record) });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  },

  checkOut: async (req, res) => {
    try {
      const { employeeId, date } = req.body;
      if (!employeeId || !date) throw new Error("employeeId and date are required.");

      const data = attendanceFromClient(req.body);
      const record = await AttendanceModel.findOne({ employee: data.employee, date: data.date });
      if (!record) throw new Error("No check-in record found for this employee/date.");

      record.checkOut = data.checkOut || new Date().toTimeString().slice(0, 5);
      if (record.checkIn) {
        const [h1, m1] = record.checkIn.split(":").map(Number);
        const [h2, m2] = record.checkOut.split(":").map(Number);
        record.hours = Math.max(0, (h2 * 60 + m2 - (h1 * 60 + m1)) / 60);
      }
      await record.save();
      await record.populate("employee", "name");

      res.json({ success: true, data: attendanceToClient(record) });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  },

  update: async (req, res) => {
    try {
      const data = attendanceFromClient(req.body);
      const record = await AttendanceModel.findByIdAndUpdate(req.params.id, data, {
        new: true,
        runValidators: true,
      }).populate("employee", "name");
      if (!record) throw new Error("Attendance record not found.");
      res.json({ success: true, data: attendanceToClient(record) });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  },

  remove: async (req, res) => {
    try {
      const record = await AttendanceModel.findByIdAndDelete(req.params.id);
      if (!record) throw new Error("Attendance record not found.");
      res.json({ success: true, message: "Attendance record deleted." });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  },
};

export default attendanceController;
