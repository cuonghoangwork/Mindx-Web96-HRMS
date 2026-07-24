import { Router } from "express";
import leaveRequestController from "../controller/leaveRequestController.js";
import { verifyToken, authorize } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const router = Router();

// Any authenticated user can apply for leave and check their own balance
// (HR/Admin can also pass ?employeeId= on /balance to check someone else's).
router.get("/balance", verifyToken, leaveRequestController.balance);
router.post("/", verifyToken, validate.leaveRequest.create, leaveRequestController.create);

// Any authenticated user can list; controller scopes EMPLOYEE to their own.
router.get("/", verifyToken, leaveRequestController.list);

// HR/Admin only to approve/reject.
router.patch(
  "/:id/review",
  verifyToken,
  authorize("MANAGER", "ADMIN"),
  leaveRequestController.review,
);

export default router;
