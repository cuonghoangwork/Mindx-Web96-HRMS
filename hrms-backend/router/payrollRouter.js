import { Router } from "express";
import payrollController from "../controller/payrollController.js";
import { verifyToken, authorize } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const router = Router();

// Writes are HR/ADMIN only.
const hr = [verifyToken, authorize("HR", "ADMIN")];

// Reads: MANAGER too, scoped to their department by the controller.
const managerRead = [verifyToken, authorize("MANAGER", "HR", "ADMIN")];

// Own payslips, resolved from the caller's JWT-linked Employee.
router.get("/my-payslips", verifyToken, payrollController.myPayslips);

router.get("/periods", ...managerRead, payrollController.listPeriods);
router.post("/periods", ...hr, validate.payroll.createPeriod, payrollController.createPeriod);
router.post("/periods/:id/regenerate", ...hr, payrollController.regenerate);
router.get("/periods/:id/payslips", ...managerRead, payrollController.listPayslips);
router.patch("/periods/:id/status", ...hr, payrollController.setPeriodStatus);
router.delete("/periods/:id", verifyToken, authorize("ADMIN"), payrollController.removePeriod);

// HTTP trigger for the start-of-month draft job (D11) — ADMIN only.
router.post(
  "/generate-monthly-draft",
  verifyToken,
  authorize("ADMIN"),
  payrollController.generateMonthlyDraft,
);

router.post("/run-monthly", verifyToken, authorize("ADMIN"), payrollController.runMonthly);

// The month's FX snapshot for the "New period" form.
router.get("/fx-rate/:year/:month", ...hr, payrollController.previewFxRate);

router.patch(
  "/payslips/:id",
  ...hr,
  validate.payroll.updatePayslip,
  payrollController.updatePayslip,
);
router.post("/payslips/:id/recompute-deduction", ...hr, payrollController.recomputeDeduction);

export default router;
