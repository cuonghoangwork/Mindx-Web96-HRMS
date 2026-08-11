import CandidateModel from "../model/Candidate.js";
import { candidateToClient, candidateFromClient } from "../utils/mappers.js";
import { logAction } from "../utils/auditLog.js";
import { isCloudinaryConfigured, uploadBufferToCloudinary } from "../utils/cloudinary.js";

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
      res.json({ success: true, totalItems, totalPages, currentPage: +pageNumber, items: items.map(candidateToClient) });
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

      await logAction(req, {
        action:     "created",
        resource:   "candidate",
        resourceId: candidate._id,
        label:      `${candidate.name} → ${candidate.job?.title ?? "Unknown role"}`,
      });

      res.status(201).json({ success: true, data: candidateToClient(candidate) });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  },

  update: async (req, res) => {
    try {
      // Snapshot stage before update to detect stage changes
      const before = await CandidateModel.findById(req.params.id);
      const beforeStage = before?.stage;

      const data = candidateFromClient(req.body);
      const candidate = await CandidateModel.findByIdAndUpdate(req.params.id, data, {
        new: true, runValidators: true,
      }).populate("job", "title");
      if (!candidate) throw new Error("Candidate not found.");

      const isStageChange = req.body.stage && beforeStage !== data.stage;
      await logAction(req, {
        action:     isStageChange ? "stage_changed" : "updated",
        resource:   "candidate",
        resourceId: candidate._id,
        label:      `${candidate.name} → ${candidate.job?.title ?? "Unknown role"}`,
        changes:    isStageChange
          ? { stage: { from: beforeStage, to: data.stage } }
          : undefined,
      });

      res.json({ success: true, data: candidateToClient(candidate) });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  },

  // Task 5.3 — real PDF CV upload for a candidate. Mirrors
  // employeeController.uploadContract (task 1.4): memoryStorage buffer piped
  // straight to Cloudinary as a "raw" resource, never written to local disk.
  // HR/Admin only (same authorize() guard as create/update/remove below) —
  // there's no candidate-facing self-service portal in this app.
  uploadCv: async (req, res) => {
    try {
      if (!isCloudinaryConfigured()) {
        throw new Error(
          "Document uploads are not configured on this server (missing CLOUD_NAME/API_KEY/API_SECRET).",
        );
      }
      if (!req.file) throw new Error("No CV/resume file was uploaded.");

      const candidate = await CandidateModel.findById(req.params.id);
      if (!candidate) throw new Error("Candidate not found.");

      const result = await uploadBufferToCloudinary(req.file.buffer, {
        folder: "hrms/candidate-resumes",
        public_id: `candidate_${candidate._id}_resume`,
        overwrite: true,
        resource_type: "raw",
        format: "pdf",
      });

      candidate.resumeUrl = result.secure_url;
      candidate.resumeUploadedAt = new Date();
      await candidate.save();
      await candidate.populate("job", "title");

      await logAction(req, {
        action: "updated",
        resource: "candidate",
        resourceId: candidate._id,
        label: `${candidate.name} → ${candidate.job?.title ?? "Unknown role"} — CV uploaded`,
      });

      res.json({ success: true, data: candidateToClient(candidate) });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  },

  remove: async (req, res) => {
    try {
      const candidate = await CandidateModel.findByIdAndDelete(req.params.id);
      if (!candidate) throw new Error("Candidate not found.");

      await logAction(req, {
        action:     "deleted",
        resource:   "candidate",
        resourceId: req.params.id,
        label:      candidate.name,
      });

      res.json({ success: true, message: "Candidate deleted." });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  },
};

export default candidateController;
