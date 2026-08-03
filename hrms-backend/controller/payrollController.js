import PayrollPeriodModel, { PAYROLL_PERIOD_STATUSES } from "../model/PayrollPeriod.js";
import PayslipModel from "../model/Payslip.js";
import EmployeeModel from "../model/Employee.js";
import AttendanceModel from "../model/Attendance.js";
import LeaveRequestModel from "../model/LeaveRequest.js";
import HolidayModel from "../model/Holiday.js";
import {
  DEFAULT_FX_RATE_VND_PER_USD,
  autoDeductionVnd,
  computePayslip,
  seedBaseSalaryVnd,
  standardWorkingDaysInMonth,
} from "../utils/payrollEngine.js";
import {
  collectAbsentKeys,
  collectLeaveKeys,
  collectOnLeaveCoverageKeys,
  groupByEmployee,
  holidayKeySet,
  monthQueryWindowUtc,
  periodEndUtc,
} from "../utils/payrollPeriod.js";
import { logAction } from "../utils/auditLog.js";
import { notifyHR } from "./notificationController.js";
import NotificationModel from "../model/Notification.js";

const PAYABLE_EMPLOYEE_STATUSES = ["active", "on-leave"];

const CONTRACT_TYPE_LABELS = {
  "full-time": "Full-time",
  "part-time": "Part-time",
  contract: "Contract",
  intern: "Intern",
};

const providedVnd = (value) => value !== undefined && value !== null && value !== "";

const periodLabel = (p) => `${p.year}-${String(p.month).padStart(2, "0")}`;

function periodToClient(doc, totals) {
  if (!doc) return doc;
  const o = typeof doc.toObject === "function" ? doc.toObject() : doc;
  const t = totals ?? {};
  return {
    id: String(o._id),
    year: o.year,
    month: o.month,
    label: periodLabel(o),
    fxRate: o.fxRate,
    standardWorkingDays: o.standardWorkingDays,
    status: o.status,
    note: o.note ?? "",
    editable: o.status === "draft",
    payslipCount: t.count ?? 0,
    totals: {
      baseSalary: t.baseSalary ?? 0,
      bonus: t.bonus ?? 0,
      allowance: t.allowance ?? 0,
      deduction: t.deduction ?? 0,
      grossPay: t.grossPay ?? 0,
      insuranceTotal: t.insuranceTotal ?? 0,
      pit: t.pit ?? 0,
      netPay: t.netPay ?? 0,
    },
    createdBy: o.createdBy ? String(o.createdBy._id ?? o.createdBy) : null,
    approvedBy: o.approvedBy ? String(o.approvedBy._id ?? o.approvedBy) : null,
    approvedAt: o.approvedAt ?? null,
    paidBy: o.paidBy ? String(o.paidBy._id ?? o.paidBy) : null,
    paidAt: o.paidAt ?? null,
    createdAt: o.createdAt,
  };
}

function payslipToClient(doc, period) {
  if (!doc) return doc;
  const o = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return {
    id: String(o._id),
    periodId: o.period ? String(o.period._id ?? o.period) : null,
    periodLabel: period ? periodLabel(period) : null,
    periodStatus: period ? period.status : null,
    fxRate: period ? period.fxRate : null,
    editable: period ? period.status === "draft" : false,
    employeeId: o.employee ? String(o.employee._id ?? o.employee) : null,
    employeeCode: o.employeeCode ?? "",
    employeeName: o.employeeName ?? "",
    departmentName: o.departmentName ?? null,
    designation: o.designation ?? null,
    type: CONTRACT_TYPE_LABELS[o.contractType] ?? o.contractType ?? null,
    annualSalaryUsd: o.annualSalaryUsd ?? 0,
    baseSalary: o.baseSalary ?? 0,
    bonus: o.bonus ?? 0,
    allowance: o.allowance ?? 0,
    deduction: o.deduction ?? 0,
    unpaidLeaveDays: o.unpaidLeaveDays ?? 0,
    absentDays: o.absentDays ?? 0,
    autoDeduction: o.autoDeduction ?? 0,
    deductionOverridden: Boolean(o.deductionOverridden),
    grossPay: o.grossPay ?? 0,
    insuranceBase: o.insuranceBase ?? 0,
    bhxh: o.bhxh ?? 0,
    bhyt: o.bhyt ?? 0,
    bhtn: o.bhtn ?? 0,
    insuranceTotal: o.insuranceTotal ?? 0,
    taxableIncome: o.taxableIncome ?? 0,
    pit: o.pit ?? 0,
    netPay: o.netPay ?? 0,
  };
}

