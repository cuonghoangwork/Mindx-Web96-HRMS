/**
 * mappers.js — response/request mapping layer
 *
 * The frontend (StoreContext.jsx mock data + every page that reads it) speaks a
 * different vocabulary than the DB schema in hrms_schema_docs.md:
 *
 *   - enum casing:  "Active" / "Full-time" / "On Leave"  vs.  "active" / "full-time" / "on-leave"
 *   - field names:  employee.type / employee.sex / employee.salary
 *                   vs. employee.contractType / employee.gender / employee.annualSalary
 *   - refs as display strings: employee.department === "Engineering" (a name)
 *                   vs. employee.department === ObjectId("...")  (a reference)
 *   - Mongo's _id   vs. the frontend's `id` field
 *
 * Rather than touch either the documented schema or the existing frontend code, every
 * controller routes its Mongoose documents through a `*ToClient()` function before
 * sending JSON, and incoming `req.body` through a `*FromClient()` function before
 * writing to the DB. ObjectId <-> name lookups (department, manager) that need a DB
 * query live in utils/refResolvers.js and are applied by the controller in addition
 * to these pure functions.
 */

/* ───────────────────────── enum maps (client label -> db value) ───────────────────────── */

const EMPLOYEE_STATUS = { Active: "active", "On Leave": "on-leave", Terminated: "terminated" };
const CONTRACT_TYPE = {
  "Full-time": "full-time",
  "Part-time": "part-time",
  Contract: "contract",
  Intern: "intern",
};
const GENDER = { Male: "male", Female: "female", Other: "other" };
const JOB_STATUS = { Open: "open", Filled: "filled", Closed: "closed" };
const CANDIDATE_STAGE = {
  Applied: "applied",
  Screening: "screening",
  Interview: "interview",
  Offer: "offer",
  Hired: "hired",
  Rejected: "rejected",
};
const HOLIDAY_TYPE = { Public: "public", Company: "company", Optional: "optional" };
const ATTENDANCE_STATUS = {
  Present: "present",
  Late: "late",
  "On Leave": "on-leave",
  Absent: "absent",
  // Task 4.6: automated end-of-day "no one heard from them" status, distinct from the
  // manually-entered "Absent". See jobs/closeAttendanceDay.js markNoShow().
  "No-show": "no-show",
};

// hrms_schema_docs.md names this category "hiring"; the frontend's StoreContext mock
// data and Notifications.jsx CATEGORY_CONFIG both actually use "interview" for the same
// thing. Bridge it here rather than picking a side. "announcement" passes through as-is
// since it's a new category with no legacy naming mismatch.
const NOTIFICATION_CATEGORY = { interview: "hiring" };

function invert(map) {
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k]));
}

const EMPLOYEE_STATUS_REV = invert(EMPLOYEE_STATUS);
const CONTRACT_TYPE_REV = invert(CONTRACT_TYPE);
const GENDER_REV = invert(GENDER);
const JOB_STATUS_REV = invert(JOB_STATUS);
const CANDIDATE_STAGE_REV = invert(CANDIDATE_STAGE);
const HOLIDAY_TYPE_REV = invert(HOLIDAY_TYPE);
const ATTENDANCE_STATUS_REV = invert(ATTENDANCE_STATUS);
const NOTIFICATION_CATEGORY_REV = invert(NOTIFICATION_CATEGORY);

/** client label -> db value, via `map`. Unknown input passes through lowercased as a fallback. */
function toDb(map, value) {
  if (value === undefined || value === null || value === "") return undefined;
  return map[value] ?? String(value).toLowerCase();
}

/** db value -> client label, via the inverted `map`. Unknown input passes through unchanged. */
function toClient(map, value) {
  if (value === undefined || value === null) return value;
  return map[value] ?? value;
}

/* ───────────────────────── shared helpers ───────────────────────── */

function toPlainObject(doc) {
  if (!doc) return doc;
  return typeof doc.toObject === "function" ? doc.toObject() : doc;
}

