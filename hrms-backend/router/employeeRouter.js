import { Router } from "express";
import employeeController from "../controller/employeeController.js";
import { verifyToken, authorize } from "../middleware/auth.js";
import { uploadImage, uploadPdf, uploadDocuments, handleUploadErrors } from "../middleware/upload.js";
import { validate } from "../middleware/validate.js";

const router = Router();

// All authenticated users can get the full list (EMPLOYEE sees all names/dept for display)
// and their own profile via /me.
router.get("/me", verifyToken, employeeController.getMyProfile);
router.get("/", verifyToken, employeeController.getAll);

// Detail: accessible to all authenticated users; controller enforces EMPLOYEE can only
// see their own profile.
router.get("/:id", verifyToken, employeeController.getDetail);

// Create — HR (company-wide)/ADMIN only. Matches the demo's role model:
// MANAGER has no "Add Employee" capability anywhere (no nav item, no
// backend route) — only update/manage employees already in their own
// department (see utils/managerScope.js).
router.post(
  "/",
  verifyToken,
  authorize("ADMIN", "HR"),
  validate.employee.create,
  employeeController.create,
);

// Update / delete — MANAGER (own department), HR (company-wide) and ADMIN
// for update; delete stays ADMIN-only.
router.put(
  "/:id",
  verifyToken,
  authorize("ADMIN", "MANAGER", "HR"),
  validate.employee.update,
  employeeController.update,
);
router.delete("/:id", verifyToken, authorize("ADMIN"), employeeController.remove);

// Avatar upload: all authenticated users can upload (controller restricts EMPLOYEE to own avatar)
// handleUploadErrors wraps multer so a bad mimetype/oversized file resolves to a clean
// 400 (err.message) instead of an uncaught 500 from the app's generic error handler.
router.post(
  "/:id/avatar",
  verifyToken,
  handleUploadErrors(uploadImage.single("avatar")),
  employeeController.uploadAvatar,
);

// Contract PDF upload (task 1.4) — MANAGER (own department)/HR/ADMIN only,
// unlike the avatar route above. Employees view their own contract
// read-only via GET /employees/me (contractUrl is already in
// employeeToClient's shape).
router.post(
  "/:id/contract",
  verifyToken,
  authorize("ADMIN", "MANAGER", "HR"),
  handleUploadErrors(uploadPdf.single("contract")),
  employeeController.uploadContract,
);

// Multi-document upload (Solo Gaps Milestone 1) — offer letters/ID
// scans/other, additive alongside the single-contract flow above. Same
// gating as the contract route (MANAGER own-department, enforced in the
// controller).
router.post(
  "/:id/documents",
  verifyToken,
  authorize("ADMIN", "MANAGER", "HR"),
  handleUploadErrors(uploadDocuments.array("documents", 5)),
  employeeController.uploadDocuments,
);
router.delete(
  "/:id/documents/:docId",
  verifyToken,
  authorize("ADMIN", "MANAGER", "HR"),
  employeeController.removeDocument,
);

export default router;
