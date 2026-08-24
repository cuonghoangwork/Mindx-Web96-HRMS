# HRMS Database Schema Documentation

> **Database**: MongoDB (Mongoose ODM)
> **Project**: MindX WEB96 Capstone — Human Resource Management System
> **Regenerated**: 2026-08-23, directly from `hrms-backend/model/*.js` — supersedes the previous version of this doc, which documented 8 of the 18 live collections.

---

## Collections Overview

| Collection | Documents | Key Indexes |
|---|---|---|
| `users` | Auth accounts | `email` (unique) |
| `employees` | Employee profiles | `email`, `employeeId` (unique); `(department, status)`; `(positionLevel, levelStartDate)` |
| `departments` | Org units | `name` (unique) |
| `attendance` | Daily check-in/out | `(employee, date)` (unique) |
| `jobs` | Job openings | `status`, `department` |
| `candidates` | Job applicants | `job`, `stage` |
| `holidays` | Public/company holidays | `(name, date)` (unique) |
| `notifications` | System notifications | `(user, read, category)` |
| `auditlogs` | Every mutating API action | `createdAt` (desc); `(resource, resourceId)`; `actor.id` |
| `exchangeRates` | Monthly USD→VND snapshot | `(year, month)` (unique) |
| `leaveRequests` | 5-type leave/time-off requests | `(employee, status)`; `(employee, startDate)` |
| `noShowReviews` | Auto-flagged after repeated no-shows | `(employee, status)`; `(employee, noShowCountAtFlag desc)` |
| `payrollPeriods` | One record per calendar month | `(year, month)` (unique); `(status, year desc, month desc)`; `systemGenerated` |
| `payslips` | One record per employee per period | `(period, employee)` (unique); `(employee, createdAt desc)` |
| `performanceCycles` | Review-cycle definitions | `(kind, start desc)` |
| `performanceReviews` | Self/manager ratings + appeal | `(cycleKey, employee)` (unique); `employee` |
| `positionLevels` | Level → base-salary lookup | `level` (unique) |
| `profileEditRequests` | Self-service profile-edit review queue | `(employee, status)`; `requestedBy` |
| `promotionRequests` | Manual + system-generated promotion/raise proposals | `(employee, status)`; `requestedBy`; `(employee, systemGenerated, proposedPositionLevel)` |

---

## Relationships

```
users ──────────────────────── employees      (1:1 optional — user.employee ↔ employee.userId)
departments ─────────────────► employees      (1:N — employee.department → departments._id)
departments ─────────────────── employees     (1:1 optional — department.manager → employees._id)
employees ───────────────────► attendance     (1:N — attendance.employee → employees._id)
departments ─────────────────► jobs           (1:N — job.department → departments._id)
jobs ────────────────────────► candidates     (1:N — candidate.job → jobs._id)
users ───────────────────────► notifications  (1:N — notification.user → users._id, null = broadcast)
users ───────────────────────► auditlogs      (1:N — auditLog.actor.id → users._id)
employees ───────────────────► leaveRequests, noShowReviews, promotionRequests, profileEditRequests
                                (1:N each — all four share reviewRequestBaseFields(), see below)
payrollPeriods ───────────────► payslips      (1:N — payslip.period → payrollPeriods._id)
employees ───────────────────► payslips       (1:N — payslip.employee → employees._id)
performanceCycles (by .key) ──► performanceReviews (performanceReview.cycleKey, string join not ObjectId ref)
employees ───────────────────► performanceReviews (1:N — performanceReview.employee → employees._id)
positionLevels (by .level) ───► employees, promotionRequests (positionLevel is a shared enum, not an ObjectId ref)
```

---

## Shared shape: the review-queue pattern

`leaveRequests`, `noShowReviews`, `promotionRequests`, and `profileEditRequests` all compose a common base (`utils/reviewQueue.js: reviewRequestBaseFields()`) rather than hand-rolling the same submit→review shape four times:

| Field | Type | Notes |
|---|---|---|
| `employee` | ObjectId → `employees` | Required |
| `requestedBy` | ObjectId → `users` | Null when `systemGenerated` |
| `systemGenerated` | Boolean | True for scheduler-raised rows (promotion eligibility, no-show flags) — distinguishes "the system flagged this" from "a person proposed this" |
| `status` | String | `pending` \| `approved` \| `rejected` |
| `reviewNote` | String | Optional, set by the reviewer |
| `reviewedBy` | ObjectId → `users` | Null until reviewed |
| `reviewedAt` | Date | Null until reviewed |

Each collection adds its own type-specific fields on top of this (see below).

---

## Collections Detail

