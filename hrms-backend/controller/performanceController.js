import mongoose from "mongoose";
import EmployeeModel from "../model/Employee.js";
import NotificationModel from "../model/Notification.js";
import UserModel from "../model/User.js";
import PerformanceCycleModel from "../model/PerformanceCycle.js";
import PerformanceReviewModel, {
  APPEAL_REASON_CATEGORIES,
  APPEAL_RESOLUTIONS,
  COMPETENCIES,
  COMPETENCY_LABELS,
  GOAL_PROGRESS_STEP,
  RATING_LABELS,
  RATING_OPTIONS,
  REVIEW_STATUSES,
} from "../model/PerformanceReview.js";
import { notifyHR } from "./notificationController.js";
import { diffChanges, logAction } from "../utils/auditLog.js";
import { computeAnalytics, reviewStatusOf } from "../utils/performanceAnalytics.js";
import {
  APPEAL_WINDOW_DAYS,
  appealDeadlineKey,
  ensureStandardCycles,
  isWithinAppealWindow,
  loadCycleOrThrow,
} from "../utils/performanceCycles.js";
import {
  assertCanRateAsManager,
  assertCanViewReview,
  assertIsSelf,
  departmentManagerUserIds,
  describePermissions,
  evaluateAccess,
  idOf,
  resolveRosterScope,
} from "../utils/performanceScope.js";

const REVIEW_LINK = "/performance";
const REVIEW_LINK_LABEL = "Open review";

function cycleToClient(doc) {
  if (!doc) return doc;
  const o = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return {
    id: o._id ? String(o._id) : null,
    key: o.key,
    label: o.label,
    kind: o.kind,
    status: o.status,
    start: o.start ?? null,
    end: o.end ?? null,
    statusOverriddenAt: o.statusOverriddenAt ?? null,
  };
}

function competenciesToClient(value) {
  const source = value && typeof value.toObject === "function" ? value.toObject() : (value ?? {});
  return Object.fromEntries(
    COMPETENCIES.map((key) => [
      key,
      { self: source?.[key]?.self ?? null, manager: source?.[key]?.manager ?? null },
    ]),
  );
}

function goalToClient(doc) {
  if (!doc) return doc;
  const o = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return {
    id: o._id ? String(o._id) : null,
    text: o.text ?? "",
    progress: o.progress ?? 0,
  };
}

function peerFeedbackToClient(doc, includeAudit) {
  if (!doc) return doc;
  const o = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return {
    id: o._id ? String(o._id) : null,
    name: o.name ?? "",
    relation: o.relation ?? "",
    comments: o.comments ?? "",
    addedAt: o.addedAt ?? null,
    ...(includeAudit ? { addedBy: o.addedBy ? String(o.addedBy) : null } : {}),
  };
}

function appealToClient(value) {
  if (!value) return null;
  const o = typeof value.toObject === "function" ? value.toObject() : value;
  return {
    reasonCategory: o.reasonCategory ?? null,
    detail: o.detail ?? "",
    status: o.status ?? null,
    filedDate: o.filedDate ?? null,
    resolution: o.resolution ?? null,
    resolvedRating: o.resolvedRating ?? null,
    resolverNote: o.resolverNote ?? "",
    resolvedDate: o.resolvedDate ?? null,
  };
}

function emptyReviewDoc(cycleKey, employeeId) {
  return {
    _id: null,
    cycleKey,
    employee: employeeId,
    selfRating: null,
    selfComments: "",
    selfSubmittedDate: null,
    managerRating: null,
    managerComments: "",
    managerSubmittedDate: null,
    competencies: {},
    goals: [],
    peerFeedback: [],
    appeal: null,
    createdAt: null,
    updatedAt: null,
  };
}

function reviewToClient(doc, includeAudit = false) {
  if (!doc) return doc;
  const o = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return {
    id: o._id ? String(o._id) : null,
    cycleKey: o.cycleKey ?? null,
    employeeId: idOf(o.employee),
    selfRating: o.selfRating ?? null,
    selfComments: o.selfComments ?? "",
    selfSubmittedDate: o.selfSubmittedDate ?? null,
    managerRating: o.managerRating ?? null,
    managerComments: o.managerComments ?? "",
    managerSubmittedDate: o.managerSubmittedDate ?? null,
    competencies: competenciesToClient(o.competencies),
    goals: (o.goals ?? []).map(goalToClient),
    peerFeedback: (o.peerFeedback ?? []).map((row) => peerFeedbackToClient(row, includeAudit)),
    appeal: appealToClient(o.appeal),
    status: reviewStatusOf(o),
    appealDeadline: appealDeadlineKey(o.managerSubmittedDate),
    createdAt: o.createdAt ?? null,
    updatedAt: o.updatedAt ?? null,
  };
}

