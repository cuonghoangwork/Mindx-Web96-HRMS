import { Router } from "express";
import noShowReviewController from "../controller/noShowReviewController.js";
import { verifyToken, authorize } from "../middleware/auth.js";

const router = Router();

// MANAGER (own department)/HR/ADMIN — this queue never has an
// employee-facing "my requests" view (see controller header: every entry
// is systemGenerated, nothing to submit).
router.get("/", verifyToken, authorize("MANAGER", "HR", "ADMIN"), noShowReviewController.list);

router.patch(
  "/:id/review",
  verifyToken,
  authorize("ADMIN"),
  noShowReviewController.review,
);

export default router;
