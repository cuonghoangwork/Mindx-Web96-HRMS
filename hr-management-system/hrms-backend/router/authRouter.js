import { Router } from "express";
import authController from "../controller/authController.js";
import { verifyToken } from "../middleware/auth.js";

const router = Router();

router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/refresh-token", authController.refreshToken);
router.post("/logout", verifyToken, authController.logout);
router.get("/me", verifyToken, authController.me);

export default router;