function employeeToClient(employee) {
  return {
    employeeId: String(employee._id),
    employeeCode: employee.employeeId ?? null,
    name: employee.name ?? null,
    department: employee.department?.name ?? null,
    departmentId: idOf(employee.department),
  };
}

function numberOr(value, fallback) {
  return value === undefined || value === null || value === "" ? fallback : Number(value);
}

function assertObjectId(value, label) {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    const err = new Error(`${label} is not a valid id.`);
    err.status = 400;
    throw err;
  }
}

function assertCycleOpen(cycle) {
  if (cycle.status !== "Open") {
    const err = new Error(
      "This review cycle is closed. Ask an admin to reopen it before making changes.",
    );
    err.status = 409;
    throw err;
  }
}

async function loadEmployeeOrThrow(employeeId) {
  assertObjectId(employeeId, "Employee id");
  const employee = await EmployeeModel.findById(
    employeeId,
    "name email employeeId department",
  ).populate("department", "name");
  if (!employee) {
    const err = new Error("Employee not found.");
    err.status = 404;
    throw err;
  }
  return employee;
}

async function loadReviewContext(req) {
  const cycle = await loadCycleOrThrow(req.params.cycleKey);
  const employee = await loadEmployeeOrThrow(req.params.employeeId);
  const access = await evaluateAccess(req, employee);
  return { cycle, employee, access };
}

async function loadScopedReviewData(cycleKey, employeeCondition) {
  if (!employeeCondition) return { employees: [], reviews: [] };

  const employees = await EmployeeModel.find(employeeCondition, "name employeeId department")
    .populate("department", "name")
    .sort({ name: 1 });
  if (!employees.length) return { employees, reviews: [] };

  const reviews = await PerformanceReviewModel.find({
    cycleKey,
    employee: { $in: employees.map((employee) => employee._id) },
  });
  return { employees, reviews };
}

async function findUserForEmployee(employee) {
  return UserModel.findOne(
    { $or: [{ employee: employee._id }, { email: employee.email }] },
    "_id",
  );
}

async function broadcastCycleOpen(cycle) {
  try {
    await NotificationModel.create({
      user: null,
      audience: "all",
      category: "performance",
      title: "Review cycle open",
      message: `${cycle.label} is now open for performance reviews.`,
      link: REVIEW_LINK,
      linkLabel: REVIEW_LINK_LABEL,
      isCustom: false,
    });
  } catch (err) {
    console.error("[performance] Failed to broadcast cycle status:", err.message);
  }
}

async function notifyUsers(userIds, payload) {
  await Promise.all(
    userIds.map((userId) =>
      NotificationModel.create({
        user: userId,
        category: "performance",
        title: payload.title,
        message: payload.message,
        link: REVIEW_LINK,
        linkLabel: REVIEW_LINK_LABEL,
        isCustom: false,
      }).catch((err) =>
        console.error("[performance] Failed to create notification:", err.message),
      ),
    ),
  );
}

