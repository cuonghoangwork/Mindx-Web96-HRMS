import { Router } from "express";
import employeeController from "../controller/employeeController.js";
import { verifyToken, authorize } from "../middleware/auth.js";
import { uploadImage, uploadPdf, handleUploadErrors } from "../middleware/upload.js";
import { validate } from "../middleware/validate.js";

const router = Router();

// All authenticated users can get the full list (EMPLOYEE sees all names/dept for display)
// and their own profile via /me.
router.get("/me", verifyToken, employeeController.getMyProfile);
router.get("/", verifyToken, employeeController.getAll);

// Detail: accessible to all authenticated users; controller enforces EMPLOYEE can only
// see their own profile.
router.get("/:id", verifyToken, employeeController.getDetail);

// Create / update / delete — HR (MANAGER) and ADMIN only
router.post(
  "/",
  verifyToken,
  authorize("ADMIN", "MANAGER"),
  validate.employee.create,
  employeeController.create,
);
router.put(
  "/:id",
  verifyToken,
  authorize("ADMIN", "MANAGER"),
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

// Contract PDF upload (task 1.4) — HR (MANAGER) and ADMIN only, unlike the
// avatar route above. Employees view their own contract read-only via
// GET /employees/me (contractUrl is already in employeeToClient's shape).
router.post(
  "/:id/contract",
  verifyToken,
  authorize("ADMIN", "MANAGER"),
  handleUploadErrors(uploadPdf.single("contract")),
  employeeController.uploadContract,
);

export default router;
