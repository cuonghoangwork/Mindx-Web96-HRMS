/**
 * validate.js — Server-side validation middleware
 *
 * Mirrors the frontend's client-side rules so the API enforces
 * the same constraints regardless of which client calls it.
 *
 * Usage:
 *   router.post("/", verifyToken, validate.employee.create, employeeController.create)
 *   router.put("/:id", verifyToken, validate.employee.update, employeeController.update)
 */

/* ─── Shared helpers ─── */
const EMAIL_RE = /\S+@\S+\.\S+/;
const EMPLOYEE_ID_RE = /^[A-Z]{2,4}\d{2,6}$/i; // matches AddEmployee.jsx RULES.employeeId

const VALID_STATUSES = ["Active", "On Leave", "Terminated"];
const VALID_TYPES    = ["Full-time", "Part-time", "Contract", "Intern"];
const VALID_GENDERS  = ["Male", "Female", "Other"];
const VALID_JOB_STATUSES     = ["Open", "Filled", "Closed"];
const VALID_CANDIDATE_STAGES = ["Applied", "Screening", "Interview", "Offer", "Hired", "Rejected"];
const VALID_HOLIDAY_TYPES    = ["Public", "Company", "Optional"];

/**
 * Build a middleware that runs a list of check functions against req.body.
 * Each check returns an error string or null.
 */
function makeValidator(checks) {
  return (req, res, next) => {
    const errors = [];
    for (const check of checks) {
      const msg = check(req.body);
      if (msg) errors.push(msg);
    }
    if (errors.length) {
      return res.status(400).json({ success: false, message: errors.join("; ") });
    }
    next();
  };
}

/* ─── Field-level checks ─── */
const required = (field, label) => (body) =>
  !body[field] || (typeof body[field] === "string" && !body[field].trim())
    ? `${label} is required.`
    : null;

const minLength = (field, label, min) => (body) =>
  body[field] && body[field].trim().length < min
    ? `${label} must be at least ${min} characters.`
    : null;

const maxLength = (field, label, max) => (body) =>
  body[field] && body[field].trim().length > max
    ? `${label} must be at most ${max} characters.`
    : null;

const isEmail = (field, label) => (body) =>
  body[field] && !EMAIL_RE.test(body[field])
    ? `${label} must be a valid email address.`
    : null;

const isOneOf = (field, label, allowed) => (body) =>
  body[field] && !allowed.includes(body[field])
    ? `${label} must be one of: ${allowed.join(", ")}.`
    : null;

const isPositiveNumber = (field, label) => (body) =>
  body[field] !== undefined && body[field] !== "" && (isNaN(Number(body[field])) || Number(body[field]) <= 0)
    ? `${label} must be a positive number.`
    : null;

const isDateString = (field, label) => (body) => {
  if (!body[field]) return null;
  const d = new Date(body[field]);
  return isNaN(d.getTime()) ? `${label} must be a valid date.` : null;
};

const matchesRegex = (field, label, re, hint) => (body) =>
  body[field] && !re.test(body[field].trim())
    ? `${label} format is invalid${hint ? ` (${hint})` : ""}.`
    : null;

const isAgeRange = (field, label, min, max) => (body) => {
  if (body[field] === undefined || body[field] === "") return null;
  const n = Number(body[field]);
  if (isNaN(n) || n < min || n > max) return `${label} must be between ${min} and ${max}.`;
  return null;
};

/* ══════════════════════════════════════════════════
   EMPLOYEE
══════════════════════════════════════════════════ */
const employeeCreate = makeValidator([
  required("name", "Full name"),
  minLength("name", "Full name", 2),
  maxLength("name", "Full name", 100),

  required("employeeId", "Employee ID"),
  matchesRegex("employeeId", "Employee ID", EMPLOYEE_ID_RE, "e.g. EMP001"),

  required("email", "Email"),
  isEmail("email", "Email"),

  required("age", "Age"),
  isAgeRange("age", "Age", 18, 80),

  isOneOf("sex", "Gender", VALID_GENDERS),
  isOneOf("type", "Contract type", VALID_TYPES),
  isOneOf("status", "Status", VALID_STATUSES),

  isPositiveNumber("salary", "Annual salary"),
  isDateString("startDate", "Start date"),
]);

const employeeUpdate = makeValidator([
  // All fields optional on update — only validate what is present
  (body) => body.name !== undefined
    ? (required("name", "Full name")(body) || minLength("name", "Full name", 2)(body))
    : null,

  (body) => body.employeeId !== undefined
    ? matchesRegex("employeeId", "Employee ID", EMPLOYEE_ID_RE, "e.g. EMP001")(body)
    : null,

  (body) => body.email !== undefined ? isEmail("email", "Email")(body) : null,
  (body) => body.age !== undefined   ? isAgeRange("age", "Age", 18, 80)(body) : null,

  isOneOf("sex", "Gender", VALID_GENDERS),
  isOneOf("type", "Contract type", VALID_TYPES),
  isOneOf("status", "Status", VALID_STATUSES),

  isPositiveNumber("salary", "Annual salary"),
  isDateString("startDate", "Start date"),
]);

/* ══════════════════════════════════════════════════
   DEPARTMENT
══════════════════════════════════════════════════ */
const departmentCreate = makeValidator([
  required("name", "Department name"),
  minLength("name", "Department name", 2),
  maxLength("name", "Department name", 80),

  (body) => body.budget !== undefined && body.budget !== ""
    ? (isNaN(Number(body.budget)) || Number(body.budget) < 0
        ? "Budget must be a non-negative number."
        : null)
    : null,
]);

