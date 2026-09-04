import mongoose from "mongoose";

export const RATING_OPTIONS = [1, 2, 3, 4, 5];

export const RATING_LABELS = {
  1: "Needs improvement",
  2: "Developing",
  3: "Meets expectations",
  4: "Exceeds expectations",
  5: "Outstanding",
};

export const COMPETENCIES = [
  "communication",
  "execution",
  "ownership",
  "collaboration",
  "leadership",
  "problemSolving",
];

export const COMPETENCY_LABELS = {
  communication: "Communication",
  execution: "Execution",
  ownership: "Ownership",
  collaboration: "Collaboration",
  leadership: "Leadership",
  problemSolving: "Problem solving",
};

export const RATERS = ["self", "manager"];

export const REVIEW_STATUSES = [
  "Not started",
  "Self submitted",
  "Manager submitted",
  "Completed",
];

export const APPEAL_REASON_CATEGORIES = ["rating_low", "inaccurate", "process", "other"];
export const APPEAL_STATUSES = ["Pending", "Resolved"];
export const APPEAL_RESOLUTIONS = ["Upheld", "Adjusted"];

export const GOAL_PROGRESS_STEP = 10;
export const GOAL_PROGRESS_MIN = 0;
export const GOAL_PROGRESS_MAX = 100;

const competencyRatingSchema = new mongoose.Schema(
  {
    self: { type: Number, min: 1, max: 5, default: null },
    selfComment: { type: String, default: "" },
    manager: { type: Number, min: 1, max: 5, default: null },
    managerComment: { type: String, default: "" },
  },
  { _id: false },
);

const competenciesSchema = new mongoose.Schema(
  Object.fromEntries(
    COMPETENCIES.map((key) => [key, { type: competencyRatingSchema, default: () => ({}) }]),
  ),
  { _id: false },
);

const goalSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true },
    progress: {
      type: Number,
      min: GOAL_PROGRESS_MIN,
      max: GOAL_PROGRESS_MAX,
      default: GOAL_PROGRESS_MIN,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

const peerFeedbackSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  relation: { type: String, default: "", trim: true },
  comments: { type: String, default: "", trim: true },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  addedAt: { type: Date, default: Date.now },
});

const appealSchema = new mongoose.Schema(
  {
    reasonCategory: { type: String, enum: APPEAL_REASON_CATEGORIES, required: true },
    detail: { type: String, default: "" },
    status: { type: String, enum: APPEAL_STATUSES, default: "Pending" },
    filedDate: { type: Date, default: Date.now },
    filedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    resolution: { type: String, enum: APPEAL_RESOLUTIONS, default: null },
    resolvedRating: { type: Number, min: 1, max: 5, default: null },
    resolverNote: { type: String, default: "" },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    resolvedDate: { type: Date, default: null },
  },
  { _id: false },
);

/** Cached "Ask AI" result — Gemini's forced "thinking" adds ~15-20s of
 * unavoidable latency per call (see geminiClient.js), so performanceController
 * skips re-calling it when the exact same prompt (hashed) was already
 * answered for this review. promptHash naturally invalidates the cache
 * whenever the underlying review content, employee, cycle, or language
 * changes, since any of those change the prompt string. */
const aiInsightSchema = new mongoose.Schema(
  {
    summary: { type: String, required: true },
    strengths: { type: [String], default: [] },
    growthAreas: { type: [String], default: [] },
    promptHash: { type: String, required: true },
    generatedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const performanceReviewSchema = new mongoose.Schema(
  {
    cycleKey: { type: String, required: true, trim: true },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true },

    selfRating: { type: Number, min: 1, max: 5, default: null },
    selfComments: { type: String, default: "" },
    selfSubmittedDate: { type: Date, default: null },

    managerRating: { type: Number, min: 1, max: 5, default: null },
    managerComments: { type: String, default: "" },
    managerSubmittedDate: { type: Date, default: null },
    managerReviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    competencies: { type: competenciesSchema, default: () => ({}) },
    goals: { type: [goalSchema], default: [] },
    peerFeedback: { type: [peerFeedbackSchema], default: [] },
    appeal: { type: appealSchema, default: null },
    aiInsight: { type: aiInsightSchema, default: null },
  },
  { timestamps: true },
);

performanceReviewSchema.index({ cycleKey: 1, employee: 1 }, { unique: true });
performanceReviewSchema.index({ employee: 1 });

export default mongoose.model("PerformanceReview", performanceReviewSchema, "performanceReviews");
