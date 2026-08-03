export const BASE_SALARY_VND = 2_340_000;
export const BHXH_BHYT_CAP_VND = BASE_SALARY_VND * 20;

export const REGION_I_MIN_WAGE_VND = 4_960_000;
export const BHTN_CAP_VND = REGION_I_MIN_WAGE_VND * 20;

export const BHXH_RATE = 0.08;
export const BHYT_RATE = 0.015;
export const BHTN_RATE = 0.01;

export const PERSONAL_DEDUCTION_VND = 11_000_000;

export const PIT_BRACKETS_VND = [
  { upTo: 5_000_000, rate: 0.05 },
  { upTo: 10_000_000, rate: 0.1 },
  { upTo: 18_000_000, rate: 0.15 },
  { upTo: 32_000_000, rate: 0.2 },
  { upTo: 52_000_000, rate: 0.25 },
  { upTo: 80_000_000, rate: 0.3 },
  { upTo: Infinity, rate: 0.35 },
];

export const DEFAULT_FX_RATE_VND_PER_USD = 25_000;

function toVnd(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n);
}

export function calcProgressivePitVnd(taxableIncomeVnd) {
  const income = Number(taxableIncomeVnd);
  if (!Number.isFinite(income) || income <= 0) return 0;
  let tax = 0;
  let lowerBound = 0;
  for (const { upTo, rate } of PIT_BRACKETS_VND) {
    if (income <= lowerBound) break;
    tax += (Math.min(income, upTo) - lowerBound) * rate;
    lowerBound = upTo;
  }
  return tax;
}

export function computePayslip({ baseSalary = 0, bonus = 0, allowance = 0, deduction = 0 } = {}) {
  const base = toVnd(baseSalary);
  const bon = toVnd(bonus);
  const allo = toVnd(allowance);
  const ded = toVnd(deduction);

  const grossPay = Math.max(0, base + bon + allo - ded);
  const insuranceBase = Math.min(base + allo, grossPay);

  const bhxhBase = Math.min(insuranceBase, BHXH_BHYT_CAP_VND);
  const bhtnBase = Math.min(insuranceBase, BHTN_CAP_VND);

  const bhxh = Math.round(bhxhBase * BHXH_RATE);
  const bhyt = Math.round(bhxhBase * BHYT_RATE);
  const bhtn = Math.round(bhtnBase * BHTN_RATE);
  const insuranceTotal = bhxh + bhyt + bhtn;

  const taxableIncome = Math.max(0, grossPay - insuranceTotal - PERSONAL_DEDUCTION_VND);
  const pit = Math.round(calcProgressivePitVnd(taxableIncome));

  const netPay = grossPay - insuranceTotal - pit;

  return {
    baseSalary: base,
    bonus: bon,
    allowance: allo,
    deduction: ded,
    grossPay,
    insuranceBase,
    bhxh,
    bhyt,
    bhtn,
    insuranceTotal,
    taxableIncome,
    pit,
    netPay,
  };
}

export function seedBaseSalaryVnd(annualSalaryUsd, fxRate) {
  const usd = Number(annualSalaryUsd);
  const rate = Number(fxRate);
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return Math.round((usd / 12) * rate);
}

export function standardWorkingDaysInMonth(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
    throw new Error(`Invalid year/month: ${year}-${month}`);
  }
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d += 1) {
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (dow !== 0 && dow !== 6) count += 1;
  }
  return count;
}

export function autoDeductionVnd({
  baseSalary = 0,
  bonus = 0,
  allowance = 0,
  unpaidLeaveDays = 0,
  absentDays = 0,
  standardWorkingDays,
} = {}) {
  const days = Number(standardWorkingDays);
  if (!Number.isFinite(days) || days <= 0) return 0;

  const unpaid = Math.max(0, Number(unpaidLeaveDays) || 0);
  const absent = Math.max(0, Number(absentDays) || 0);
  const chargeableDays = unpaid + absent;
  if (chargeableDays <= 0) return 0;

  const base = toVnd(baseSalary);
  const bon = toVnd(bonus);
  const allo = toVnd(allowance);

  const dailyRate = Math.round((base + allo) / days);
  return Math.min(dailyRate * chargeableDays, base + bon + allo);
}
