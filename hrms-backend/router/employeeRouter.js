import { Router } from "express";
import employeeController from "../controller/employeeController.js";
import { verifyToken, authorize } from "../middleware/auth.js";
import { uploadImage } from "../middleware/upload.js";
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
router.post(
  "/:id/avatar",
  verifyToken,
  uploadImage.single("avatar"),
  employeeController.uploadAvatar,
);

export default router;