const performanceController = {
  meta: async (req, res) => {
    try {
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
          goalProgressStep: GOAL_PROGRESS_STEP,
        },
      });
    } catch (error) {
      res.status(error.status || 500).json({ success: false, message: error.message });
    }
  },

  listCycles: async (req, res) => {
    try {
      await ensureStandardCycles();
      const cycles = await PerformanceCycleModel.find().sort({ start: -1, createdAt: -1 });
      res.json({ success: true, items: cycles.map(cycleToClient) });
    } catch (error) {
      res.status(error.status || 500).json({ success: false, message: error.message });
    }
  },

  createCycle: async (req, res) => {
    try {
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
            createdBy: req.user.id,
          });
        } catch (error) {
          if (error?.code !== 11000 || attempt === 2) throw error;
        }
      }

      await logAction(req, {
        action: "created",
        resource: "performance",
        resourceId: cycle._id,
        label: `${cycle.label} (${cycle.key})`,
      });

      await broadcastCycleOpen(cycle);

      res.status(201).json({ success: true, data: cycleToClient(cycle) });
    } catch (error) {
      res.status(error.status || 400).json({ success: false, message: error.message });
    }
  },

  updateCycleStatus: async (req, res) => {
    try {
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
          label: `${cycle.label}: ${before} -> ${after}`,
        });

        if (after === "Open") await broadcastCycleOpen(cycle);
      }

      res.json({ success: true, data: cycleToClient(cycle) });
    } catch (error) {
      res.status(error.status || 400).json({ success: false, message: error.message });
    }
  },

  getAnalytics: async (req, res) => {
    try {
      const cycle = await loadCycleOrThrow(req.params.key);
      const { employeeCondition, scope } = await resolveRosterScope(req);
      const { employees, reviews } = await loadScopedReviewData(cycle.key, employeeCondition);

      res.json({
        success: true,
        cycle: cycleToClient(cycle),
        scope,
        data: computeAnalytics({ employees, reviews, includeDeptCompare: scope === "all" }),
      });
    } catch (error) {
      res.status(error.status || 500).json({ success: false, message: error.message });
    }
  },

  getRoster: async (req, res) => {
    try {
      const cycle = await loadCycleOrThrow(req.params.key);
      const { employeeCondition, scope } = await resolveRosterScope(req);
      const { employees, reviews } = await loadScopedReviewData(cycle.key, employeeCondition);

      const byEmployee = new Map(reviews.map((review) => [String(review.employee), review]));
      const items = employees.map((employee) => {
        const review = byEmployee.get(String(employee._id));
        return {
          ...employeeToClient(employee),
          selfRating: review?.selfRating ?? null,
          managerRating: review?.managerRating ?? null,
          selfSubmittedDate: review?.selfSubmittedDate ?? null,
          managerSubmittedDate: review?.managerSubmittedDate ?? null,
          status: reviewStatusOf(review),
          hasAppeal: Boolean(review?.appeal),
          appealStatus: review?.appeal?.status ?? null,
        };
      });

      res.json({ success: true, cycle: cycleToClient(cycle), scope, items });
    } catch (error) {
      res.status(error.status || 500).json({ success: false, message: error.message });
    }
  },

  getReview: async (req, res) => {
    try {
      const { cycle, employee, access } = await loadReviewContext(req);
      assertCanViewReview(access);

      const review = await PerformanceReviewModel.findOne({
        cycleKey: cycle.key,
        employee: employee._id,
      });

      res.json({
        success: true,
        cycle: cycleToClient(cycle),
        employee: employeeToClient(employee),
        permissions: describePermissions(access, cycle, review),
        data: reviewToClient(
          review ?? emptyReviewDoc(cycle.key, employee._id),
          access.isAdmin || access.isHR,
        ),
      });
    } catch (error) {
      res.status(error.status || 500).json({ success: false, message: error.message });
    }
  },

  submitSelf: async (req, res) => {
    try {
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
            selfSubmittedDate: new Date(),
          },
        },
        { new: true, upsert: true, runValidators: true },
      );

      await logAction(req, {
        action: "updated",
        resource: "performance",
        resourceId: review._id,
        label: `Self review — ${employee.name} (${cycle.key})`,
      });

      if (!before?.selfSubmittedDate) {
        const managerIds = await departmentManagerUserIds(employee.department, req.user.id);
        const copy = {
          title: "Self review submitted",
          message: `${employee.name} submitted their ${cycle.label} self review.`,
        };
        if (managerIds.length) {
          await notifyUsers(managerIds, copy);
        } else {
          await notifyHR({ ...copy, category: "performance", link: REVIEW_LINK, linkLabel: REVIEW_LINK_LABEL });
        }
      }

      res.json({ success: true, data: reviewToClient(review, access.isAdmin || access.isHR) });
    } catch (error) {
      res.status(error.status || 400).json({ success: false, message: error.message });
    }
  },

  submitManager: async (req, res) => {
    try {
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
            managerReviewedBy: req.user.id,
          },
        },
        { new: true, upsert: true, runValidators: true },
      );

      await logAction(req, {
        action: "updated",
        resource: "performance",
        resourceId: review._id,
        label: `Manager review — ${employee.name} (${cycle.key})`,
      });

      if (!before?.managerSubmittedDate) {
        const employeeUser = await findUserForEmployee(employee);
        if (employeeUser) {
          await notifyUsers([employeeUser._id], {
            title: "Manager review submitted",
            message: `Your ${cycle.label} manager review is ready to read.`,
          });
        }
      }

      res.json({ success: true, data: reviewToClient(review, access.isAdmin || access.isHR) });
    } catch (error) {
      res.status(error.status || 400).json({ success: false, message: error.message });
    }
  },

  setCompetency: async (req, res) => {
    try {
      const { cycle, employee, access } = await loadReviewContext(req);
      const rater = access.isSelf ? "self" : "manager";
      if (!access.isSelf) assertCanRateAsManager(access);
      assertCycleOpen(cycle);

      const review = await PerformanceReviewModel.findOneAndUpdate(
        { cycleKey: cycle.key, employee: employee._id },
        { $set: { [`competencies.${req.body.key}.${rater}`]: Number(req.body.value) } },
        { new: true, upsert: true, runValidators: true },
      );

      res.json({ success: true, data: reviewToClient(review, access.isAdmin || access.isHR) });
    } catch (error) {
      res.status(error.status || 400).json({ success: false, message: error.message });
    }
  },

  addGoal: async (req, res) => {
    try {
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
              createdBy: req.user.id,
            },
          },
        },
        { new: true, upsert: true, runValidators: true },
      );

      res.status(201).json({
        success: true,
        data: reviewToClient(review, access.isAdmin || access.isHR),
      });
    } catch (error) {
      res.status(error.status || 400).json({ success: false, message: error.message });
    }
  },

  updateGoal: async (req, res) => {
    try {
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
        const err = new Error("Goal not found.");
        err.status = 404;
        throw err;
      }

      res.json({ success: true, data: reviewToClient(review, access.isAdmin || access.isHR) });
    } catch (error) {
      res.status(error.status || 400).json({ success: false, message: error.message });
    }
  },

  addPeerFeedback: async (req, res) => {
    try {
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
              addedAt: new Date(),
            },
          },
        },
        { new: true, upsert: true, runValidators: true },
      );

      res.status(201).json({
        success: true,
        data: reviewToClient(review, access.isAdmin || access.isHR),
      });
    } catch (error) {
      res.status(error.status || 400).json({ success: false, message: error.message });
    }
  },

  fileAppeal: async (req, res) => {
    try {
      const { cycle, employee, access } = await loadReviewContext(req);
      assertIsSelf(access, "file this appeal");

      const filter = { cycleKey: cycle.key, employee: employee._id };
      const existing = await PerformanceReviewModel.findOne(filter, "managerSubmittedDate appeal");

      if (!existing?.managerSubmittedDate) {
        const err = new Error(
          "You can only appeal once the manager review has been submitted.",
        );
        err.status = 400;
        throw err;
      }
      if (existing.appeal) {
        const err = new Error("An appeal has already been filed for this review.");
        err.status = 409;
        throw err;
      }
      if (!isWithinAppealWindow(existing.managerSubmittedDate)) {
        const err = new Error(
          `Appeals close ${APPEAL_WINDOW_DAYS} days after the manager review was submitted.`,
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
              filedBy: req.user.id,
            },
          },
        },
        { new: true, runValidators: true },
      );

      if (!review) {
        const err = new Error("An appeal has already been filed for this review.");
        err.status = 409;
        throw err;
      }

      await logAction(req, {
        action: "created",
        resource: "performance",
        resourceId: review._id,
        label: `Appeal — ${employee.name} (${cycle.key})`,
      });

      await notifyHR({
        title: "Performance appeal filed",
        message: `${employee.name} appealed their ${cycle.label} manager rating.`,
        category: "performance",
        link: REVIEW_LINK,
        linkLabel: REVIEW_LINK_LABEL,
      });

      res.status(201).json({
        success: true,
        data: reviewToClient(review, access.isAdmin || access.isHR),
      });
    } catch (error) {
      res.status(error.status || 400).json({ success: false, message: error.message });
    }
  },

  resolveAppeal: async (req, res) => {
    try {
      const { cycle, employee, access } = await loadReviewContext(req);

      const filter = { cycleKey: cycle.key, employee: employee._id };
      const existing = await PerformanceReviewModel.findOne(filter, "appeal managerRating");

      if (!existing?.appeal) {
        const err = new Error("No appeal has been filed for this review.");
        err.status = 404;
        throw err;
      }
      if (existing.appeal.status !== "Pending") {
        const err = new Error("This appeal has already been resolved.");
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
        "appeal.resolvedDate": new Date(),
      };
      if (adjusted) update.managerRating = resolvedRating;

      const review = await PerformanceReviewModel.findOneAndUpdate(
        { ...filter, "appeal.status": "Pending" },
        { $set: update },
        { new: true, runValidators: true },
      );

      if (!review) {
        const err = new Error("This appeal has already been resolved.");
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
          : undefined,
      });

      const employeeUser = await findUserForEmployee(employee);
      if (employeeUser) {
        await notifyUsers([employeeUser._id], {
          title: "Performance appeal resolved",
          message: `Your ${cycle.label} appeal was ${req.body.resolution.toLowerCase()}.`,
        });
      }

      res.json({ success: true, data: reviewToClient(review, access.isAdmin || access.isHR) });
    } catch (error) {
      res.status(error.status || 400).json({ success: false, message: error.message });
    }
  },
};

export default performanceController;
