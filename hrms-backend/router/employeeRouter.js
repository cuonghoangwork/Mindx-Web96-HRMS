import { Router } from "express";
import employeeController from "../controller/employeeController.js";
import { verifyToken, authorize } from "../middleware/auth.js";
import { uploadImage, uploadPdf, uploadDocuments, handleUploadErrors } from "../middleware/upload.js";
import { validate } from "../middleware/validate.js";

const router = Router();

// The directory read is company-wide for every role.
router.get("/me", verifyToken, employeeController.getMyProfile);
router.get("/", verifyToken, employeeController.getAll);

// Controller restricts EMPLOYEE to their own profile.
router.get("/:id", verifyToken, employeeController.getDetail);

// Create is HR/ADMIN only; MANAGER manages existing employees in their own department (D12).
router.post(
  "/",
  verifyToken,
  authorize("ADMIN", "HR"),
  validate.employee.create,
  employeeController.create,
);

// Update: MANAGER (own department)/HR/ADMIN. Delete: ADMIN only.
router.put(
  "/:id",
  verifyToken,
  authorize("ADMIN", "MANAGER", "HR"),
  validate.employee.update,
  employeeController.update,
);
router.delete("/:id", verifyToken, authorize("ADMIN"), employeeController.remove);

// Any authenticated user; the controller restricts EMPLOYEE to their own avatar.
router.post(
  "/:id/avatar",
  verifyToken,
  handleUploadErrors(uploadImage.single("avatar")),
  employeeController.uploadAvatar,
);

// Contract PDF — MANAGER (own department)/HR/ADMIN; employees read it via /me.
router.post(
  "/:id/contract",
  verifyToken,
  authorize("ADMIN", "MANAGER", "HR"),
  handleUploadErrors(uploadPdf.single("contract")),
  employeeController.uploadContract,
);

// Other documents — same gating as the contract route.
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