async function totalsByPeriod(periodIds) {
  if (!periodIds.length) return new Map();
  const rows = await PayslipModel.aggregate([
    { $match: { period: { $in: periodIds } } },
    {
      $group: {
        _id: "$period",
        count: { $sum: 1 },
        baseSalary: { $sum: "$baseSalary" },
        bonus: { $sum: "$bonus" },
        allowance: { $sum: "$allowance" },
        deduction: { $sum: "$deduction" },
        grossPay: { $sum: "$grossPay" },
        insuranceTotal: { $sum: "$insuranceTotal" },
        pit: { $sum: "$pit" },
        netPay: { $sum: "$netPay" },
      },
    },
  ]);
  return new Map(rows.map((r) => [String(r._id), r]));
}

async function loadMonthDayCounts(year, month) {
  const { lo, hi } = monthQueryWindowUtc(year, month);

  const [leaves, absences, onLeaveRows, holidays] = await Promise.all([
    LeaveRequestModel.find(
      { status: "approved", startDate: { $lte: hi }, endDate: { $gte: lo } },
      "employee startDate endDate type",
    ),
    AttendanceModel.find({ status: "absent", date: { $gte: lo, $lte: hi } }, "employee date"),
    AttendanceModel.find({ status: "on-leave", date: { $gte: lo, $lte: hi } }, "employee date"),
    HolidayModel.find({ date: { $gte: lo, $lte: hi } }, "date"),
  ]);

  const holidayKeys = holidayKeySet(holidays);
  const leavesByEmp = groupByEmployee(leaves);
  const absencesByEmp = groupByEmployee(absences);
  const onLeaveByEmp = groupByEmployee(onLeaveRows);

  return (employeeId) => {
    const id = String(employeeId);
    const rows = leavesByEmp.get(id) ?? [];

    const unpaidSet = collectLeaveKeys(
      rows.filter((r) => r.type === "unpaid"),
      year,
      month,
      holidayKeys,
    );

    const leaveCovered = collectLeaveKeys(rows, year, month, holidayKeys);
    for (const key of collectOnLeaveCoverageKeys(onLeaveByEmp.get(id) ?? [], year, month)) {
      leaveCovered.add(key);
    }

    const absentSet = collectAbsentKeys(absencesByEmp.get(id) ?? [], year, month, leaveCovered);

    return { unpaidLeaveDays: unpaidSet.size, absentDays: absentSet.size };
  };
}

async function buildPayslipRows(period) {
  const employees = await EmployeeModel.find(
    {
      status: { $in: PAYABLE_EMPLOYEE_STATUSES },
      createdAt: { $lte: periodEndUtc(period.year, period.month) },
    },
    "employeeId name department designation contractType annualSalary",
  ).populate("department", "name");

  if (!employees.length) return [];

  const dayCountsFor = await loadMonthDayCounts(period.year, period.month);

  return employees.map((emp) => {
    const baseSalary = seedBaseSalaryVnd(emp.annualSalary, period.fxRate);
    const { unpaidLeaveDays, absentDays } = dayCountsFor(emp._id);
    const autoDeduction = autoDeductionVnd({
      baseSalary,
      bonus: 0,
      allowance: 0,
      unpaidLeaveDays,
      absentDays,
      standardWorkingDays: period.standardWorkingDays,
    });

    return {
      period: period._id,
      employee: emp._id,
      employeeCode: emp.employeeId ?? "",
      employeeName: emp.name ?? "",
      departmentId: emp.department?._id ?? null,
      departmentName: emp.department?.name ?? null,
      designation: emp.designation ?? null,
      contractType: emp.contractType ?? null,
      annualSalaryUsd: emp.annualSalary ?? 0,
      unpaidLeaveDays,
      absentDays,
      autoDeduction,
      deductionOverridden: false,
      ...computePayslip({ baseSalary, bonus: 0, allowance: 0, deduction: autoDeduction }),
    };
  });
}

