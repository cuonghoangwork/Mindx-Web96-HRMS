import JobModel from "../model/Job.js";
import CandidateModel from "../model/Candidate.js";
import DepartmentModel from "../model/Department.js";
import { jobToClient, jobFromClient } from "../utils/mappers.js";
import { resolveDepartmentIdByName } from "../utils/refResolvers.js";
import { logAction } from "../utils/auditLog.js";
import { AppError } from "../utils/appError.js";

const jobController = {
  getAll: async (req, res) => {
    try {
      const { pageSize = 10, pageNumber = 1, search, status, department, type } = req.query;
      const condition = {};
      if (search) condition.title = { $regex: search, $options: "i" };
      if (status && status !== "all") {
        const mapped = jobFromClient({ status });
        if (mapped.status) condition.status = mapped.status;
      }
      if (type && type !== "all") {
        const mapped = jobFromClient({ type });
        if (mapped.type) condition.type = mapped.type;
      }
      if (department && department !== "all") {
        const dept = await DepartmentModel.findOne({ name: department }, "_id");
        condition.department = dept ? dept._id : null;
      }
      const totalItems = await JobModel.countDocuments(condition);
      const totalPages = Math.ceil(totalItems / pageSize);
      const skip = (pageNumber - 1) * pageSize;
      const jobs = await JobModel.find(condition)
        .populate("department", "name")
        .sort({ postedDate: -1 })
        .skip(skip)
        .limit(Number(pageSize));
      const items = await Promise.all(
        jobs.map(async (job) => {
          const applicantCount = await CandidateModel.countDocuments({ job: job._id });
          return jobToClient({ ...job.toObject(), applicantCount });
        }),
      );
      res.json({ success: true, totalItems, totalPages, currentPage: +pageNumber, items });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },

  getDetail: async (req, res) => {
    try {
      const job = await JobModel.findById(req.params.id).populate("department", "name");
      if (!job) throw new AppError("Job not found.", "JOB_NOT_FOUND");
      const applicantCount = await CandidateModel.countDocuments({ job: job._id });
      res.json({ success: true, data: jobToClient({ ...job.toObject(), applicantCount }) });
    } catch (error) {
      res.status(404).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },

  create: async (req, res) => {
    try {
      const { title } = req.body;
      if (!title) throw new AppError("Job title is required.", "JOB_TITLE_REQUIRED");
      const data = jobFromClient(req.body);
      if (req.body.department) {
        data.department = await resolveDepartmentIdByName(req.body.department);
      }
      const job = await JobModel.create(data);
      await job.populate("department", "name");

      await logAction(req, {
        action:     "created",
        resource:   "job",
        resourceId: job._id,
        label:      job.title,
      });

      res.status(201).json({ success: true, data: jobToClient({ ...job.toObject(), applicantCount: 0 }) });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },

  update: async (req, res) => {
    try {
      const data = jobFromClient(req.body);
      if (req.body.department !== undefined) {
        data.department = req.body.department
          ? await resolveDepartmentIdByName(req.body.department)
          : null;
      }
      const job = await JobModel.findByIdAndUpdate(req.params.id, data, {
        new: true, runValidators: true,
      }).populate("department", "name");
      if (!job) throw new AppError("Job not found.", "JOB_NOT_FOUND");
      const applicantCount = await CandidateModel.countDocuments({ job: job._id });

      await logAction(req, {
        action:     "updated",
        resource:   "job",
        resourceId: job._id,
        label:      job.title,
      });

      res.json({ success: true, data: jobToClient({ ...job.toObject(), applicantCount }) });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },

  remove: async (req, res) => {
    try {
      const job = await JobModel.findByIdAndDelete(req.params.id);
      if (!job) throw new AppError("Job not found.", "JOB_NOT_FOUND");

      await logAction(req, {
        action:     "deleted",
        resource:   "job",
        resourceId: req.params.id,
        label:      job.title,
      });

      res.json({ success: true, message: "Job deleted." });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },
};

export default jobController;
