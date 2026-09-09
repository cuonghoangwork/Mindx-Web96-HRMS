import { createHash } from "crypto";
import PerformanceCycleModel from "../model/PerformanceCycle.js";
import PerformanceReviewModel, {
  APPEAL_REASON_CATEGORIES,
  APPEAL_RESOLUTIONS,
  COMPETENCIES,
  COMPETENCY_LABELS,
  GOAL_PROGRESS_STEP,
  RATING_LABELS,
  RATING_OPTIONS,
  REVIEW_STATUSES
} from "../model/PerformanceReview.js";
import { notifyHR } from "../utils/notify.js";
import { diffChanges, logAction } from "../utils/auditLog.js";
import { askGemini } from "../utils/geminiClient.js";
import { buildInsightPrompt } from "../utils/performanceInsightPrompt.js";
import { sendPerformanceReminders } from "../jobs/performanceReminders.js";
import { computeAnalytics, computeComparison, reviewStatusOf } from "../utils/performanceAnalytics.js";
import {
  APPEAL_WINDOW_DAYS,
  ensureStandardCycles,
  isWithinAppealWindow,
  loadCycleOrThrow,
  previousStandardCycleKey
} from "../utils/performanceCycles.js";
import {
  assertCanRateAsManager,
  assertCanViewReview,
  assertIsSelf,
  departmentManagerUserIds,
  describePermissions,
  resolveRosterScope
} from "../utils/performanceScope.js";
import { AppError } from "../utils/appError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  cycleToClient,
  emptyReviewDoc,
  reviewToClient,
  employeeSummary,
  numberOr,
  assertObjectId
} from "../utils/performanceMappers.js";
import {
  REVIEW_LINK,
  REVIEW_LINK_LABEL,
  assertCycleOpen,
  loadReviewContext,
  loadScopedReviewData,
  computeCycleStats,
  findUserForEmployee,
  broadcastCycleOpen,
  notifyUsers
} from "../utils/performanceDomain.js";


