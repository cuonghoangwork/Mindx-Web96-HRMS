import CandidateModel from "../model/Candidate.js";
import { candidateToClient, candidateFromClient } from "../utils/mappers.js";

const candidateController = {
  getAll: async (req, res) => {
    try {
      const { pageSize = 10, pageNumber = 1, search, stage, job: jobId } = req.query;

      const condition = {};
      if (search) condition.name = { $regex: search, $options: "i" };
      if (stage && stage !== "all") {
        const mapped = candidateFromClient({ stage });
        if (mapped.stage) condition.stage = mapped.stage;
      }
      if (jobId) condition.job = jobId;

      const totalItems = await CandidateModel.countDocuments(condition);
      const totalPages = Math.ceil(totalItems / pageSize);
      const skip = (pageNumber - 1) * pageSize;

      const items = await CandidateModel.find(condition)
        .populate("job", "title")
        .sort({ appliedDate: -1 })
        .skip(skip)
        .limit(Number(pageSize));

      res.json({
        success: true,
        totalItems,
        totalPages,
        currentPage: +pageNumber,
        items: items.map(candidateToClient),
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  getDetail: async (req, res) => {
    try {
      const candidate = await CandidateModel.findById(req.params.id).populate("job", "title");
      if (!candidate) throw new Error("Candidate not found.");
      res.json({ success: true, data: candidateToClient(candidate) });
    } catch (error) {
      res.status(404).json({ success: false, message: error.message });
    }
  },

  create: async (req, res) => {
    try {
      const { name, email, jobId } = req.body;
      if (!name) throw new Error("Candidate name is required.");
      if (!email) throw new Error("Candidate email is required.");
      if (!jobId) throw new Error("jobId is required.");

      const data = candidateFromClient(req.body);
      const candidate = await CandidateModel.create(data);
      await candidate.populate("job", "title");
      res.status(201).json({ success: true, data: candidateToClient(candidate) });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  },

  update: async (req, res) => {
    try {
      const data = candidateFromClient(req.body);
      const candidate = await CandidateModel.findByIdAndUpdate(req.params.id, data, {
        new: true,
        runValidators: true,
      }).populate("job", "title");
      if (!candidate) throw new Error("Candidate not found.");
      res.json({ success: true, data: candidateToClient(candidate) });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  },

  remove: async (req, res) => {
    try {
      const candidate = await CandidateModel.findByIdAndDelete(req.params.id);
      if (!candidate) throw new Error("Candidate not found.");
      res.json({ success: true, message: "Candidate deleted." });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  },
};

export default candidateController;
