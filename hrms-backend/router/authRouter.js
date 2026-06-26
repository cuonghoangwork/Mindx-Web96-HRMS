import { Router } from "express";
import authController from "../controller/authController.js";
import { verifyToken } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const router = Router();

router.post("/register", validate.auth.register, authController.register);
router.post("/login", validate.auth.login, authController.login);
router.post("/refresh-token", authController.refreshToken);
router.post("/logout", verifyToken, authController.logout);
router.get("/me", verifyToken, authController.me);

export default router;
