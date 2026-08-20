# Performance Reviews — API Contract

**Status:** Frozen for Milestone 1–4. Revised after tracing the actual backend — the first draft contained several statements that could not be implemented against this repo; each is called out inline under **Correction** so the reasoning survives.
**Companion to:** `PERFORMANCE_REVIEWS_TASK_SPLIT.md` (the plan/ordering).
**Owners:** frontend — `cuonghoangwork` · backend — `hoangquan14727`.
**Convention:** paths mounted under `/api/v1`, same as every other resource; role gating via the existing `authorize(...)` middleware; department scoping via the existing `utils/managerScope.js`.

> **Read §0 first.** It contains the two decisions most likely to break the frontend if either side guesses wrong.

---

## 0. The two things that will break the integration if you skip them

### 0.1 `employeeId` means the Mongo `_id`, everywhere in this feature

This repo currently uses the name `employeeId` for **two different things**:

| Where | What `employeeId` holds |
|---|---|
| `utils/mappers.js:116` (`employeeToClient`) | the business code, `"EMP001"` |
| `controller/authController.js:199` (`GET /auth/me`) | the Mongo `_id` |
| `utils/mappers.js:318` (`attendanceToClient`) | the Mongo `_id` |

The frontend takes a roster row and puts its identifier into `/reviews/:cycleKey/:employeeId`. Picking the wrong one breaks every review link on the page.

**Frozen:** in this feature, `:employeeId` in a URL and `employeeId` in a payload are always the **Mongo `_id` as a string**. This matches `GET /auth/me` and the existing `employees/:id` route that `SideMenu.jsx` already feeds with `user.employeeId`. The business code is exposed separately as **`employeeCode`** and is display-only.

### 0.2 `GET /performance/cycles` returns *all* cycles, not three

"A rolling window of 2 closed + 1 open" describes what the server **generates**, not what the list endpoint **returns**. Old cycles are never deleted — a review from two cycles ago must stay reachable. The list grows by two entries per year, plus any custom cycles.

**Do not build a fixed three-item cycle selector.** Render whatever the endpoint returns, newest first.

---

## 1. Models

### `PerformanceCycle`
```
{
  _id,
  key: String (unique),        // standard: "2026-h1" | custom: "custom-<ms>"
  label: String,               // standard: "H1 2026" | custom: admin-supplied
  kind: "standard" | "custom",
  status: "Open" | "Closed",
  start: Date | null,
  end: Date | null,
  statusOverriddenAt: Date | null,
  createdBy: ObjectId(User) | null,
  createdAt, updatedAt
}
```

**Date basis is UTC, without exception.** H1 = `Jan 1 00:00:00.000Z` → `Jun 30 23:59:59.999Z`; H2 = `Jul 1 00:00:00.000Z` → `Dec 31 23:59:59.999Z`. "Which half is it now" is derived from a UTC date key, never from `new Date().getMonth()`. (This repo has a history of local-vs-UTC midnight bugs — `utils/payrollPeriod.js` exists largely to paper over one.)

**How standard cycles come into existence.**

> **Correction — draft said:** *"generated server-side (a small startup/cron job, same pattern as `utils/startupMigrations.js`)"*.
> That is not implementable here, for two independent reasons. `runStartupMigrations` is gated behind a single marker key in a `_migrations` collection (`utils/startupMigrations.js:38-39`), so the whole batch runs **exactly once, ever** — a window that must advance every six months structurally cannot live there. And a cron would not fire either: the deployed service sets `ENABLE_SCHEDULER=false` (`jobs/index.js:99`).

An idempotent `ensureStandardCycles()` upsert in `utils/performanceCycles.js` is invoked lazily at the top of `GET /performance/cycles`, and by the cycle lookup that every other endpoint goes through. No startup migration, no cron. A consequence worth stating: **a GET writes.** It is two small bulk writes over exactly three documents, and in exchange the cycle window is correct immediately after a restart and on a completely empty database.

**`statusOverriddenAt` — how a manual open/close survives regeneration.** The computed status is applied **only on insert**, and thereafter **only while `statusOverriddenAt === null`**. `PATCH /performance/cycles/:key` stamps it whenever the status actually changes. Once stamped, the generator can never touch that cycle's status again: an admin who reopens `2026-h1` keeps it open. Custom cycles are never auto-closed at all — their lifecycle is entirely admin-driven, so a custom cycle whose `end` is in the past stays `Open` until someone closes it.

