import { Router } from "express";
import profileEditRequestController from "../controller/profileEditRequestController.js";
import { verifyToken, authorize } from "../middleware/auth.js";

const router = Router();

// Any authenticated user can submit a request (only their own is accepted)
router.post("/", verifyToken, profileEditRequestController.create);

// Any authenticated user can list; controller filters by role
router.get("/", verifyToken, profileEditRequestController.list);

// MANAGER (own department)/HR/ADMIN to approve/reject
router.patch(
  "/:id/review",
  verifyToken,
  authorize("MANAGER", "HR", "ADMIN"),
  profileEditRequestController.review,
);

export default router;
