import JobModel from "../model/Job.js";
import CandidateModel from "../model/Candidate.js";
import DepartmentModel from "../model/Department.js";
import { jobToClient, jobFromClient } from "../utils/mappers.js";
import { resolveDepartmentIdByName } from "../utils/refResolvers.js";

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
        condition.department = dept ? dept._id : null; // null -> no matches, same as an empty result
      }

      const totalItems = await JobModel.countDocuments(condition);
      const totalPages = Math.ceil(totalItems / pageSize);
      const skip = (pageNumber - 1) * pageSize;

      const jobs = await JobModel.find(condition)
        .populate("department", "name")
        .sort({ postedDate: -1 })
        .skip(skip)
        .limit(Number(pageSize));

      // Applicant counts are derived live from Candidates, matching the frontend's
      // getApplicantCount() selector pattern instead of storing a redundant counter.
      const items = await Promise.all(
        jobs.map(async (job) => {
          const applicantCount = await CandidateModel.countDocuments({ job: job._id });
          return jobToClient({ ...job.toObject(), applicantCount });
        }),
      );

      res.json({ success: true, totalItems, totalPages, currentPage: +pageNumber, items });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  getDetail: async (req, res) => {
    try {
      const job = await JobModel.findById(req.params.id).populate("department", "name");
      if (!job) throw new Error("Job not found.");
      const applicantCount = await CandidateModel.countDocuments({ job: job._id });
      res.json({ success: true, data: jobToClient({ ...job.toObject(), applicantCount }) });
    } catch (error) {
      res.status(404).json({ success: false, message: error.message });
    }
  },

  create: async (req, res) => {
    try {
      const { title } = req.body;
      if (!title) throw new Error("Job title is required.");

      const data = jobFromClient(req.body);
      if (req.body.department) {
        data.department = await resolveDepartmentIdByName(req.body.department);
      }

      const job = await JobModel.create(data);
      await job.populate("department", "name");
      res.status(201).json({ success: true, data: jobToClient({ ...job.toObject(), applicantCount: 0 }) });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
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
        new: true,
        runValidators: true,
      }).populate("department", "name");
      if (!job) throw new Error("Job not found.");

      const applicantCount = await CandidateModel.countDocuments({ job: job._id });
      res.json({ success: true, data: jobToClient({ ...job.toObject(), applicantCount }) });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  },

  remove: async (req, res) => {
    try {
      const job = await JobModel.findByIdAndDelete(req.params.id);
      if (!job) throw new Error("Job not found.");
      res.json({ success: true, message: "Job deleted." });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  },
};

export default jobController;