A `PATCH` that sets the status to the value it already has is a **no-op**: no stamp, no audit row, no notification, and it returns 200 with the cycle unchanged. Otherwise a stray click on "Open" for an already-open cycle would silently pin it open forever, which is not what the click means.

### `PerformanceReview`
```
{
  _id, cycleKey: String, employee: ObjectId(Employee),

  selfRating: 1-5 | null, selfComments: String, selfSubmittedDate: Date | null,

  managerRating: 1-5 | null, managerComments: String, managerSubmittedDate: Date | null,
  managerReviewedBy: ObjectId(User) | null,

  competencies: {                       // fixed 6 keys, always all present
    communication: { self: 1-5|null, manager: 1-5|null },
    execution: {...}, ownership: {...}, collaboration: {...},
    leadership: {...}, problemSolving: {...}
  },

  goals: [ { id, text, progress: 0-100 step 10 } ],
  peerFeedback: [ { id, name, relation, comments, addedAt, addedBy? } ],

  appeal: {
    reasonCategory: "rating_low"|"inaccurate"|"process"|"other",
    detail: String, status: "Pending"|"Resolved", filedDate: Date,
    resolution: "Upheld"|"Adjusted"|null, resolvedRating: 1-5|null,
    resolverNote: String, resolvedDate: Date|null,
  } | null,

  createdAt, updatedAt
}
```

One document per `(cycleKey, employee)` pair, unique-indexed.

**`competencies` is a fixed-key nested object** — not an array, not a Mongoose `Map`. That makes a single competency write one atomic `$set` on `competencies.<key>.<rater>`, which cannot clobber the other rater's value.

**Subdocument identity.** `goals[]` and `peerFeedback[]` are the first embedded subdocument arrays in this codebase, so the convention is set here: the client sees **`id`** (a 24-char hex string), and **`_id` is never present in the payload** — matching the top-level `_id` → `id` rule every other resource follows. `goalId` in a URL is that `id`. It is *not* the demo's `"goal-" + Date.now()` format.

**`peerFeedback[].addedBy` is returned to ADMIN/HR only.** Peer feedback deliberately carries a freeform `name`; handing the real author's user id to the subject would defeat that. The field is always stamped server-side, so it is auditable regardless.

**Server-owned, read-only, never accepted from the client:** `selfSubmittedDate`, `managerSubmittedDate`, `managerReviewedBy`, `goals[].createdBy`, `peerFeedback[].addedBy`, `peerFeedback[].addedAt`, `appeal.filedDate`, `appeal.filedBy`, `appeal.status`, `appeal.resolvedDate`, `appeal.resolvedBy`. Sending any of them is silently ignored.

**Lazy creation, and what a GET does.** The document is created on first *write*. `GET /performance/reviews/:cycleKey/:employeeId` **never writes**: when nothing exists it returns the byte-identical shape with `id: null` and schema defaults (all six competencies present as `{self: null, manager: null}`, `goals: []`, `peerFeedback: []`, `appeal: null`). `id: null` is the client's "nothing persisted yet" signal. The client never sends a review id back — **every write route addresses the review by `(cycleKey, employeeId)`**.

**There is no draft save.** `PATCH .../self` requires `selfRating` and stamps `selfSubmittedDate`. Calling it again is a legitimate overwrite and moves the date. Do not build a "Save draft" button that expects a separate endpoint.

### Shared constants — backend-owned, served by `GET /performance/meta`

```
ratingOptions            [1,2,3,4,5]
ratingLabels             {"1":"Needs improvement","2":"Developing","3":"Meets expectations",
                          "4":"Exceeds expectations","5":"Outstanding"}
competencies             ["communication","execution","ownership","collaboration","leadership","problemSolving"]
competencyLabels         {communication:"Communication", ...}
reviewStatuses           ["Not started","Self submitted","Manager submitted","Completed"]
appealReasonCategories   ["rating_low","inaccurate","process","other"]
appealResolutions        ["Upheld","Adjusted"]
appealWindowDays         14
goalProgressStep         10
```

Note `ratingLabels` keys serialize as **strings** in JSON.

The frontend fetches this once per session and renders from it. The point is to stop the pattern this repo already has, where the same enum is hardcoded on both sides and drifts — `hrms-react/src/utils/leaveTypes.js` is a verbatim copy of `hrms-backend/model/LeaveRequest.js`'s three constants, allowance numbers included, and says so in its own header. Do not add a third copy here.

