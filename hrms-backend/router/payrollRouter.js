import { Router } from "express";
import payrollController from "../controller/payrollController.js";
import { verifyToken, authorize } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const router = Router();

const hr = [verifyToken, authorize("MANAGER", "ADMIN")];

router.get("/periods", ...hr, payrollController.listPeriods);
router.post("/periods", ...hr, validate.payroll.createPeriod, payrollController.createPeriod);
router.post("/periods/:id/regenerate", ...hr, payrollController.regenerate);
router.get("/periods/:id/payslips", ...hr, payrollController.listPayslips);
router.patch("/periods/:id/status", ...hr, payrollController.setPeriodStatus);
router.delete("/periods/:id", verifyToken, authorize("ADMIN"), payrollController.removePeriod);

router.patch(
  "/payslips/:id",
  ...hr,
  validate.payroll.updatePayslip,
  payrollController.updatePayslip,
);
router.post("/payslips/:id/recompute-deduction", ...hr, payrollController.recomputeDeduction);

export default router;