const departmentUpdate = makeValidator([
  (body) => body.name !== undefined
    ? (required("name", "Department name")(body) || minLength("name", "Department name", 2)(body))
    : null,

  (body) => body.budget !== undefined && body.budget !== ""
    ? (isNaN(Number(body.budget)) || Number(body.budget) < 0
        ? "Budget must be a non-negative number."
        : null)
    : null,
]);

/* ══════════════════════════════════════════════════
   JOB
══════════════════════════════════════════════════ */
const jobCreate = makeValidator([
  required("title", "Job title"),
  minLength("title", "Job title", 2),
  maxLength("title", "Job title", 120),

  required("location", "Location"),
  maxLength("location", "Location", 100),

  isOneOf("status", "Job status", VALID_JOB_STATUSES),
  isOneOf("type", "Employment type", VALID_TYPES),
]);

const jobUpdate = makeValidator([
  (body) => body.title !== undefined
    ? (required("title", "Job title")(body) || minLength("title", "Job title", 2)(body))
    : null,

  isOneOf("status", "Job status", VALID_JOB_STATUSES),
  isOneOf("type", "Employment type", VALID_TYPES),
]);

/* ══════════════════════════════════════════════════
   CANDIDATE
══════════════════════════════════════════════════ */
const candidateCreate = makeValidator([
  required("name", "Candidate name"),
  minLength("name", "Candidate name", 2),

  required("email", "Email"),
  isEmail("email", "Email"),

  required("jobId", "Job ID"),

  isOneOf("stage", "Pipeline stage", VALID_CANDIDATE_STAGES),

  (body) => body.rating !== undefined && body.rating !== ""
    ? (isNaN(Number(body.rating)) || Number(body.rating) < 0 || Number(body.rating) > 5
        ? "Rating must be between 0 and 5."
        : null)
    : null,
]);

const candidateUpdate = makeValidator([
  (body) => body.email !== undefined ? isEmail("email", "Email")(body) : null,
  isOneOf("stage", "Pipeline stage", VALID_CANDIDATE_STAGES),

  (body) => body.rating !== undefined && body.rating !== ""
    ? (isNaN(Number(body.rating)) || Number(body.rating) < 0 || Number(body.rating) > 5
        ? "Rating must be between 0 and 5."
        : null)
    : null,
]);

/* ══════════════════════════════════════════════════
   HOLIDAY
══════════════════════════════════════════════════ */
const holidayCreate = makeValidator([
  required("name", "Holiday name"),
  minLength("name", "Holiday name", 2),
  maxLength("name", "Holiday name", 100),

  required("date", "Date"),
  isDateString("date", "Date"),

  isOneOf("type", "Holiday type", VALID_HOLIDAY_TYPES),
]);

const holidayUpdate = makeValidator([
  (body) => body.name !== undefined
    ? (required("name", "Holiday name")(body) || minLength("name", "Holiday name", 2)(body))
    : null,

  (body) => body.date !== undefined ? isDateString("date", "Date")(body) : null,
  isOneOf("type", "Holiday type", VALID_HOLIDAY_TYPES),
]);

/* ══════════════════════════════════════════════════
   AUTH
══════════════════════════════════════════════════ */
const authRegister = makeValidator([
  required("name", "Name"),
  minLength("name", "Name", 2),
  maxLength("name", "Name", 80),

  required("email", "Email"),
  isEmail("email", "Email"),

  required("password", "Password"),
  minLength("password", "Password", 8),
  maxLength("password", "Password", 128),
]);

const authLogin = makeValidator([
  required("email", "Email"),
  isEmail("email", "Email"),
  required("password", "Password"),
]);

/* ══════════════════════════════════════════════════
   ATTENDANCE check-in / check-out
══════════════════════════════════════════════════ */
const TIME_RE = /^\d{2}:\d{2}$/;

const attendanceCheckIn = makeValidator([
  required("employeeId", "Employee ID"),
  required("date", "Date"),
  isDateString("date", "Date"),
  (body) => body.checkIn && !TIME_RE.test(body.checkIn) ? "checkIn must be in HH:MM format." : null,
]);

const attendanceCheckOut = makeValidator([
  required("employeeId", "Employee ID"),
  required("date", "Date"),
  isDateString("date", "Date"),
  (body) => body.checkOut && !TIME_RE.test(body.checkOut) ? "checkOut must be in HH:MM format." : null,
]);

/* ══════════════════════════════════════════════════
   LEAVE REQUEST (task 4.1)
══════════════════════════════════════════════════ */
const leaveRequestCreate = makeValidator([
  required("startDate", "Start date"),
  isDateString("startDate", "Start date"),
  required("endDate", "End date"),
  isDateString("endDate", "End date"),
  maxLength("reason", "Reason", 500),
]);

/* ── Exports ── */
export const validate = {
  employee:   { create: employeeCreate, update: employeeUpdate },
  department: { create: departmentCreate, update: departmentUpdate },
  job:        { create: jobCreate, update: jobUpdate },
  candidate:  { create: candidateCreate, update: candidateUpdate },
  holiday:    { create: holidayCreate, update: holidayUpdate },
  auth:       { register: authRegister, login: authLogin },
  attendance: { checkIn: attendanceCheckIn, checkOut: attendanceCheckOut },
  leaveRequest: { create: leaveRequestCreate },
};
