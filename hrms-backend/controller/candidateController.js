import CandidateModel from "../model/Candidate.js";
import { candidateToClient, candidateFromClient } from "../utils/mappers.js";
import { logAction } from "../utils/auditLog.js";
import { isCloudinaryConfigured, uploadBufferToCloudinary } from "../utils/cloudinary.js";
import { AppError } from "../utils/appError.js";

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
      res.status(500).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },

  getDetail: async (req, res) => {
    try {
      const candidate = await CandidateModel.findById(req.params.id).populate("job", "title");
      if (!candidate) throw new AppError("Candidate not found.", "CANDIDATE_NOT_FOUND");
      res.json({ success: true, data: candidateToClient(candidate) });
    } catch (error) {
      res.status(404).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },

  create: async (req, res) => {
    try {
      const { name, email, jobId } = req.body;
      if (!name) throw new AppError("Candidate name is required.", "CANDIDATE_NAME_REQUIRED");
      if (!email) throw new AppError("Candidate email is required.", "CANDIDATE_EMAIL_REQUIRED");
      if (!jobId) throw new AppError("jobId is required.", "JOB_ID_REQUIRED");
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
      res.status(400).json({ success: false, message: error.message, code: error.code, params: error.params });
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
      if (!candidate) throw new AppError("Candidate not found.", "CANDIDATE_NOT_FOUND");

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
      res.status(400).json({ success: false, message: error.message, code: error.code, params: error.params });
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
        throw new AppError(
          "Document uploads are not configured on this server (missing CLOUD_NAME/API_KEY/API_SECRET).",
          "DOCUMENT_UPLOAD_NOT_CONFIGURED",
        );
      }
      if (!req.file) throw new AppError("No CV/resume file was uploaded.", "CV_FILE_REQUIRED");

      const candidate = await CandidateModel.findById(req.params.id);
      if (!candidate) throw new AppError("Candidate not found.", "CANDIDATE_NOT_FOUND");

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
      res.status(400).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },

  remove: async (req, res) => {
    try {
      const candidate = await CandidateModel.findByIdAndDelete(req.params.id);
      if (!candidate) throw new AppError("Candidate not found.", "CANDIDATE_NOT_FOUND");

      await logAction(req, {
        action:     "deleted",
        resource:   "candidate",
        resourceId: req.params.id,
        label:      candidate.name,
      });

      res.json({ success: true, message: "Candidate deleted." });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },
};

export default candidateController;