function idOf(value) {
  if (value === undefined || value === null) return null;
  // Populated document, raw ObjectId, or already-a-string - all stringify cleanly.
  return String(value._id ?? value);
}

/** Mongo Date -> "YYYY-MM-DD", matching the date-input-driven strings the frontend stores. */
function dateOnly(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Copies `key` from `body` into `out` under `outKey`, applying `transform`, only if present. */
function carry(body, key, out, outKey, transform = (v) => v) {
  if (body[key] !== undefined) out[outKey] = transform(body[key]);
}

/* ───────────────────────── Employee ───────────────────────── */

export function employeeToClient(doc) {
  const o = toPlainObject(doc);
  if (!o) return o;
  const departmentPopulated = o.department && typeof o.department === "object";
  return {
    id: idOf(o._id),
    employeeId: o.employeeId,
    name: o.name,
    age: o.age,
    sex: toClient(GENDER_REV, o.gender),
    phone: o.phone,
    email: o.email,
    address: o.address,
    department: departmentPopulated ? o.department.name : null,
    departmentId: o.department ? idOf(o.department) : null,
    designation: o.designation,
    type: toClient(CONTRACT_TYPE_REV, o.contractType),
    status: toClient(EMPLOYEE_STATUS_REV, o.status),
    salary: o.annualSalary,
    avatar: o.avatar ?? null,
    // Position Ladder (tasks 2.1/2.2) — positionLevel/levelStartDate use
    // the same string values client- and DB-side (Intern/Full-time/Senior/
    // Manager), so no toClient/toDb translation table is needed here,
    // unlike gender/contractType/status above.
    positionLevel: o.positionLevel ?? null,
    levelStartDate: o.levelStartDate ?? null,
    // Task 1.4 — contract PDF, set only via uploadContract() below (not
    // carried in employeeFromClient — see model/Employee.js's comment).
    contractUrl: o.contractUrl ?? null,
    contractUploadedAt: o.contractUploadedAt ?? null,
    // Solo Gaps Milestone 1 — publicId is intentionally omitted, an
    // internal Cloudinary detail the client never needs.
    documents: (o.documents || []).map((d) => ({
      id: idOf(d._id),
      url: d.url,
      label: d.label,
      type: d.type,
      uploadedAt: d.uploadedAt,
    })),
    createdAt: o.createdAt,
  };
}

/** Maps the client-shaped request body onto DB field names/enum values (department excluded - resolved async by the controller). */
export function employeeFromClient(body = {}) {
  const out = {};
  carry(body, "employeeId", out, "employeeId");
  carry(body, "name", out, "name");
  carry(body, "age", out, "age", (v) => (v === "" ? undefined : Number(v)));
  carry(body, "sex", out, "gender", (v) => toDb(GENDER, v));
  carry(body, "phone", out, "phone");
  carry(body, "email", out, "email");
  carry(body, "address", out, "address");
  carry(body, "designation", out, "designation");
  carry(body, "type", out, "contractType", (v) => toDb(CONTRACT_TYPE, v));
  carry(body, "status", out, "status", (v) => toDb(EMPLOYEE_STATUS, v));
  carry(body, "salary", out, "annualSalary", (v) => Number(v) || 0);
  carry(body, "avatar", out, "avatar");
  carry(body, "positionLevel", out, "positionLevel");
  // contractUrl/contractUploadedAt/documents intentionally NOT carried
  // here — see model/Employee.js's comment. Only uploadContract() /
  // uploadDocuments() / removeDocument() may set them.
  return out;
}

/* ───────────────────────── Department ───────────────────────── */

export function departmentToClient(doc) {
  const o = toPlainObject(doc);
  if (!o) return o;
  const managerPopulated = o.manager && typeof o.manager === "object";
  return {
    id: idOf(o._id),
    name: o.name,
    // managerName (freeform, see model/Department.js) wins so the label survives even if
    // the linked employee is renamed or removed; falls back to the populated employee name.
    manager: o.managerName ?? (managerPopulated ? o.manager.name : null),
    managerId: o.manager ? idOf(o.manager) : null,
    budget: o.budget,
    // employeeCount/totalSalary are computed in the controller and merged in before mapping
    employees: o.employeeCount ?? 0,
    totalSalary: o.totalSalary ?? 0,
  };
}

export function departmentFromClient(body = {}) {
  const out = {};
  carry(body, "name", out, "name");
  carry(body, "budget", out, "budget", (v) => Number(v) || 0);
  // manager handled separately by resolveManagerRef() in the controller (needs a DB lookup)
  return out;
}

/* ───────────────────────── Job ───────────────────────── */

export function jobToClient(doc) {
  const o = toPlainObject(doc);
  if (!o) return o;
  const departmentPopulated = o.department && typeof o.department === "object";
  return {
    id: idOf(o._id),
    title: o.title,
    department: departmentPopulated ? o.department.name : null,
    departmentId: o.department ? idOf(o.department) : null,
    location: o.location ?? null,
    status: toClient(JOB_STATUS_REV, o.status),
    type: toClient(CONTRACT_TYPE_REV, o.type),
    description: o.description ?? "",
    // Task 5.1 — requirements/benefits stay arrays client-side (one bullet
    // per entry); the frontend joins them with "\n" for a textarea and
    // splits back on submit via jobFromClient below.
    requirements: Array.isArray(o.requirements) ? o.requirements : [],
    benefits: Array.isArray(o.benefits) ? o.benefits : [],
    salaryMin: o.salaryMin ?? null,
    salaryMax: o.salaryMax ?? null,
    salaryCurrency: o.salaryCurrency ?? "USD",
    companyInfo: o.companyInfo ?? "",
    applicationInstructions: o.applicationInstructions ?? "",
    deadline: dateOnly(o.deadline),
    postedDate: dateOnly(o.postedDate),
    applicantCount: o.applicantCount ?? 0,
  };
}

/** "one per line" textarea value (or an already-split array) -> trimmed, non-empty string[]. */
function toBulletList(value) {
  if (Array.isArray(value)) return value.map((s) => String(s).trim()).filter(Boolean);
  return String(value ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function jobFromClient(body = {}) {
  const out = {};
  carry(body, "title", out, "title");
  carry(body, "location", out, "location");
  carry(body, "status", out, "status", (v) => toDb(JOB_STATUS, v));
  carry(body, "type", out, "type", (v) => toDb(CONTRACT_TYPE, v));
  carry(body, "description", out, "description");
  carry(body, "requirements", out, "requirements", toBulletList);
  carry(body, "benefits", out, "benefits", toBulletList);
  carry(body, "salaryMin", out, "salaryMin", (v) => (v === "" || v === null ? null : Number(v)));
  carry(body, "salaryMax", out, "salaryMax", (v) => (v === "" || v === null ? null : Number(v)));
  carry(body, "salaryCurrency", out, "salaryCurrency");
  carry(body, "companyInfo", out, "companyInfo");
  carry(body, "applicationInstructions", out, "applicationInstructions");
  carry(body, "deadline", out, "deadline", (v) => (v ? new Date(v) : null));
  carry(body, "postedDate", out, "postedDate", (v) => new Date(v));
  // department handled separately by resolveDepartmentRef() in the controller
  return out;
}

/* ───────────────────────── Candidate ───────────────────────── */

export function candidateToClient(doc) {
  const o = toPlainObject(doc);
  if (!o) return o;
  const jobPopulated = o.job && typeof o.job === "object";
  return {
    id: idOf(o._id),
    name: o.name,
    jobId: idOf(o.job),
    jobTitle: jobPopulated ? o.job.title : null,
    stage: toClient(CANDIDATE_STAGE_REV, o.stage),
    rating: o.rating,
    email: o.email,
    phone: o.phone,
    appliedDate: dateOnly(o.appliedDate),
    resumeUrl: o.resumeUrl ?? "#",
    resumeUploadedAt: o.resumeUploadedAt ?? null,
    notes: o.notes ?? "",
  };
}

export function candidateFromClient(body = {}) {
  const out = {};
  carry(body, "name", out, "name");
  carry(body, "email", out, "email");
  carry(body, "phone", out, "phone");
  carry(body, "jobId", out, "job"); // already a real ObjectId string, no name lookup needed
  carry(body, "stage", out, "stage", (v) => toDb(CANDIDATE_STAGE, v));
  carry(body, "rating", out, "rating", (v) => Number(v) || 0);
  carry(body, "appliedDate", out, "appliedDate", (v) => new Date(v));
  carry(body, "resumeUrl", out, "resumeUrl");
  carry(body, "notes", out, "notes");
  return out;
}

/* ───────────────────────── Holiday ───────────────────────── */

export function holidayToClient(doc) {
  const o = toPlainObject(doc);
  if (!o) return o;
  return {
    id: idOf(o._id),
    name: o.name,
    date: dateOnly(o.date),
    type: toClient(HOLIDAY_TYPE_REV, o.type),
  };
}

export function holidayFromClient(body = {}) {
  const out = {};
  carry(body, "name", out, "name");
  carry(body, "date", out, "date", (v) => new Date(v));
  carry(body, "type", out, "type", (v) => toDb(HOLIDAY_TYPE, v));
  return out;
}

/* ───────────────────────── Attendance ───────────────────────── */

export function attendanceToClient(doc) {
  const o = toPlainObject(doc);
  if (!o) return o;
  const employeePopulated = o.employee && typeof o.employee === "object";
  return {
    id: idOf(o._id),
    employeeId: idOf(o.employee),
    employeeName: employeePopulated ? o.employee.name : null,
    date: dateOnly(o.date),
    checkIn: o.checkIn ?? null,
    checkOut: o.checkOut ?? null,
    hours: o.hours ?? 0,
    status: toClient(ATTENDANCE_STATUS_REV, o.status),
    // Task 4.2 — "paid" | "unpaid" | null. Only ever set when status is "Late".
    lateHalfDayType: o.lateHalfDayType ?? null,
  };
}

export function attendanceFromClient(body = {}) {
  const out = {};
  carry(body, "employeeId", out, "employee"); // already a real ObjectId string
  carry(body, "date", out, "date", (v) => new Date(v));
  carry(body, "checkIn", out, "checkIn");
  carry(body, "checkOut", out, "checkOut");
  carry(body, "status", out, "status", (v) => toDb(ATTENDANCE_STATUS, v));
  carry(body, "lateHalfDayType", out, "lateHalfDayType");
  return out;
}

/* ───────────────────────── Notification ───────────────────────── */

export function notificationToClient(doc) {
  const o = toPlainObject(doc);
  if (!o) return o;
  return {
    id: idOf(o._id),
    category: toClient(NOTIFICATION_CATEGORY_REV, o.category),
    title: o.title,
    message: o.message ?? "",
    timestamp: o.createdAt,
    read: o.read,
    link: o.link ?? null,
    linkLabel: o.linkLabel ?? null,
    isCustom: Boolean(o.isCustom),
    senderName: o.sender?.name ?? null,
    audience: o.audience ?? "all",
    recipientId: o.user ? idOf(o.user) : null,
  };
}

export function notificationFromClient(body = {}) {
  const out = {};
  carry(body, "category", out, "category", (v) => toDb(NOTIFICATION_CATEGORY, v));
  carry(body, "title", out, "title");
  carry(body, "message", out, "message");
  carry(body, "link", out, "link");
  carry(body, "linkLabel", out, "linkLabel");
  carry(body, "audience", out, "audience");
  if (body.user !== undefined) out.user = body.user;
  return out;
}
