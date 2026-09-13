# HRMS Database Schema Documentation

> **Database**: MongoDB (Mongoose ODM)
> **Project**: MindX WEB96 Capstone — Human Resource Management System
> **Last regenerated**: 2026-09-10, directly from `hrms-backend/model/*.js` — **23 collections**.
> Adds the four collections introduced after the 2026-08-23 pass (`overtimeRequests`, `pushSubscriptions`, `rolePermissions`, `telegramLinkCodes`) and the fields the Attendance Overtime and real-time notification work added to `attendance`, `payslips`, `users` and `notifications`.

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
| `overtimeRequests` | Overtime applied for or assigned, per date | `(employee, date)`; `(employee, status)`; `(employee, date)` **partial-unique** on live statuses |
| `payrollPeriods` | One record per calendar month | `(year, month)` (unique); `(status, year desc, month desc)`; `systemGenerated` |
| `payslips` | One record per employee per period | `(period, employee)` (unique); `(employee, createdAt desc)` |
| `performanceCycles` | Review-cycle definitions | `(kind, start desc)` |
| `performanceReviews` | Self/manager ratings + appeal | `(cycleKey, employee)` (unique); `employee` |
| `positionLevels` | Level → base-salary lookup | `level` (unique) |
| `profileEditRequests` | Self-service profile-edit review queue | `(employee, status)`; `requestedBy` |
| `promotionRequests` | Manual + system-generated promotion/raise proposals | `(employee, status)`; `requestedBy`; `(employee, systemGenerated, proposedPositionLevel)` |
| `pushSubscriptions` | Web Push endpoint — one row per **browser** | `endpoint` (unique); `user` |
| `rolePermissions` | Per-capability MANAGER toggles | `(role, capability)` (unique) |
| `telegramLinkCodes` | Short-lived account-linking codes | `code` (unique); `expiresAt` (**TTL**) |

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
employees ───────────────────► leaveRequests, noShowReviews, promotionRequests, profileEditRequests,
                                overtimeRequests
                                (1:N each — all five share reviewRequestBaseFields(), see below)