---

## 2. Endpoints

All under `/api/v1/performance`. Every route requires a valid token.

**Envelope:** lists return `{success: true, items: [...]}`, single documents return `{success: true, data: {...}}`. That is the house convention (`utils/reviewQueue.js:175`), not a stylistic choice.

| # | Method & path | Who (router gate) | Body | Returns |
|---|---|---|---|---|
| 1 | `GET /meta` | any authenticated | — | `data` = the constants block above |
| 2 | `GET /cycles` | any authenticated | — | `items: [PerformanceCycle]`, newest first. **All cycles — see §0.2** |
| 3 | `POST /cycles` | ADMIN | `{label, start, end}` | `201 data`, `kind:"custom"`, `status:"Open"`, key generated server-side |
| 4 | `PATCH /cycles/:key` | ADMIN | `{status:"Open"\|"Closed"}` | `data`; stamps `statusOverriddenAt` |
| 5 | `GET /cycles/:key/roster` | any authenticated | — | `{cycle, scope, items:[RosterRow]}` — role-scoped server-side |
| 6 | `GET /cycles/:key/analytics` | any authenticated | — | `{cycle, scope, data:{...}}` |
| 7 | `GET /reviews/:cycleKey/:employeeId` | any authenticated | — | `{cycle, data, permissions}` |
| 8 | `PATCH /reviews/:cycleKey/:employeeId/self` | any authenticated | `{selfRating, selfComments?}` | `data` |
| 9 | `PATCH .../manager` | MANAGER, HR, ADMIN | `{managerRating, managerComments?}` | `data` |
| 10 | `PATCH .../competencies` | any authenticated | `{key, value}` | `data` |
| 11 | `POST .../goals` | any authenticated | `{text, progress?}` | `201 data` |
| 12 | `PATCH .../goals/:goalId` | any authenticated | `{progress}` | `data` |
| 13 | `POST .../peer-feedback` | any authenticated | `{name, relation?, comments}` | `201 data` |
| 14 | `POST .../appeal` | any authenticated | `{reasonCategory, detail}` | `201 data` |
| 15 | `PATCH .../appeal` | HR, ADMIN | `{resolution, resolvedRating?, resolverNote}` | `data` |

The router gate is only the coarse filter. Ownership, department and cycle-state checks all happen in the controller, because they need the target employee and the cycle.

### 2.1 Who counts as "this employee's manager"

> **Correction — draft said:** *"HR when the employee is an 'orphan manager' (no manager above them — check via `Department.manager`/org lookup)"*.
> Not implementable. `Employee` has no `manager` or `reportsTo` field and there is no org-structure data anywhere in the schema. `Department.manager` is an optional ObjectId that is **`null` for all seven seeded departments** and is only ever populated by best-effort case-insensitive *name* matching (`utils/refResolvers.js:35-41`) — the seed does not even attempt it, and six of its seven `managerName` values match no employee at all. Implementing the draft literally would make nobody a department head, i.e. **everybody** an orphan.

**Frozen rule.** Employee X's manager is any User with `role === "MANAGER"` whose resolved Employee (`User.employee`, falling back to an email match — the existing `resolveEmployeeForUser` precedence) is in the same `Employee.department` as X.

**X is an "orphan manager"** when that set, minus X's own account, is empty. That covers three cases with one query: X is the sole MANAGER of their department; X's department has no MANAGER at all; X has no department.

Who may submit the manager review:

| Role | May submit manager review for X |
|---|---|
| ADMIN | always (X ≠ self) |
| MANAGER | when X is in the same department (X ≠ self) |
| HR | only when X is an orphan manager |
| EMPLOYEE | never |

**Nobody may submit their own manager review**, ADMIN included. An ADMIN who is themselves an orphan manager needs a second ADMIN or an HR user to fill theirs in.

**What this looks like against seeded data:** `manager@hrms.com` is the only MANAGER-role account and sits in Engineering, which contains two people. So the only real manager path you can click through is that account reviewing John Doe. **Every other seeded employee is an orphan**, and HR/ADMIN files their manager review. That is correct behaviour, not a bug — but it looks like "HR can review everyone", so say so in any demo.

### 2.2 Roster row and scoping