const performanceController = {
  meta: asyncHandler(async (req, res) => {
    res.json({
      success: true,
      data: {
        ratingOptions: RATING_OPTIONS,
        ratingLabels: RATING_LABELS,
        competencies: COMPETENCIES,
        competencyLabels: COMPETENCY_LABELS,
        reviewStatuses: REVIEW_STATUSES,
        appealReasonCategories: APPEAL_REASON_CATEGORIES,
        appealResolutions: APPEAL_RESOLUTIONS,
        appealWindowDays: APPEAL_WINDOW_DAYS,
        goalProgressStep: GOAL_PROGRESS_STEP
      }
    });
  }, 500),

  listCycles: asyncHandler(async (req, res) => {
    await ensureStandardCycles();
    const cycles = await PerformanceCycleModel.find().sort({ start: -1, createdAt: -1 });
    res.json({ success: true, items: cycles.map(cycleToClient) });
  }, 500),

  createCycle: asyncHandler(async (req, res) => {
    const label = req.body.label.trim();
    const start = new Date(req.body.start);
    const end = new Date(req.body.end);

    let cycle = null;
    for (let attempt = 0; attempt < 3 && !cycle; attempt += 1) {
      const suffix = attempt === 0 ? "" : `-${attempt}`;
      try {
        cycle = await PerformanceCycleModel.create({
          key: `custom-${Date.now()}${suffix}`,
          label,
          kind: "custom",
          status: "Open",
          start,
          end,
          statusOverriddenAt: null,
          createdBy: req.user.id
        });
      } catch (error) {
        if (error?.code !== 11000 || attempt === 2) throw error;
      }
    }

    await logAction(req, {
      action: "created",
      resource: "performance",
      resourceId: cycle._id,
      label: `${cycle.label} (${cycle.key})`
    });

    await broadcastCycleOpen(cycle);

    res.status(201).json({ success: true, data: cycleToClient(cycle) });
  }, 400),

  updateCycleStatus: asyncHandler(async (req, res) => {
    const cycle = await loadCycleOrThrow(req.params.key);
    const before = cycle.status;
    const after = req.body.status;

    if (before !== after) {
      cycle.status = after;
      cycle.statusOverriddenAt = new Date();
      await cycle.save();

      await logAction(req, {
        action: "status_changed",
        resource: "performance",
        resourceId: cycle._id,
        label: `${cycle.label}: ${before} -> ${after}`
      });

      if (after === "Open") await broadcastCycleOpen(cycle);
    }

    res.json({ success: true, data: cycleToClient(cycle) });
  }, 400),

  getAnalytics: asyncHandler(async (req, res) => {
    const cycle = await loadCycleOrThrow(req.params.key);
    const { employeeCondition, scope } = await resolveRosterScope(req);
    const { employees, reviews } = await loadScopedReviewData(cycle.key, employeeCondition);

    res.json({
      success: true,
      cycle: cycleToClient(cycle),
      scope,
      data: computeAnalytics({ employees, reviews, includeDeptCompare: scope === "all" })
    });
  }, 500),

  getComparison: asyncHandler(async (req, res) => {
    const cycle = await loadCycleOrThrow(req.params.key);
    const { employeeCondition } = await resolveRosterScope(req);

    const previousKey = req.query.compareTo || previousStandardCycleKey(cycle.key) || null;
    let previousCycle = null;
    let previousStats = null;
    if (previousKey) {
      previousCycle = await loadCycleOrThrow(previousKey);
      previousStats = await computeCycleStats(previousCycle.key, employeeCondition);
    }

    const currentStats = await computeCycleStats(cycle.key, employeeCondition);

    res.json({
      success: true,
      cycle: cycleToClient(cycle),
      previous: previousCycle ? cycleToClient(previousCycle) : null,
      data: {
        current: currentStats,
        previous: previousStats,
        deltas: computeComparison(currentStats, previousStats)
      }
    });
  }, 500),

  getRoster: asyncHandler(async (req, res) => {
    const cycle = await loadCycleOrThrow(req.params.key);
    const { employeeCondition, scope } = await resolveRosterScope(req);
    const { employees, reviews } = await loadScopedReviewData(cycle.key, employeeCondition);

    const byEmployee = new Map(reviews.map((review) => [String(review.employee), review]));
    const items = employees.map((employee) => {
      const review = byEmployee.get(String(employee._id));
      return {
        ...employeeSummary(employee),
        selfRating: review?.selfRating ?? null,
        managerRating: review?.managerRating ?? null,
        selfSubmittedDate: review?.selfSubmittedDate ?? null,
        managerSubmittedDate: review?.managerSubmittedDate ?? null,
        status: reviewStatusOf(review),
        hasAppeal: Boolean(review?.appeal),
        appealStatus: review?.appeal?.status ?? null
      };
    });

    res.json({ success: true, cycle: cycleToClient(cycle), scope, items });
  }, 500),

  getReview: asyncHandler(async (req, res) => {
    const { cycle, employee, access } = await loadReviewContext(req);
    assertCanViewReview(access);

    const review = await PerformanceReviewModel.findOne({
      cycleKey: cycle.key,
      employee: employee._id
    });

    res.json({
      success: true,
      cycle: cycleToClient(cycle),
      employee: employeeSummary(employee),
      permissions: describePermissions(access, cycle, review),
      data: reviewToClient(
        review ?? emptyReviewDoc(cycle.key, employee._id),
        access.isAdmin || access.isHR,
      )
    });
  }, 500),

  getAiInsight: asyncHandler(async (req, res) => {
    const { cycle, employee, access } = await loadReviewContext(req);
    assertCanViewReview(access);

    const review = await PerformanceReviewModel.findOne({
      cycleKey: cycle.key,
      employee: employee._id
    });

    const prompt = buildInsightPrompt({
      employee,
      cycle,
      review: reviewToClient(review ?? emptyReviewDoc(cycle.key, employee._id)),
      language: req.body.language
    });

    // Gemini's forced "thinking" adds ~15-20s of unavoidable latency per
    // call (see geminiClient.js) — skip it entirely when this exact prompt
    // was already answered for this review, so re-opening the dialog or a
    // second HR user checking the same review is instant instead of
    // paying that cost again for an identical answer.
    const promptHash = createHash("sha256").update(prompt).digest("hex");
    if (review?.aiInsight?.promptHash === promptHash) {
      const { summary, strengths, growthAreas } = review.aiInsight;
      return res.json({ success: true, summary, strengths, growthAreas });
    }

    const insight = await askGemini(prompt, { json: true });
    if (
      typeof insight?.summary !== "string" ||
      !Array.isArray(insight?.strengths) ||
      !Array.isArray(insight?.growthAreas)
    ) {
      throw new AppError("Gemini response did not match the expected shape.", "AI_INSIGHT_INVALID_RESPONSE", null, 502);
    }

    if (review) {
      review.aiInsight = { ...insight, promptHash, generatedAt: new Date() };
      await review.save();
    }

    res.json({
      success: true,
      summary: insight.summary,
      strengths: insight.strengths,
      growthAreas: insight.growthAreas
    });
  }, 502),

  submitSelf: asyncHandler(async (req, res) => {
    const { cycle, employee, access } = await loadReviewContext(req);
    assertIsSelf(access, "submit this self review");
    assertCycleOpen(cycle);

    const filter = { cycleKey: cycle.key, employee: employee._id };
    const before = await PerformanceReviewModel.findOne(filter, "selfSubmittedDate");

    const review = await PerformanceReviewModel.findOneAndUpdate(
      filter,
      {
        $set: {
          selfRating: Number(req.body.selfRating),
          selfComments: (req.body.selfComments ?? "").trim(),
          selfSubmittedDate: new Date()
        }
      },
      { new: true, upsert: true, runValidators: true },
    );

    await logAction(req, {
      action: "updated",
      resource: "performance",
      resourceId: review._id,
      label: `Self review — ${employee.name} (${cycle.key})`
    });

    if (!before?.selfSubmittedDate) {
      const managerIds = await departmentManagerUserIds(employee.department, req.user.id);
      const copy = {
        title: "Self review submitted",
        message: `${employee.name} submitted their ${cycle.label} self review.`,
        titleKey: "selfReviewSubmitted",
        messageKey: "selfReviewSubmitted",
        params: { employeeName: employee.name, cycleLabel: cycle.label }
      };
      if (managerIds.length) {
        await notifyUsers(managerIds, copy);
      } else {
        await notifyHR({ ...copy, category: "performance", link: REVIEW_LINK, linkLabel: REVIEW_LINK_LABEL });
      }
    }

    res.json({ success: true, data: reviewToClient(review, access.isAdmin || access.isHR) });
  }, 400),

  submitManager: asyncHandler(async (req, res) => {
    const { cycle, employee, access } = await loadReviewContext(req);
    assertCanRateAsManager(access);
    assertCycleOpen(cycle);

    const filter = { cycleKey: cycle.key, employee: employee._id };
    const before = await PerformanceReviewModel.findOne(filter, "managerSubmittedDate");

    const review = await PerformanceReviewModel.findOneAndUpdate(
      filter,
      {
        $set: {
          managerRating: Number(req.body.managerRating),
          managerComments: (req.body.managerComments ?? "").trim(),
          managerSubmittedDate: new Date(),
          managerReviewedBy: req.user.id
        }
      },
      { new: true, upsert: true, runValidators: true },
    );

    await logAction(req, {
      action: "updated",
      resource: "performance",
      resourceId: review._id,
      label: `Manager review — ${employee.name} (${cycle.key})`
    });

    if (!before?.managerSubmittedDate) {
      const employeeUser = await findUserForEmployee(employee);
      if (employeeUser) {
        await notifyUsers([employeeUser._id], {
          title: "Manager review submitted",
          message: `Your ${cycle.label} manager review is ready to read.`,
          titleKey: "managerReviewSubmitted",
          messageKey: "managerReviewSubmitted",
          params: { cycleLabel: cycle.label }
        });
      }
    }

    res.json({ success: true, data: reviewToClient(review, access.isAdmin || access.isHR) });
  }, 400),

  setCompetency: asyncHandler(async (req, res) => {
    const { cycle, employee, access } = await loadReviewContext(req);
    const rater = access.isSelf ? "self" : "manager";
    if (!access.isSelf) assertCanRateAsManager(access);
    assertCycleOpen(cycle);

    const update = {};
    if (req.body.value !== undefined && req.body.value !== null && req.body.value !== "") {
      update[`competencies.${req.body.key}.${rater}`] = Number(req.body.value);
    }
    if (req.body.comment !== undefined && req.body.comment !== null && req.body.comment !== "") {
      update[`competencies.${req.body.key}.${rater}Comment`] = String(req.body.comment).trim();
    }
    if (!Object.keys(update).length) {
      const err = new AppError("Nothing to update.", "NOTHING_TO_UPDATE");
      err.status = 400;
      throw err;
    }

    const review = await PerformanceReviewModel.findOneAndUpdate(
      { cycleKey: cycle.key, employee: employee._id },
      { $set: update },
      { new: true, upsert: true, runValidators: true },
    );

    res.json({ success: true, data: reviewToClient(review, access.isAdmin || access.isHR) });
  }, 400),

  addGoal: asyncHandler(async (req, res) => {
    const { cycle, employee, access } = await loadReviewContext(req);
    assertIsSelf(access, "add goals to this review");
    assertCycleOpen(cycle);

    const review = await PerformanceReviewModel.findOneAndUpdate(
      { cycleKey: cycle.key, employee: employee._id },
      {
        $push: {
          goals: {
            text: req.body.text.trim(),
            progress: numberOr(req.body.progress, 0),
            createdBy: req.user.id
          }
        }
      },
      { new: true, upsert: true, runValidators: true },
    );

    res.status(201).json({
      success: true,
      data: reviewToClient(review, access.isAdmin || access.isHR)
    });
  }, 400),

  updateGoal: asyncHandler(async (req, res) => {
    const { cycle, employee, access } = await loadReviewContext(req);
    assertIsSelf(access, "update goals on this review");
    assertCycleOpen(cycle);
    assertObjectId(req.params.goalId, "Goal id");

    const review = await PerformanceReviewModel.findOneAndUpdate(
      { cycleKey: cycle.key, employee: employee._id, "goals._id": req.params.goalId },
      { $set: { "goals.$.progress": Number(req.body.progress) } },
      { new: true, runValidators: true },
    );

    if (!review) {
      const err = new AppError("Goal not found.", "PERFORMANCE_GOAL_NOT_FOUND");
      err.status = 404;
      throw err;
    }

    res.json({ success: true, data: reviewToClient(review, access.isAdmin || access.isHR) });
  }, 400),

  addPeerFeedback: asyncHandler(async (req, res) => {
    const { cycle, employee, access } = await loadReviewContext(req);
    assertCanViewReview(access);

    const review = await PerformanceReviewModel.findOneAndUpdate(
      { cycleKey: cycle.key, employee: employee._id },
      {
        $push: {
          peerFeedback: {
            name: req.body.name.trim(),
            relation: (req.body.relation ?? "").trim(),
            comments: req.body.comments.trim(),
            addedBy: req.user.id,
            addedAt: new Date()
          }
        }
      },
      { new: true, upsert: true, runValidators: true },
    );

    res.status(201).json({
      success: true,
      data: reviewToClient(review, access.isAdmin || access.isHR)
    });
  }, 400),

  fileAppeal: asyncHandler(async (req, res) => {
    const { cycle, employee, access } = await loadReviewContext(req);
    assertIsSelf(access, "file this appeal");

    const filter = { cycleKey: cycle.key, employee: employee._id };
    const existing = await PerformanceReviewModel.findOne(filter, "managerSubmittedDate appeal");

    if (!existing?.managerSubmittedDate) {
      const err = new AppError(
        "You can only appeal once the manager review has been submitted.",
        "MANAGER_REVIEW_NOT_SUBMITTED",
      );
      err.status = 400;
      throw err;
    }
    if (existing.appeal) {
      const err = new AppError("An appeal has already been filed for this review.", "APPEAL_ALREADY_FILED");
      err.status = 409;
      throw err;
    }
    if (!isWithinAppealWindow(existing.managerSubmittedDate)) {
      const err = new AppError(
        `Appeals close ${APPEAL_WINDOW_DAYS} days after the manager review was submitted.`,
        "APPEAL_WINDOW_CLOSED",
        { days: APPEAL_WINDOW_DAYS },
      );
      err.status = 400;
      throw err;
    }

    const review = await PerformanceReviewModel.findOneAndUpdate(
      { ...filter, appeal: null },
      {
        $set: {
          appeal: {
            reasonCategory: req.body.reasonCategory,
            detail: req.body.detail.trim(),
            status: "Pending",
            filedDate: new Date(),
            filedBy: req.user.id
          }
        }
      },
      { new: true, runValidators: true },
    );

    if (!review) {
      const err = new AppError("An appeal has already been filed for this review.", "APPEAL_ALREADY_FILED");
      err.status = 409;
      throw err;
    }

    await logAction(req, {
      action: "created",
      resource: "performance",
      resourceId: review._id,
      label: `Appeal — ${employee.name} (${cycle.key})`
    });

    await notifyHR({
      title: "Performance appeal filed",
      message: `${employee.name} appealed their ${cycle.label} manager rating.`,
      category: "performance",
      link: REVIEW_LINK,
      linkLabel: REVIEW_LINK_LABEL,
      titleKey: "appealFiled",
      messageKey: "appealFiled",
      params: { employeeName: employee.name, cycleLabel: cycle.label }
    });

    res.status(201).json({
      success: true,
      data: reviewToClient(review, access.isAdmin || access.isHR)
    });
  }, 400),

  resolveAppeal: asyncHandler(async (req, res) => {
    const { cycle, employee, access } = await loadReviewContext(req);

    const filter = { cycleKey: cycle.key, employee: employee._id };
    const existing = await PerformanceReviewModel.findOne(filter, "appeal managerRating");

    if (!existing?.appeal) {
      const err = new AppError("No appeal has been filed for this review.", "APPEAL_NOT_FOUND");
      err.status = 404;
      throw err;
    }
    if (existing.appeal.status !== "Pending") {
      const err = new AppError("This appeal has already been resolved.", "APPEAL_ALREADY_RESOLVED");
      err.status = 409;
      throw err;
    }

    const adjusted = req.body.resolution === "Adjusted";
    const resolvedRating = adjusted ? Number(req.body.resolvedRating) : null;

    const update = {
      "appeal.status": "Resolved",
      "appeal.resolution": req.body.resolution,
      "appeal.resolvedRating": resolvedRating,
      "appeal.resolverNote": req.body.resolverNote.trim(),
      "appeal.resolvedBy": req.user.id,
      "appeal.resolvedDate": new Date()
    };
    if (adjusted) update.managerRating = resolvedRating;

    const review = await PerformanceReviewModel.findOneAndUpdate(
      { ...filter, "appeal.status": "Pending" },
      { $set: update },
      { new: true, runValidators: true },
    );

    if (!review) {
      const err = new AppError("This appeal has already been resolved.", "APPEAL_ALREADY_RESOLVED");
      err.status = 409;
      throw err;
    }

    await logAction(req, {
      action: "status_changed",
      resource: "performance",
      resourceId: review._id,
      label: `Appeal ${req.body.resolution} — ${employee.name} (${cycle.key})`,
      changes: adjusted
        ? diffChanges(
            { managerRating: existing.managerRating },
            { managerRating: resolvedRating },
          )
        : undefined
    });

    const employeeUser = await findUserForEmployee(employee);
    if (employeeUser) {
      await notifyUsers([employeeUser._id], {
        title: "Performance appeal resolved",
        message: `Your ${cycle.label} appeal was ${req.body.resolution.toLowerCase()}.`,
        titleKey: "appealResolved",
        messageKey: "appealResolved",
        params: { cycleLabel: cycle.label, resolution: req.body.resolution.toLowerCase() }
      });
    }

    res.json({ success: true, data: reviewToClient(review, access.isAdmin || access.isHR) });
  }, 400),

  // Manual trigger for the daily reminder sweep, matching the ADMIN-only job
  // triggers in attendanceRouter.js, payrollRouter.js and
  // promotionRequestRouter.js. Needed because ENABLE_SCHEDULER is false on
  // Render's free plan (render.yaml).
  //
  // Optional asOf shifts the "cycle ends within 7 days" window. Re-running is
  // safe: the job checks for an existing Notification with the same title
  // (which embeds the cycle key) before sending, so nobody is reminded twice
  // for the same cycle.
  sendReminders: asyncHandler(async (req, res) => {
    const raw = req.body?.asOf;
    const asOf = raw ? new Date(raw) : new Date();
    if (Number.isNaN(asOf.getTime())) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid asOf date.", code: "INVALID_ASOF" });
    }

    const result = await sendPerformanceReminders({ asOf });
    res.json({ success: true, data: result });
  }, 400)
};

export default performanceController;
