import { Router } from "express";
import candidateController from "../controller/candidateController.js";
import { verifyToken, authorize } from "../middleware/auth.js";
import { uploadPdf, handleUploadErrors } from "../middleware/upload.js";
import { validate } from "../middleware/validate.js";

const router = Router();

router.get("/", verifyToken, candidateController.getAll);
router.get("/:id", verifyToken, candidateController.getDetail);
router.post("/", verifyToken, authorize("ADMIN", "HR"), validate.candidate.create, candidateController.create);
router.put("/:id", verifyToken, authorize("ADMIN", "HR"), validate.candidate.update, candidateController.update);

// CV upload — HR/Admin only, same uploadPdf config as contracts.
router.post(
  "/:id/cv",
  verifyToken,
  authorize("ADMIN", "HR"),
  handleUploadErrors(uploadPdf.single("cv")),
  candidateController.uploadCv,
);

router.delete("/:id", verifyToken, authorize("ADMIN", "HR"), candidateController.remove);

export default router;