```js
{
  employeeId,      // Mongo _id string — this is what goes in the review URL (§0.1)
  employeeCode,    // "EMP001", display only
  name, department, departmentId,
  selfRating, managerRating, selfSubmittedDate, managerSubmittedDate,
  status,          // one of reviewStatuses
  hasAppeal, appealStatus,
}
```

Scoping is decided server-side from the token. **Do not send a scope parameter; one would be ignored.**

- ADMIN / HR → everyone
- MANAGER → their own department. This already includes their own row, because a manager's Employee record is in their own department — **it is a single filter, not a union of "self + reports"**. Do not add a special case for it.
- EMPLOYEE → themselves only. An account not yet linked to an Employee record gets an **empty roster with 200**, not an error.

Employees with `status: "terminated"` are excluded from the roster. Their historical review stays readable at its direct URL for anyone allowed to view it.

The roster is **not paginated**. Not an oversight — adding it now would diverge from what the frontend is building. If it becomes necessary, it goes in this document first.

`scope` in the envelope is `"all" | "department" | "self"`, so the frontend can label the view honestly.

### 2.3 The `permissions` object (endpoint 7)

`GET /reviews/:cycleKey/:employeeId` returns, alongside `data`:

```js
permissions: {
  canEditSelf, canEditManager,
  canEditCompetencySelf, canEditCompetencyManager,
  canAddGoals, canAddPeerFeedback,
  canFileAppeal, canResolveAppeal,
}
```

**This is required, not a convenience.** The frontend cannot compute `canEditManager` on its own: deciding it needs the orphan-manager query from §2.1, which needs per-department MANAGER-user data the client never receives. The demo's client-side `canEditSelf` / `canEditManager` were guesses that happened to work on fixture data.

The payload also carries **`appealDeadline`** — a `YYYY-MM-DD` UTC date key, or `null` when `managerSubmittedDate` is null — so a countdown rendered client-side cannot disagree with what the server will accept.

### 2.4 Competencies — rater is inferred, never sent

The caller's relationship to the subject decides which half of the pair is written: **self review if the caller is the subject, manager review otherwise** (guarded by §2.1). A `rater` field in the request body is **silently ignored**; a test asserts it. The draft flagged this as the demo's real security gap, and it stays closed.

The `{key, value}` shape is one round-trip per rating, which is right for the demo's 5-dot rows that fire on click. If a batched "Save review" button is wanted later, propose the shape here before either side builds it.

### 2.5 Goals

`progress` is server-enforced as a whole number **0–100 in steps of 10**. **The slider must be `step={10}`** or a valid-looking drag will 400. `progress: 0` is a legitimate value and is accepted. Only the subject employee may add or update their own goals.

### 2.6 Appeals

The 14-day window is measured from `managerSubmittedDate` in **whole UTC calendar days, inclusive of day 14**: allowed while `0 ≤ (utcDay(now) − utcDay(managerSubmittedDate)) ≤ 14`. A rating submitted at any time on 2026-08-20 UTC is appealable through the end of 2026-09-03 UTC.

Explicitly **not** a millisecond delta — that would let a manager submitting at 23:50 silently shorten the window to about thirteen days, and would make a date-only client countdown disagree with the server. A `managerSubmittedDate` in the future (clock skew, hand-seeded data) is rejected.

One appeal per review; a second attempt is a 409. Resolving is once-only; a second attempt is a 409. `resolution: "Adjusted"` requires `resolvedRating` and **overwrites `managerRating`**; `"Upheld"` leaves it untouched and must not carry a `resolvedRating`.

**Appeals are not gated on cycle status**, since a 14-day window measured from a submission date routinely outlives its cycle.

### 2.7 Peer feedback

Addable by anyone who can *view* the review (ADMIN, HR, the department manager, or the subject). Following the table as frozen, it is **not** gated on cycle status — flagged here as the one row where that may have been an omission rather than a decision. Say so if you want it gated and it is a one-line change.

A consequence that looks like a bug and is not: **an employee can add peer feedback to their own review under any freeform `name`.** That is the demo's model, kept deliberately — `addedBy` is stamped server-side and visible to ADMIN/HR, so it remains auditable.

### 2.8 AI insight

`POST /reviews/:cycleKey/:employeeId/ai-insight` is **Milestone 5 and out of scope** for this backend delivery. No LLM provider is integrated in this repo today and there is no HTTP client dependency, so the provider and API-key decision has to land before the milestone starts. The seam is already in place: the permission check that endpoint needs is the same one endpoint 7 uses, and the review payload is the object the prompt would be built from.