### `users`
| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | |
| `email` | String | ✅ | Unique, lowercase |
| `password` | String | ✅ | bcrypt hashed |
| `name` | String | ✅ | |
| `role` | String | ✅ | `ADMIN` \| `HR` \| `MANAGER` \| `EMPLOYEE` — **4 values**, not 3. `HR` is company-wide/unscoped; `MANAGER` is department-scoped (see `utils/managerScope.js`). Split out from a single overloaded `MANAGER` role specifically to give department-scoping a real unscoped tier above it. |
| `employee` | ObjectId | — | Ref → `employees` (1:1 optional) |
| `refreshToken` | String | — | Null after logout |
| `mustChangePassword` | Boolean | — | Default `false` — forces a reset flow post-creation |
| `createdAt`/`updatedAt` | Date | auto | |

### `employees`
| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | |
| `employeeId` | String | ✅ | Unique, e.g. `EMP001` |
| `name` | String | ✅ | |
| `age` | Number | — | |
| `gender` | String | — | `male` \| `female` \| `other` |
| `phone` | String | — | |
| `email` | String | ✅ | Unique |
| `address` | String | — | |
| `department` | ObjectId | — | Ref → `departments` |
| `designation` | String | — | Free-text job title |
| `startDate` | Date | — | |
| `contractType` | String | — | `full-time` \| `part-time` \| `contract` \| `intern` — **employment terms**, deliberately separate from `positionLevel` below (a part-time Senior must be representable) |
| `positionLevel` | String | — | **New — Position Ladder.** `Intern` \| `Full-time` \| `Senior` \| `Manager`, default `Full-time`. This is seniority/pay-grade, not a department-manager assignment — no code should join it against `Department.manager` |
| `levelStartDate` | Date | — | **New.** Tracks tenure-in-level for promotion-eligibility timing; defaults to `startDate` (or now) on creation via a `pre("validate")` hook |
| `status` | String | — | `active` \| `on-leave` \| `terminated` |
| `annualSalary` | Number | — | Default `0` |
| `avatar` | String | — | URL |
| `contractUrl` | String | — | Contract PDF, HR/Admin-uploaded only — not exposed through the generic update endpoint |
| `contractUploadedAt` | Date | — | |
| `userId` | ObjectId | — | **New.** Back-link to the `users` account (1:1 optional) |
| `createdAt`/`updatedAt` | Date | auto | |

### `departments`
| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | |
| `name` | String | ✅ | Unique |
| `manager` | ObjectId | — | Ref → `employees` |
| `managerName` | String | — | **New.** Denormalized display cache — `AddDepartmentModal` collects the manager as free text with no employee picker |
| `budget` | Number | — | Default `0` |
| `createdAt`/`updatedAt` | Date | auto | |

### `attendance`
| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | |
| `employee` | ObjectId | ✅ | Ref → `employees` |
| `date` | Date | ✅ | |
| `checkIn` / `checkOut` | String | — | e.g. `09:00` |
| `hours` | Number | — | Default `0` |
| `status` | String | — | `present` \| `late` \| `on-leave` \| `absent` \| **`no-show`** (new) — auto-assigned by the end-of-day closer when there's neither a check-in nor an approved leave request; `absent` stays available for manual HR entry |
| `lateHalfDayType` | String | — | **New.** `annual` \| `unpaid` \| `null`. Set only when `status === "late"`, by the end-of-day closer, based on remaining Annual/PTO balance |
| `createdAt`/`updatedAt` | Date | auto | |

> Unique compound index: `{ employee: 1, date: 1 }`

### `jobs`
| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | |
| `title` | String | ✅ | |
| `department` | ObjectId | — | Ref → `departments` |
| `location` | String | — | |
| `status` | String | — | `open` \| `filled` \| `closed` |
| `type` | String | — | `full-time` \| `part-time` \| `contract` \| `intern` |
| `description` | String | — | Full JD |
| `requirements` | String[] | — | One entry per bullet, default `[]` |
| `benefits` | String[] | — | One entry per bullet, default `[]` |
| `salaryMin` / `salaryMax` | Number | — | Independent — a posting can give a range, a single figure, or omit pay entirely |
| `salaryCurrency` | String | — | Default `"USD"` |
| `companyInfo` | String | — | Default `""` |
| `applicationInstructions` | String | — | URL, email, or free text; default `""` |
| `deadline` | Date | — | Informational only — nothing auto-closes the posting when it passes |
| `postedDate` | Date | — | Default `now` |
| `createdAt`/`updatedAt` | Date | auto | |

