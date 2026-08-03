import { Router } from "express";
import promotionRequestController from "../controller/promotionRequestController.js";
import { verifyToken, authorize } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const router = Router();

router.get("/", verifyToken, authorize("MANAGER", "ADMIN"), promotionRequestController.list);

router.post(
  "/",
  verifyToken,
  authorize("MANAGER", "ADMIN"),
  validate.promotionRequest.create,
  promotionRequestController.create,
);

router.patch(
  "/:id/review",
  verifyToken,
  authorize("ADMIN"),
  promotionRequestController.review,
);

export default router;