async function insertPayslips(rows) {
  if (!rows.length) return 0;
  try {
    const inserted = await PayslipModel.insertMany(rows, { ordered: false });
    return inserted.length;
  } catch (err) {
    const isDuplicateOnly =
      err?.code === 11000 ||
      (Array.isArray(err?.writeErrors) &&
        err.writeErrors.length > 0 &&
        err.writeErrors.every((w) => (w?.err?.code ?? w?.code) === 11000));
    if (!isDuplicateOnly) throw err;
    return err.result?.insertedCount ?? err.insertedDocs?.length ?? 0;
  }
}

const payrollController = {
  listPeriods: async (req, res) => {
    try {
      const { status, year } = req.query;
      const condition = {};
      if (status && status !== "all" && PAYROLL_PERIOD_STATUSES.includes(status)) {
        condition.status = status;
      }
      if (year) condition.year = Number(year);

      const periods = await PayrollPeriodModel.find(condition).sort({ year: -1, month: -1 });
      const totals = await totalsByPeriod(periods.map((p) => p._id));

      res.json({
        success: true,
        items: periods.map((p) => periodToClient(p, totals.get(String(p._id)))),
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  createPeriod: async (req, res) => {
    let created = null;
    try {
      const year = Number(req.body.year);
      const month = Number(req.body.month);
      const fxRate = providedVnd(req.body.fxRate)
        ? Number(req.body.fxRate)
        : DEFAULT_FX_RATE_VND_PER_USD;

      const existing = await PayrollPeriodModel.findOne({ year, month });
      if (existing) {
        return res.status(409).json({
          success: false,
          message: `A payroll period for ${year}-${String(month).padStart(2, "0")} already exists.`,
        });
      }

      created = await PayrollPeriodModel.create({
        year,
        month,
        fxRate,
        standardWorkingDays: standardWorkingDaysInMonth(year, month),
        note: req.body.note ?? "",
        createdBy: req.user.id,
      });

      const rows = await buildPayslipRows(created);
      if (!rows.length) {
        await PayrollPeriodModel.findByIdAndDelete(created._id);
        created = null;
        return res.status(400).json({
          success: false,
          message: "No payable employees exist for this period. Add employees first.",
        });
      }

      const generated = await insertPayslips(rows);
      const totals = await totalsByPeriod([created._id]);

      await logAction(req, {
        action: "created",
        resource: "payroll",
        resourceId: created._id,
        label: `Payroll ${periodLabel(created)}`,
      });

      notifyHR({
        title: "Payroll drafts generated",
        message: `${generated} draft payslip${generated === 1 ? "" : "s"} generated for ${periodLabel(created)}.`,
        category: "payroll",
        link: "/payroll",
        linkLabel: "Open payroll",
      });

      res.status(201).json({
        success: true,
        data: periodToClient(created, totals.get(String(created._id))),
        generated,
      });
    } catch (error) {
      if (created?._id) {
        await PayrollPeriodModel.findByIdAndDelete(created._id).catch(() => {});
        await PayslipModel.deleteMany({ period: created._id }).catch(() => {});
      }
      if (error?.code === 11000) {
        return res
          .status(409)
          .json({ success: false, message: "A payroll period for that month already exists." });
      }
      res.status(400).json({ success: false, message: error.message });
    }
  },

  regenerate: async (req, res) => {
    try {
      const period = await PayrollPeriodModel.findById(req.params.id);
      if (!period) {
        return res.status(404).json({ success: false, message: "Payroll period not found." });
      }
      if (period.status !== "draft") {
        return res.status(409).json({
          success: false,
          message: "Only a draft period can be regenerated.",
        });
      }

      await PayslipModel.deleteMany({ period: period._id });
      const rows = await buildPayslipRows(period);
      const generated = await insertPayslips(rows);
      const totals = await totalsByPeriod([period._id]);

      await logAction(req, {
        action: "updated",
        resource: "payroll",
        resourceId: period._id,
        label: `Payroll ${periodLabel(period)} regenerated`,
      });

      res.json({
        success: true,
        data: periodToClient(period, totals.get(String(period._id))),
        generated,
        warning: "Manual bonus, allowance and deduction edits for this period were discarded.",
      });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  },

  listPayslips: async (req, res) => {
    try {
      const period = await PayrollPeriodModel.findById(req.params.id);
      if (!period) {
        return res.status(404).json({ success: false, message: "Payroll period not found." });
      }
      const payslips = await PayslipModel.find({ period: period._id }).sort({ employeeName: 1 });
      const totals = await totalsByPeriod([period._id]);

      res.json({
        success: true,
        period: periodToClient(period, totals.get(String(period._id))),
        items: payslips.map((p) => payslipToClient(p, period)),
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  updatePayslip: async (req, res) => {
    try {
      const payslip = await PayslipModel.findById(req.params.id);
      if (!payslip) {
        return res.status(404).json({ success: false, message: "Payslip not found." });
      }
      const period = await PayrollPeriodModel.findById(payslip.period);
      if (!period) {
        return res.status(404).json({ success: false, message: "Payroll period not found." });
      }
      if (period.status !== "draft") {
        return res.status(409).json({
          success: false,
          message: "Payslips can only be edited while the pay period is a draft.",
        });
      }

      const body = req.body ?? {};
      const pick = (key) => (providedVnd(body[key]) ? Number(body[key]) : payslip[key]);
      const merged = {
        baseSalary: pick("baseSalary"),
        bonus: pick("bonus"),
        allowance: pick("allowance"),
        deduction: pick("deduction"),
      };

      if (merged.deduction > merged.baseSalary + merged.bonus + merged.allowance) {
        return res.status(400).json({
          success: false,
          message: "Deduction cannot exceed base salary plus bonus plus allowance.",
        });
      }

      payslip.autoDeduction = autoDeductionVnd({
        baseSalary: merged.baseSalary,
        bonus: merged.bonus,
        allowance: merged.allowance,
        unpaidLeaveDays: payslip.unpaidLeaveDays,
        absentDays: payslip.absentDays,
        standardWorkingDays: period.standardWorkingDays,
      });
      payslip.deductionOverridden = merged.deduction !== payslip.autoDeduction;
      Object.assign(payslip, computePayslip(merged));
      await payslip.save();

      await logAction(req, {
        action: "updated",
        resource: "payroll",
        resourceId: payslip._id,
        label: `${payslip.employeeName} — ${periodLabel(period)}`,
        changes: {
          fields: {
            from: null,
            to: Object.keys(body)
              .filter((k) => providedVnd(body[k]))
              .join(", "),
          },
        },
      });

      res.json({ success: true, data: payslipToClient(payslip, period) });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  },

  recomputeDeduction: async (req, res) => {
    try {
      const payslip = await PayslipModel.findById(req.params.id);
      if (!payslip) {
        return res.status(404).json({ success: false, message: "Payslip not found." });
      }
      const period = await PayrollPeriodModel.findById(payslip.period);
      if (!period) {
        return res.status(404).json({ success: false, message: "Payroll period not found." });
      }
      if (period.status !== "draft") {
        return res.status(409).json({
          success: false,
          message: "Payslips can only be edited while the pay period is a draft.",
        });
      }

      const dayCountsFor = await loadMonthDayCounts(period.year, period.month);
      const { unpaidLeaveDays, absentDays } = dayCountsFor(payslip.employee);

      const autoDeduction = autoDeductionVnd({
        baseSalary: payslip.baseSalary,
        bonus: payslip.bonus,
        allowance: payslip.allowance,
        unpaidLeaveDays,
        absentDays,
        standardWorkingDays: period.standardWorkingDays,
      });

      payslip.unpaidLeaveDays = unpaidLeaveDays;
      payslip.absentDays = absentDays;
      payslip.autoDeduction = autoDeduction;
      payslip.deductionOverridden = false;
      Object.assign(
        payslip,
        computePayslip({
          baseSalary: payslip.baseSalary,
          bonus: payslip.bonus,
          allowance: payslip.allowance,
          deduction: autoDeduction,
        }),
      );
      await payslip.save();

      res.json({ success: true, data: payslipToClient(payslip, period) });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  },

  setPeriodStatus: async (req, res) => {
    try {
      const { status } = req.body ?? {};
      if (!PAYROLL_PERIOD_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `status must be one of ${PAYROLL_PERIOD_STATUSES.join(", ")}.`,
        });
      }

      const period = await PayrollPeriodModel.findById(req.params.id);
      if (!period) {
        return res.status(404).json({ success: false, message: "Payroll period not found." });
      }

      const from = period.status;
      if (from === status) {
        return res
          .status(409)
          .json({ success: false, message: `This period is already ${status}.` });
      }
      if (from === "paid") {
        return res.status(409).json({
          success: false,
          message: "A paid period is closed and cannot change status.",
        });
      }
      if (from === "draft" && status === "paid") {
        return res
          .status(409)
          .json({ success: false, message: "Approve the period before marking it paid." });
      }
      if (from === "approved" && status === "draft" && req.user.role !== "ADMIN") {
        return res.status(403).json({
          success: false,
          message: "Only an Administrator can reopen an approved period.",
        });
      }

      if (from === "draft" && status === "approved") {
        const count = await PayslipModel.countDocuments({ period: period._id });
        if (!count) {
          return res
            .status(400)
            .json({ success: false, message: "Cannot approve a period with no payslips." });
        }
        period.approvedBy = req.user.id;
        period.approvedAt = new Date();
      }

      if (status === "paid") {
        period.paidBy = req.user.id;
        period.paidAt = new Date();
      }

      if (status === "draft") {
        period.approvedBy = null;
        period.approvedAt = null;
      }

      period.status = status;
      await period.save();

      await logAction(req, {
        action: "status_changed",
        resource: "payroll",
        resourceId: period._id,
        label: `Payroll ${periodLabel(period)} — ${from} to ${status}`,
      });

      if (status === "paid") {
        await NotificationModel.create({
          user: null,
          audience: "employees",
          category: "payroll",
          title: "Payroll paid",
          message: `${periodLabel(period)} payroll has been paid.`,
          isCustom: false,
        });
      }

      const totals = await totalsByPeriod([period._id]);
      res.json({ success: true, data: periodToClient(period, totals.get(String(period._id))) });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  },

  removePeriod: async (req, res) => {
    try {
      const period = await PayrollPeriodModel.findById(req.params.id);
      if (!period) {
        return res.status(404).json({ success: false, message: "Payroll period not found." });
      }
      if (period.status !== "draft") {
        return res
          .status(409)
          .json({ success: false, message: "Only a draft period can be deleted." });
      }

      await PayslipModel.deleteMany({ period: period._id });
      await PayrollPeriodModel.findByIdAndDelete(period._id);

      await logAction(req, {
        action: "deleted",
        resource: "payroll",
        resourceId: period._id,
        label: `Payroll ${periodLabel(period)}`,
      });

      res.json({ success: true, message: "Payroll period deleted." });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  },
};

export default payrollController;