### `candidates`
| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | |
| `name` | String | ✅ | |
| `email` | String | ✅ | |
| `phone` | String | — | |
| `job` | ObjectId | ✅ | Ref → `jobs` |
| `stage` | String | — | `applied` → `screening` → `interview` → `offer` → `hired` \| `rejected` |
| `rating` | Number | — | 0–5 |
| `resumeUrl` | String | — | Real PDF upload (Cloudinary + Multer, same pattern as employee contracts) — still doubles as a manually-settable link for seed/back-compat |
| `resumeUploadedAt` | Date | — | **New.** Distinguishes "a link was pasted" from "a file was actually uploaded" |
| `notes` | String | — | |
| `appliedDate` | Date | — | Default `now` |
| `createdAt`/`updatedAt` | Date | auto | |

### `holidays`
| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | |
| `name` | String | ✅ | |
| `date` | Date | ✅ | |
| `type` | String | — | `public` \| `company` \| `optional` |
| `createdAt`/`updatedAt` | Date | auto | |

> Unique compound index: `{ name: 1, date: 1 }`

### `notifications`
| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | |
| `user` | ObjectId | — | Ref → `users`; `null` = broadcast |
| `audience` | String | — | **New.** `all` \| `employees` \| `hr` — narrows a broadcast when `user` is null; ignored when `user` is set |
| `category` | String | ✅ | `leave` \| `hiring` \| `payroll` \| `employee` \| `holiday` \| `system` \| `announcement` \| `performance` (2 new values) |
| `title` | String | ✅ | |
| `message` | String | — | |
| `read` | Boolean | — | Default `false` |
| `link` / `linkLabel` | String | — | **New.** In-app deep-link target, e.g. `/employees/64f...` |
| `sender.id` / `sender.name` | ObjectId / String | — | **New.** Who authored a manually-composed notice; null for system-generated ones |
| `isCustom` | Boolean | — | **New.** True for hand-composed notices vs. system events |
| `createdAt`/`updatedAt` | Date | auto | |

### `auditlogs` *(new collection — not in the previous doc)*
| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | |
| `actor.id` / `actor.name` / `actor.role` | ObjectId / String / String | — | Who performed the action |
| `action` | String | ✅ | `created` \| `updated` \| `deleted` \| `uploaded_avatar` \| `checked_in` \| `checked_out` \| `status_changed` \| `budget_updated` \| `stage_changed` \| `login` \| `logout` \| `registered` |
| `resource` | String | ✅ | `employee` \| `department` \| `job` \| `candidate` \| `holiday` \| `attendance` \| `notification` \| `user` \| `promotion` \| `payroll` \| `performance` |
| `resourceId` | String | — | Stored as string so it survives deletions |
| `label` | String | — | Human-readable summary, e.g. `"Jane Smith (EMP002)"` |
| `changes` | Mixed | — | `{ field: { from, to } }` |
| `createdAt`/`updatedAt` | Date | auto | Feeds the Dashboard activity feed and Settings audit log tab |

### `exchangeRates` *(new collection)*
One persisted VND-per-USD snapshot per calendar month — payroll draft generation and every payslip in a period price off the exact same number rather than a live re-fetch per request.

| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | |
| `year` / `month` | Number | ✅ | |
| `rateVndPerUsd` | Number | ✅ | |
| `source` | String | ✅ | `api` (live fetch) \| `fallback` (fetch failed, default rate used) \| `manual` (reserved for a future HR override — not written by the job today) |
| `providerName` | String | — | |
| `fetchedAt` | Date | — | Default `now` |

> Unique compound index: `{ year: 1, month: 1 }`

### `leaveRequests` *(new collection)*
Composes `reviewRequestBaseFields()` (see above) plus:

| Field | Type | Required | Notes |
|---|---|---|---|
| `startDate` / `endDate` | Date | ✅ | |
| `days` | Number | ✅ | Working-day count, stored rather than recomputed so a later change to the counting rule doesn't reinterpret history |
| `type` | String | ✅ | `annual` \| `sick` \| `parental` \| `bereavement` \| `unpaid` — a **5-type system**, not a flat 12-day cap. Per-type annual allowance: annual 12, sick 10, parental 90, bereavement 5. `unpaid` has no cap by design |
| `reason` | String | — | Default `""` |
| `appliedAt` | Date | — | Distinct from `createdAt` — the field the 9AM same-day rule evaluates against |

### `noShowReviews` *(new collection)*
Composes `reviewRequestBaseFields()` plus:

| Field | Type | Required | Notes |
|---|---|---|---|
| `noShowCountAtFlag` | Number | ✅ | Employee's all-time no-show count at the moment this flag was raised |
| `reason` | String | — | |
| `flaggedAt` | Date | — | Default `now` |