Build the button and its loading/error states against a stub so the frontend is not blocked.

---

## 3. Errors

`{ success: false, message: String }`, with `error.status` propagated to the HTTP status code. (A recent leave-request commit specifically fixed four places that hardcoded the status instead of propagating it — do not reintroduce that.)

| Code | Means |
|---|---|
| 400 | bad body; malformed `:employeeId` / `:goalId`; appeal filed outside the window or before any manager review |
| 401 | no/invalid token |
| 403 | you are not this employee, not their manager, or not in their department |
| 404 | cycle, employee, review or goal not found |
| 409 | the cycle is **Closed**; an appeal already exists; an appeal is already resolved |

**Cycle-Closed is 409, not 403** — the caller is authorized, the resource is in the wrong state. Same code the existing review queue uses for "already reviewed".

**Appeal-window and no-manager-review failures are 400, not 403** — the caller is permitted; the data is not ready. 403 stays reserved for identity.

`:employeeId` and `:goalId` are validated as ObjectIds in the controller before any query. Without that a malformed id produces a Mongoose CastError, which the `error.status || 500` fallback would turn a plain client error into a 500.

Multiple body validation failures come back joined into one message with `"; "`, matching every other validator in this backend.

---

## 4. Backend changes the frontend needs to match

Two closed enums are being extended. Neither is breaking; both leave a cosmetic gap until the frontend side lands.

1. **`Notification.category` gains `"performance"`.** Review notifications are emitted with `category: "performance"`, `link: "/performance"`, `linkLabel: "Open review"`.

   > **Correction — the task-split doc said** the backend would emit `link: {route: 'performance'}`. It cannot: `Notification.link` is `{type: String, default: null}` and `Notifications.jsx:150` calls `navigate(notification.link)` directly. An object would break it. It is a plain relative path string, exactly like the existing `"/payroll"` and `"/attendance"` links.

   **Frontend to do:** add a `performance` entry to `CATEGORY_CONFIG` in `hrms-react/src/pages/Notifications.jsx` and a `notifications.categories.performance` string to `en.json` / `vi.json`. Without it the notification still renders — line 266 falls back to the system config — but it wears the generic system chip and **no "Performance" filter chip appears at all**, because the chip list is derived from `CATEGORY_CONFIG`'s keys.

   Also worth knowing on the backend side: `audience: "hr"` reaches **ADMIN and HR only**, not MANAGER (`notificationController.js:7-9`). Manager-directed notices are therefore fanned out as individual rows per department manager. Notifications fire only on the **first** submission of a self or manager review, not on every subsequent overwrite.

2. **`AuditLog.resource` gains `"performance"`.** Actions reuse the existing `created` / `updated` / `status_changed` verbs, so the action enum and `buildTitle()` are untouched. `RESOURCE_CATEGORY` in `auditLogController.js` maps `performance → "employee"` for now; it flips to `performance → "performance"` in the same change that lands `CATEGORY_CONFIG.performance`.

   Cycle creation, cycle status changes, self reviews, manager reviews, appeals filed and appeals resolved are audited. Competency, goal and peer-feedback writes are **not** — they would bury the log under per-click noise, and `GET /audit-log/recent` is readable by any authenticated user.

3. **A new route `/performance` must exist in `App.jsx`** or the notification deep link dead-ends.

---

## 5. Notes on the first draft

Kept here so nobody re-derives them.

- The draft cited `HRMS_REPO_SUMMARY_AND_IMPROVEMENTS.md` (#12) as the source of the shared-enum drift problem, and the task-split doc cited `HRMS_TASK_SPLIT_2PEOPLE.md`, `DECISION_2.6_Manager_Level.md` and `HRMS_SPRINT_PLAN.md`. **None of those four files exists** in the working tree or anywhere in git history. The drift problem itself is real and is documented with live examples in §1 above.
- The referenced source demo, `HTML demo/HRMS Navy Signal Blue.dc.html`, is also not in the repo.
- Open item "goal/peer-feedback IDs" is settled in §1: Mongo subdocument `_id`, surfaced as `id`.
- Open item "appeal window boundary" is settled in §2.6: inclusive, whole UTC calendar days.
- Open item "orphan manager detection" is settled in §2.1.
- Open item "AI provider + API key location" remains open and is deferred with Milestone 5.
