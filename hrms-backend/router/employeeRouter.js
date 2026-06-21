import { Router } from "express";
import employeeController from "../controller/employeeController.js";
import { verifyToken, authorize } from "../middleware/auth.js";
import { uploadImage } from "../middleware/upload.js";

const router = Router();

router.get("/", verifyToken, employeeController.getAll);
router.get("/:id", verifyToken, employeeController.getDetail);
router.post("/", verifyToken, authorize("ADMIN", "MANAGER"), employeeController.create);
router.put("/:id", verifyToken, authorize("ADMIN", "MANAGER"), employeeController.update);
router.post(
  "/:id/avatar",
  verifyToken,
  authorize("ADMIN", "MANAGER"),
  uploadImage.single("avatar"),
  employeeController.uploadAvatar,
);
router.delete("/:id", verifyToken, authorize("ADMIN"), employeeController.remove);

export default router;