overtimeRequests ────────────► attendance     (1:1 per date — attendance.otRequest → overtimeRequests._id)
users ───────────────────────► pushSubscriptions  (1:N — one row per browser, not per user)
users ───────────────────────► telegramLinkCodes  (1:N transient — TTL-swept after 10 minutes)
payrollPeriods ───────────────► payslips      (1:N — payslip.period → payrollPeriods._id)
employees ───────────────────► payslips       (1:N — payslip.employee → employees._id)
performanceCycles (by .key) ──► performanceReviews (performanceReview.cycleKey, string join not ObjectId ref)
employees ───────────────────► performanceReviews (1:N — performanceReview.employee → employees._id)
positionLevels (by .level) ───► employees, promotionRequests (positionLevel is a shared enum, not an ObjectId ref)
```

---

## Shared shape: the review-queue pattern

`leaveRequests`, `noShowReviews`, `overtimeRequests`, `promotionRequests`, and `profileEditRequests` all compose a common base (`utils/reviewQueue.js: reviewRequestBaseFields()`) rather than hand-rolling the same submit→review shape five times:

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
| `language` | String | — | **New.** `en` \| `vi`, default `vi`. Only for copy rendered **server-side and sent out of the app** (today: Telegram, `utils/notifyI18n.js`). In-app copy is translated in the browser from the live UI toggle and never reads this — a Telegram message has no browser to ask |
| `notify.email` | Boolean | — | **New.** Default `false` — **opt-in, not opt-out**. Email is the only channel that can reach a broadcast audience, so a `true` default would mail the entire roster on the first company-wide notice |
| `notify.telegram` | Boolean | — | **New.** Default `false` |
| `notify.telegramChatId` | String | — | **New.** Set when a link code is redeemed; `null` unlinks |
| `createdAt`/`updatedAt` | Date | auto | |

Only channels the **server** sends live under `notify`. Desktop notifications are deliberately absent — the browser owns that permission, so a flag here would claim "on" for a device that never granted it (see `hrms-react/src/utils/desktopNotify.js`). Web Push gets its own collection for the same reason: subscriptions are per-device, not per-user. A user toggle can only ever **narrow** `utils/notifyPolicy.js`, never widen it — that table decides what is allowed to leave the app at all.

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
| `documents[]` | Subdocument[] | — | **New.** Arbitrary multi-document uploads — `{ url, publicId, label, type, uploadedAt, uploadedBy }`, `type` ∈ `offer_letter` \| `id_scan` \| `other`. Additive **alongside** `contractUrl`, not a migration of it |
| `userId` | ObjectId | — | **New.** Back-link to the `users` account (1:1 optional) |
| `createdAt`/`updatedAt` | Date | auto | |

`documents[].publicId` is stored (not just the URL) so `removeDocument()` can delete the matching Cloudinary asset — unlike the single-contract flow, which never deletes because it overwrites one fixed public id in place.

`PAYABLE_EMPLOYEE_STATUSES` (`active`, `on-leave`) is exported next to the status enum: payroll skips everyone outside it, and overtime refuses to schedule or approve for them. One constant so the two can't drift into "hours recorded, never paid".

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
| `rawCheckOut` | String | — | **New (Overtime M3).** The employee's own clock-out, written **only** by a genuine clock-out and never by the close job. The job overwrites `checkOut`, so without this a record auto-closed at 18:00 loses the evidence that someone actually stayed until 21:30 — a late approval reads `rawCheckOut` to credit real hours instead of merely planned ones |
| `otMinutes` | Number | — | **New.** Approved, payable overtime. Default `0` |
| `otNightMinutes` | Number | — | **New.** Subset of `otMinutes` falling in the night-premium window. Default `0` |
| `otUnapprovedMinutes` | Number | — | **New.** Time worked outside any approved window. **Recorded, never paid, never counted toward the 40h/200h caps** — uncompensated time does not consume a legal allowance. Exists so HR can see who is working hours nobody signed off on |
| `otDayType` | String | — | **New.** `normal` \| `restDay` \| `holiday` \| `null` |
| `otEvidence` | String | — | **New.** `clocked` (a real clock-out backs it) \| `planned` (trusting the approved plan; the employee never clocked out) \| `manual` (HR edited by hand). Lets the approval queue tell clock proof from an assumption |
| `otRequest` | ObjectId | — | **New.** Ref → `overtimeRequests` |
| `createdAt`/`updatedAt` | Date | auto | |

> Unique compound index: `{ employee: 1, date: 1 }`

Every `ot*` figure is **derived** by `utils/overtimeRecompute.js` and never incremented in place. Recomputing from the same inputs must always give the same answer — that idempotence is what makes a late approval, a re-approval and a manual HR edit all safe.

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
| `category` | String | ✅ | `leave` \| **`overtime`** \| `hiring` \| `payroll` \| `employee` \| `holiday` \| `system` \| `announcement` \| `performance`. `overtime` is separate from `leave` despite the identical review workflow — the two must be tunable apart in `notifyPolicy`, and the Notifications page filters on this value |
| `title` | String | ✅ | |
| `message` | String | — | |
| `titleKey` / `messageKey` | String | — | **New.** Translation keys for system-generated notices. When set, the frontend renders `notifications.generated.<key>` instead of the literal text; `title`/`message` stay populated as the English fallback |
| `params` | Mixed | — | **New.** Interpolation values for the keys above |
| `read` | Boolean | — | Default `false` |
| `link` / `linkLabel` | String | — | **New.** In-app deep-link target, e.g. `/employees/64f...` |
| `sender.id` / `sender.name` | ObjectId / String | — | **New.** Who authored a manually-composed notice; null for system-generated ones |
| `isCustom` | Boolean | — | **New.** True for hand-composed notices vs. system events |
| `createdAt`/`updatedAt` | Date | auto | |

**Which broadcast audiences each role reads** (`AUDIENCES_BY_ROLE`, exported from the model so the read path, the write path and any future transport share one table):

| Role | Reads |
|---|---|
| `ADMIN` | `all`, `hr` |
| `HR` | `all`, `hr` |
| `MANAGER` | `all`, `employees` |
| `EMPLOYEE` | `all`, `employees` |

`hr` means the **unscoped company-wide tier**, not "everyone who approves things". `MANAGER` is deliberately excluded: it is department-scoped, and a broadcast carries no department — a MANAGER reading `hr` would see every other department's hires, removals and payroll runs. Notices a MANAGER genuinely needs are written as targeted per-user documents instead, which *can* be scoped. `rolesForAudience()` is derived from the same map rather than written out a second time.

### `auditlogs` *(new collection — not in the previous doc)*
| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | |
| `actor.id` / `actor.name` / `actor.role` | ObjectId / String / String | — | Who performed the action |
| `action` | String | ✅ | `created` \| `updated` \| `deleted` \| `uploaded_avatar` \| `checked_in` \| `checked_out` \| `status_changed` \| `budget_updated` \| `stage_changed` \| `login` \| `logout` \| `registered` \| **`role_migrated`** (written only by the MANAGER→HR startup fixup; missing from this enum until 2026-09-07, so every one of those rows failed validation and was swallowed — the demotions happened, nothing recorded them) |
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

### `overtimeRequests` *(new collection)*
An employee applying to work overtime on a given date, or HR/a manager assigning it to them. Composes `reviewRequestBaseFields()` plus:

| Field | Type | Required | Notes |
|---|---|---|---|
| `date` | Date | ✅ | **UTC midnight, exactly like `attendance.date`** — the two join with no timezone conversion anywhere in between |
| `plannedStart` / `plannedEnd` | String | ✅ | `"HH:MM"`. `plannedEnd` additionally accepts `"24:00"`: spans may not cross midnight, so a rest-day shift running to the end of the day needs a representable end value |
| `plannedMinutes` | Number | ✅ | Whole **minutes**, min 1 — not fractional hours. Caps are accumulated across many rows and float hours drift; minutes also match `attendance.otMinutes`, so nothing converts at the join. Hours are derived in the controller's mapper |
| `origin` | String | — | `self` (the employee applied) \| `assigned` (HR/a manager assigned it). Default `self` |
| `dayType` | String | ✅ | `normal` \| `restDay` \| `holiday` — **snapshotted at create time**, not derived on read, so adding or removing a `holidays` row for that date afterwards cannot silently change the rate that applied at approval |
| `reason` | String | — | Default `""` |
| `appliedAt` | Date | — | Default `now` |

> Indexes: `{ employee, date }`, `{ employee, status }`, plus a **partial unique** index `one_live_request_per_employee_per_date` on `{ employee, date }` filtered to `status ∈ { pending, approved }`.

The partial filter is what allows a *rejected* request to be resubmitted for the same date — the normal path after HR rejects one. The controller pre-checks the duplicate for a clean error message; the index is what makes it true under concurrency. (`partialFilterExpression` uses `$in`, not `$ne` — MongoDB rejects `$ne` in a partial index filter.)

Business rules live outside the schema: the 10-step validation in `controller/overtimeRequestController.js` and the rate engine in `utils/overtimeRate.js` (Art. 98 day-type multipliers, night premium, and the 4h/day · 40h/month · 200h/year caps).

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
One record per employee per period — the actual VN payroll math (progressive PIT brackets, BHXH/BHYT/BHTN) runs against this, not a live salary lookup. Overtime is **persisted here rather than recomputed on read**, because every recompute path (HR adjustments, deduction recalculation) has to carry overtime forward without going back to the attendance records.

| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | |
| `period` | ObjectId | ✅ | Ref → `payrollPeriods` |
| `employee` | ObjectId | ✅ | Ref → `employees` |
| `employeeCode` / `employeeName` / `departmentName` / `designation` / `contractType` | String | — | Snapshotted at generation time |
| `departmentId` | ObjectId | — | Ref → `departments` |
| `annualSalaryUsd` | Number | — | |
| `baseSalary` / `bonus` / `allowance` / `deduction` | Number | ✅ | `bonus` seeds `0` at draft generation; set manually per employee via the payroll adjustment endpoint. Automatic KPI-driven bonus calculation was scoped and then explicitly removed (product decision, 2026-08-23) — see `HRMS_IMPROVEMENT_TASKS.md` §3.4 |
| `overtimeHours` / `overtimeNightHours` | Number | — | **New (Overtime M5).** Derived from minutes for display |
| `overtimePay` | Number | — | **New.** A dedicated payslip line, not folded into `bonus` |
| `overtimeBreakdown` | Object | — | **New.** Per-day-type buckets `{ normal, restDay, holiday }`, each `{ dayMinutes, nightMinutes, pay }` — so a slip can show "150% × 4h · 200% × 10h · 270% × 2h" rather than one opaque figure |
| `overtimeTaxExempt` | Boolean | — | **New.** Default `true`. Records the policy in force when the slip was computed, so a later change to `OT_PIT_EXEMPT` cannot silently reinterpret a historical slip |
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

### `pushSubscriptions` *(new collection)*
One row per **browser**, not per user — which is exactly why Web Push cannot live in `User.notify` alongside the email and Telegram flags. A subscription is minted by one browser on one device and is meaningless anywhere else; someone with a laptop and a phone has two rows, and revoking one must not touch the other.

| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | |
| `user` | ObjectId | ✅ | Ref → `users`, indexed |
| `endpoint` | String | ✅ | **Unique — this is the identity**, not `(user, device)`. The push service's URL for this device; re-subscribing the same browser returns the same endpoint, which is why the write path upserts on it rather than inserting |
| `keys.p256dh` / `keys.auth` | String | ✅ | Encryption keys from the browser's subscription |
| `userAgent` | String | — | Display only ("Chrome on Windows"); never used for routing |
| `lastSuccessAt` | Date | — | |
| `failureCount` | Number | — | Climbs on **soft** failures. A 410/404 does not increment it — that deletes the row outright, because the browser has said the subscription is dead rather than merely unreachable |

### `rolePermissions` *(new collection)*
A second gate on top of `authorize()`'s coarse role-set check — one row per `(role, capability)`, toggleable by ADMIN in Settings.

| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | |
| `role` | String | ✅ | Enum is **`MANAGER` only** |
| `capability` | String | ✅ | `approveLeaveRequests` \| `reviewProfileEdits` \| `manageAttendanceRecords` \| `proposePromotions` \| `approveOvertimeRequests` (`MANAGER_CAPABILITIES` in `utils/permissions.js`) |
| `enabled` | Boolean | — | Default `true` |

> Unique compound index: `{ role: 1, capability: 1 }`

This can only ever make a role **stricter** than `authorize()` already allows, never grant anything wider — hence the single-value `role` enum: ADMIN is always full access, and EMPLOYEE/HR are already excluded by `authorize()` on every capability-gated route. Rows are seeded at startup for any capability added later, defaulting to enabled.

### `telegramLinkCodes` *(new collection)*
The short-lived code that ties a Telegram chat to an HRMS account.

| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | |
| `code` | String | ✅ | Unique, uppercase, 6 characters from an **unambiguous alphabet** — no `O`/`0`, `I`/`1` or `5`/`S`, since the code is read off a screen and retyped on a phone. Cryptographically random (`node:crypto`), because it is a bearer credential |
| `user` | ObjectId | ✅ | Ref → `users` |
| `expiresAt` | Date | ✅ | 10-minute TTL |

> TTL index: `{ expiresAt: 1 }` with `expireAfterSeconds: 0` — Mongo sweeps expired codes itself, so a stale code cannot be redeemed even if the redeem path forgets to check. That check still exists; the index is the backstop, not the rule.

In Mongo rather than an in-memory `Map` on purpose: linking spans two systems and a human, and a free-tier host sleeping between "code shown in Settings" and "code typed into Telegram" would silently invalidate every code in flight.

---

## Enum Reference

| Collection.Field | Values |
|---|---|
| `users.role` | `ADMIN`, `HR`, `MANAGER`, `EMPLOYEE` |
| `users.language` | `en`, `vi` |
| `employees.gender` | `male`, `female`, `other` |
| `employees.documents[].type` | `offer_letter`, `id_scan`, `other` |
| `employees.contractType` | `full-time`, `part-time`, `contract`, `intern` |
| `employees.positionLevel` | `Intern`, `Full-time`, `Senior`, `Manager` |
| `employees.status` | `active`, `on-leave`, `terminated` |
| `attendance.status` | `present`, `late`, `on-leave`, `absent`, `no-show` |
| `attendance.lateHalfDayType` | `annual`, `unpaid`, `null` |
| `attendance.otDayType` | `normal`, `restDay`, `holiday`, `null` |
| `attendance.otEvidence` | `clocked`, `planned`, `manual`, `null` |
| `jobs.status` | `open`, `filled`, `closed` |
| `jobs.type` | `full-time`, `part-time`, `contract`, `intern` |
| `candidates.stage` | `applied`, `screening`, `interview`, `offer`, `hired`, `rejected` |
| `holidays.type` | `public`, `company`, `optional` |
| `notifications.audience` | `all`, `employees`, `hr` |
| `notifications.category` | `leave`, `overtime`, `hiring`, `payroll`, `employee`, `holiday`, `system`, `announcement`, `performance` |
| `auditlogs.action` | `created`, `updated`, `deleted`, `uploaded_avatar`, `checked_in`, `checked_out`, `status_changed`, `budget_updated`, `stage_changed`, `login`, `logout`, `registered`, `role_migrated` |
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
| `overtimeRequests.dayType` | `normal`, `restDay`, `holiday` (`OT_DAY_TYPES`) |
| `overtimeRequests.origin` | `self`, `assigned` (`OT_ORIGINS`) |
| `rolePermissions.role` | `MANAGER` (only — see the collection note) |
| `rolePermissions.capability` | `approveLeaveRequests`, `reviewProfileEdits`, `manageAttendanceRecords`, `proposePromotions`, `approveOvertimeRequests` (`MANAGER_CAPABILITIES`) |
| `leaveRequests`/`noShowReviews`/`overtimeRequests`/`promotionRequests`/`profileEditRequests` `.status` | `pending`, `approved`, `rejected` (shared `REVIEW_STATUSES`) |

`OT_LIVE_STATUSES` (`pending`, `approved`) is the subset of the shared review statuses that "occupies" a date — it is what the partial unique index on `overtimeRequests` filters on.
