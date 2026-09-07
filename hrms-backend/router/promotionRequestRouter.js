import { Router } from "express";
import promotionRequestController from "../controller/promotionRequestController.js";
import { verifyToken, authorize } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const router = Router();

router.get("/", verifyToken, authorize("MANAGER", "HR", "ADMIN"), promotionRequestController.list);

router.post(
  "/",
  verifyToken,
  authorize("MANAGER", "HR", "ADMIN"),
  validate.promotionRequest.create,
  promotionRequestController.create,
);

router.patch(
  "/:id/review",
  verifyToken,
  authorize("ADMIN"),
  promotionRequestController.review,
);


// Manual triggers for the two scheduled sweeps that create pending
// PromotionRequests (jobs/checkPromotionEligibility.js and
// jobs/annualSalaryRaise.js). ADMIN-only, the same tier as the close-day and
// payroll job triggers they mirror.
router.post(
  "/check-eligibility",
  verifyToken,
  authorize("ADMIN"),
  promotionRequestController.checkEligibility,
);

router.post(
  "/annual-raise",
  verifyToken,
  authorize("ADMIN"),
  promotionRequestController.annualRaise,
);

export default router;
