import { Router } from "express";
import performanceController from "../controller/performanceController.js";
import { verifyToken, authorize } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const router = Router();

const admin = [verifyToken, authorize("ADMIN")];
const hr = [verifyToken, authorize("HR", "ADMIN")];
const managerTier = [verifyToken, authorize("MANAGER", "HR", "ADMIN")];

router.get("/meta", verifyToken, performanceController.meta);

router.get("/cycles", verifyToken, performanceController.listCycles);
router.post(
  "/cycles",
  ...admin,
  validate.performance.createCycle,
  performanceController.createCycle,
);
router.patch(
  "/cycles/:key",
  ...admin,
  validate.performance.cycleStatus,
  performanceController.updateCycleStatus,
);
router.get("/cycles/:key/roster", verifyToken, performanceController.getRoster);
router.get("/cycles/:key/analytics", verifyToken, performanceController.getAnalytics);

router.get("/reviews/:cycleKey/:employeeId", verifyToken, performanceController.getReview);

router.patch(
  "/reviews/:cycleKey/:employeeId/self",
  verifyToken,
  validate.performance.selfReview,
  performanceController.submitSelf,
);

router.patch(
  "/reviews/:cycleKey/:employeeId/manager",
  ...managerTier,
  validate.performance.managerReview,
  performanceController.submitManager,
);

router.patch(
  "/reviews/:cycleKey/:employeeId/competencies",
  verifyToken,
  validate.performance.competency,
  performanceController.setCompetency,
);

router.post(
  "/reviews/:cycleKey/:employeeId/goals",
  verifyToken,
  validate.performance.goalCreate,
  performanceController.addGoal,
);

router.patch(
  "/reviews/:cycleKey/:employeeId/goals/:goalId",
  verifyToken,
  validate.performance.goalUpdate,
  performanceController.updateGoal,
);

router.post(
  "/reviews/:cycleKey/:employeeId/peer-feedback",
  verifyToken,
  validate.performance.peerFeedback,
  performanceController.addPeerFeedback,
);

router.post(
  "/reviews/:cycleKey/:employeeId/appeal",
  verifyToken,
  validate.performance.appealCreate,
  performanceController.fileAppeal,
);

router.patch(
  "/reviews/:cycleKey/:employeeId/appeal",
  ...hr,
  validate.performance.appealResolve,
  performanceController.resolveAppeal,
);

export default router;