Every row here is `systemGenerated: true` — there's no employee- or HR-initiated create path. Approving a review never changes employee status/employment automatically.

### `payrollPeriods` *(new collection)*
One record per calendar month — the real persisted-per-period model that replaced computing payroll live off `employee.annualSalary`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | |
| `year` / `month` | Number | ✅ | |
| `fxRate` | Number | ✅ | Default `25000` |
| `standardWorkingDays` | Number | ✅ | |
| `status` | String | — | `draft` \| `approved` \| `paid` |
| `note` | String | — | |
| `createdBy` | ObjectId | — | Null for periods auto-drafted by the scheduled monthly job |
| `systemGenerated` | Boolean | — | |
| `fxRateSource` | String | — | `manual` \| `api` \| `fallback` |
| `approvedBy` / `approvedAt` | ObjectId / Date | — | |
| `paidBy` / `paidAt` | ObjectId / Date | — | Once `paid`, payslips in the period can never be edited again |

> Unique compound index: `{ year: 1, month: 1 }`

### `payslips` *(new collection)*
One record per employee per period — the actual VN payroll math (progressive PIT brackets, BHXH/BHYT/BHTN) runs against this, not a live salary lookup.

| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | |
| `period` | ObjectId | ✅ | Ref → `payrollPeriods` |
| `employee` | ObjectId | ✅ | Ref → `employees` |
| `employeeCode` / `employeeName` / `departmentName` / `designation` / `contractType` | String | — | Snapshotted at generation time |
| `departmentId` | ObjectId | — | Ref → `departments` |
| `annualSalaryUsd` | Number | — | |
| `baseSalary` / `bonus` / `allowance` / `deduction` | Number | ✅ | `bonus` seeds `0` at draft generation; set manually per employee via the payroll adjustment endpoint. Automatic KPI-driven bonus calculation was scoped and then explicitly removed (product decision, 2026-08-23) — see `HRMS_IMPROVEMENT_TASKS.md` §3.4 |
| `unpaidLeaveDays` / `absentDays` | Number | — | |
| `autoDeduction` / `deductionOverridden` | Number / Boolean | — | Manual-adjustment audit trail |
| `grossPay` | Number | ✅ | |
| `insuranceBase` | Number | ✅ | |
| `insuranceExempt` | Boolean | — | **Set true when `unpaidLeaveDays >= 14`** (`INSURANCE_EXEMPT_UNPAID_DAYS` in `payrollEngine.js`) — `insuranceBase` zeroes out in that case |
| `bhxh` / `bhyt` / `bhtn` / `insuranceTotal` | Number | ✅ | Vietnamese statutory insurance components |
| `taxableIncome` / `pit` | Number | ✅ | Progressive personal income tax |
| `netPay` | Number | ✅ | |

> Unique compound index: `{ period: 1, employee: 1 }`

### `performanceCycles` *(new collection)*
| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | |
| `key` | String | ✅ | Unique, string-joined from `performanceReviews.cycleKey` (not an ObjectId ref) |
| `label` | String | ✅ | |
| `kind` | String | — | `standard` \| `custom` |
| `status` | String | — | `Open` \| `Closed` |
| `start` / `end` | Date | — | |
| `statusOverriddenAt` | Date | — | |
| `createdBy` | ObjectId | — | Ref → `users` |

### `performanceReviews` *(new collection)*
| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | |
| `cycleKey` | String | ✅ | |
| `employee` | ObjectId | ✅ | Ref → `employees` |
| `selfRating` / `selfComments` / `selfSubmittedDate` | Number(1–5) / String / Date | — | |
| `managerRating` / `managerComments` / `managerSubmittedDate` / `managerReviewedBy` | Number(1–5) / String / Date / ObjectId | — | |
| `competencies` | Object | — | One `{self, manager}` rating pair per competency: `communication`, `execution`, `ownership`, `collaboration`, `leadership`, `problemSolving` |
| `goals[]` | Array | — | `{ text, progress (0–100, step 10), createdBy }` |
| `peerFeedback[]` | Array | — | `{ name, relation, comments, addedBy, addedAt }` |
| `appeal` | Object \| null | — | `{ reasonCategory: rating_low\|inaccurate\|process\|other, detail, status: Pending\|Resolved, filedDate, filedBy, resolution: Upheld\|Adjusted, resolvedRating, resolverNote, resolvedBy, resolvedDate }` |

> Unique compound index: `{ cycleKey: 1, employee: 1 }`

