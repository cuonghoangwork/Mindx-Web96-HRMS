import { Router } from "express";
import candidateController from "../controller/candidateController.js";
import { verifyToken, authorize } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const router = Router();

router.get("/", verifyToken, candidateController.getAll);
router.get("/:id", verifyToken, candidateController.getDetail);
router.post("/", verifyToken, authorize("ADMIN", "MANAGER"), validate.candidate.create, candidateController.create);
router.put("/:id", verifyToken, authorize("ADMIN", "MANAGER"), validate.candidate.update, candidateController.update);
router.delete("/:id", verifyToken, authorize("ADMIN", "MANAGER"), candidateController.remove);

export default router;
