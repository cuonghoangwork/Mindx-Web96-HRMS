import { Router } from "express";
import overtimeRequestController from "../controller/overtimeRequestController.js";
import { verifyToken, authorize } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const router = Router();

// Scoped by the controller (EMPLOYEE: own, MANAGER: department). Before "/:id".
router.get("/balance", verifyToken, overtimeRequestController.balance);

// Bulk assignment — MANAGER (own department)/HR/ADMIN.
router.post(
  "/assign",
  verifyToken,
  authorize("MANAGER", "HR", "ADMIN"),
  validate.overtimeRequest.assign,
  overtimeRequestController.assign,
);

router.post("/", verifyToken, validate.overtimeRequest.create, overtimeRequestController.create);

router.get("/", verifyToken, overtimeRequestController.list);

// MANAGER needs the approveOvertimeRequests capability as well.
router.patch(
  "/:id/review",
  verifyToken,
  authorize("MANAGER", "HR", "ADMIN"),
  overtimeRequestController.review,
);

router.delete("/:id", verifyToken, overtimeRequestController.remove);

export default router;
