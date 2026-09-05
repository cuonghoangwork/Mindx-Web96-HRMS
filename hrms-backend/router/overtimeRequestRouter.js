import { Router } from "express";
import overtimeRequestController from "../controller/overtimeRequestController.js";
import { verifyToken, authorize } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const router = Router();

// Any authenticated user can check overtime balances. The controller scopes
// EMPLOYEE to their own and MANAGER to their own department; HR/ADMIN may
// pass ?employeeId= for anyone. Mounted before "/" so "balance" is not
// swallowed by a parameterised route.
router.get("/balance", verifyToken, overtimeRequestController.balance);

// MANAGER (own department) / HR / ADMIN — bulk assignment. Declared before
// POST "/" for the same reason.
router.post(
  "/assign",
  verifyToken,
  authorize("MANAGER", "HR", "ADMIN"),
  validate.overtimeRequest.assign,
  overtimeRequestController.assign,
);

// Any authenticated user can apply for themselves.
router.post("/", verifyToken, validate.overtimeRequest.create, overtimeRequestController.create);

// Any authenticated user can list; the shared handler scopes EMPLOYEE to
// their own requests and MANAGER to their own department.
router.get("/", verifyToken, overtimeRequestController.list);

// MANAGER (own department, gated further by the approveOvertimeRequests
// capability) / HR / ADMIN approve or reject.
router.patch(
  "/:id/review",
  verifyToken,
  authorize("MANAGER", "HR", "ADMIN"),
  overtimeRequestController.review,
);

// The owner withdraws their own pending request before the cutoff.
router.delete("/:id", verifyToken, overtimeRequestController.remove);

export default router;