### `positionLevels` *(new collection)*
Small HR-configurable lookup table — both the promotion-eligibility job and payroll's annual-raise logic read from it, so the ladder and payroll never drift apart.

| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | |
| `level` | String | ✅ | `Intern` \| `Full-time` \| `Senior` \| `Manager` — unique |
| `order` | Number | ✅ | 0 = lowest; explicit rather than inferred from array position |
| `baseSalary` | Number | ✅ | |
| `note` | String | — | |

**Note:** "Manager" here is a personal seniority/pay-grade, fully decoupled from `Department.manager`. No code should join it against `Department`.

### `profileEditRequests` *(new collection)*
Composes `reviewRequestBaseFields()` plus:

| Field | Type | Required | Notes |
|---|---|---|---|
| `changes` | Mixed | ✅ | `{ fieldName: { from, to } }`. Employee-editable fields: `name`, `phone`, `address`, `age`, `sex`. HR-only fields (not available here): `employeeId`, `department`, `designation`, `type`, `status`, `salary`, `avatar` |

### `promotionRequests` *(new collection)*
Composes `reviewRequestBaseFields()` plus:

| Field | Type | Required | Notes |
|---|---|---|---|
| `currentDesignation` / `currentDepartmentName` / `currentAnnualSalary` / `currentPositionLevel` | String / String / Number / String | — | Snapshotted at proposal time so the request stands on its own even if the employee's record changes again before review |
| `proposedDesignation` | String | — | |
| `proposedDepartment` | ObjectId | — | Ref → `departments` |
| `proposedDepartmentName` | String | — | |
| `proposedAnnualSalary` | Number | — | |
| `proposedPositionLevel` | String | — | `Intern` \| `Full-time` \| `Senior` \| `Manager` |
| `effectiveDate` | Date | — | |
| `reason` | String | — | |
| `appliedAt` | Date | — | Default `now` |

`systemGenerated: true` rows with `proposedPositionLevel: null` are the auto-flagged annual-raise candidates from `jobs/annualSalaryRaise.js` (a straight +10% raise, no level change) — distinguishable from a genuine level-promotion proposal by that `null`.

---

## Enum Reference

| Collection.Field | Values |
|---|---|
| `users.role` | `ADMIN`, `HR`, `MANAGER`, `EMPLOYEE` |
| `employees.gender` | `male`, `female`, `other` |
| `employees.contractType` | `full-time`, `part-time`, `contract`, `intern` |
| `employees.positionLevel` | `Intern`, `Full-time`, `Senior`, `Manager` |
| `employees.status` | `active`, `on-leave`, `terminated` |
| `attendance.status` | `present`, `late`, `on-leave`, `absent`, `no-show` |
| `attendance.lateHalfDayType` | `annual`, `unpaid`, `null` |
| `jobs.status` | `open`, `filled`, `closed` |
| `jobs.type` | `full-time`, `part-time`, `contract`, `intern` |
| `candidates.stage` | `applied`, `screening`, `interview`, `offer`, `hired`, `rejected` |
| `holidays.type` | `public`, `company`, `optional` |
| `notifications.audience` | `all`, `employees`, `hr` |
| `notifications.category` | `leave`, `hiring`, `payroll`, `employee`, `holiday`, `system`, `announcement`, `performance` |
| `auditlogs.action` | `created`, `updated`, `deleted`, `uploaded_avatar`, `checked_in`, `checked_out`, `status_changed`, `budget_updated`, `stage_changed`, `login`, `logout`, `registered` |
| `auditlogs.resource` | `employee`, `department`, `job`, `candidate`, `holiday`, `attendance`, `notification`, `user`, `promotion`, `payroll`, `performance` |
| `exchangeRates.source` | `api`, `fallback`, `manual` |
| `leaveRequests.type` | `annual`, `sick`, `parental`, `bereavement`, `unpaid` |
| `payrollPeriods.status` | `draft`, `approved`, `paid` |
| `payrollPeriods.fxRateSource` | `manual`, `api`, `fallback` |
| `performanceCycles.kind` | `standard`, `custom` |
| `performanceCycles.status` | `Open`, `Closed` |
| `performanceReviews.appeal.reasonCategory` | `rating_low`, `inaccurate`, `process`, `other` |
| `performanceReviews.appeal.status` | `Pending`, `Resolved` |
| `performanceReviews.appeal.resolution` | `Upheld`, `Adjusted` |
| `positionLevels.level` | `Intern`, `Full-time`, `Senior`, `Manager` |
| `leaveRequests`/`noShowReviews`/`promotionRequests`/`profileEditRequests` `.status` | `pending`, `approved`, `rejected` (shared `REVIEW_STATUSES`) |
