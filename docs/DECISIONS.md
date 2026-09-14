# Decisions

The product and design rules the code enforces, in one place. Source comments
reference these by ID (`DECISIONS.md D5`) instead of restating them, and the
planning documents that originally held them are not in this repository.

Each entry is the **rule as currently enforced** plus where it lives. When a
rule changes, change it here and in the code in the same commit.

---

## D1 — Position ladder is tenure math, and "Manager" is a pay grade

`positionLevel` (`Intern → Full-time → Senior → Manager`) is personal
seniority / pay grade. It is independent of `contractType` (a part-time
Senior is valid) and of `Department.manager` — nothing joins the two.

Eligibility for the next level is purely months in the current level, from
`levelStartDate`:

| Level | Next | After |
|---|---|---|
| Intern | Full-time | 2 months |
| Full-time | Senior | 48 months |
| Senior | Manager | 60 months |
| Manager | — | never |

No department-capacity or "open slot" logic. `levelStartDate` resets on an
approved level change; a rejected proposal does not reset it.

Code: `utils/positionLadder.js`, `model/PositionLevel.js`, `model/Employee.js`.

## D2 — Automated checks flag, they never act

Every scheduled sweep that finds something creates a **pending** review
request for a human; none changes an employee record directly:

- Promotion eligibility (D1) → pending `PromotionRequest`, at most **once per
  level transition, ever** — a rejected flag must not re-fire daily.
- Annual raise → pending `PromotionRequest` with `proposedPositionLevel: null`
  and a +10 % `proposedAnnualSalary`, once per service anniversary.
- Repeated no-shows → pending `NoShowReview` each time the all-time no-show
  count grows by another 5 since the last flag. Never touches
  `Employee.status`.

Code: `jobs/checkPromotionEligibility.js`, `jobs/annualSalaryRaise.js`,
`jobs/closeAttendanceDay.js` (`flagRepeatedNoShows`).

## D3 — Leave types and balances

Five types. Four are capped per employee per calendar year; `unpaid` is not.

| Type | Days / year |
|---|---|
| annual | 12 |
| sick | 10 |
| parental | 90 |
| bereavement | 5 |
| unpaid | uncapped |

Rules enforced at submission (`leaveRequestController.create`):
- A capped request that would exceed the remaining balance is rejected —
  the employee picks `unpaid` or splits the range.
- **Pending requests count against the balance**, not only approved ones,
  so two concurrent requests cannot both fit under the cap.
- Same-day leave must be submitted before 09:00 — currently on the **host**
  clock (`new Date().getHours()`), which on Render is UTC, i.e. 16:00 ICT.
  Not yet routed through `APP_TIMEZONE` (D10); known gap.
- Only weekdays count as leave days; approval upserts an `on-leave`
  attendance row for each of them.

Code: `model/LeaveRequest.js` (`LEAVE_TYPE_ALLOWANCES`), `utils/leaveBalance.js`.

## D4 — Attendance day close

The nightly close (23:00 app time, driven by GitHub Actions — see D11) does,
in order:

1. **Auto check-out** every open `present`/`late` row at `WORKDAY_END`
   (18:00), or at the approved overtime shift's `plannedEnd` (D5). Runs on
   rest days and holidays too — that is when rest-day overtime closes.
2. **Late**: check-in after `WORKDAY_LATE_AFTER` (09:15) marks the day
   `late` and deducts **half a day of annual leave**, or is recorded as
   `unpaid` once the annual balance is below 0.5.
3. **No-show**: every active employee with no attendance row and no pending
   or approved leave covering the day gets a `no-show` row.
4. Repeated no-shows are flagged (D2).

Steps 2–4 are skipped on weekends and holidays; step 1 is not.

`no-show` and `absent` are different statuses: `absent` is entered by HR
and is the only one payroll deducts for (D9). A no-show costs nothing until
a human reviews it.

Code: `jobs/closeAttendanceDay.js`, `utils/workday.js`.

## D5 — Overtime

Statutory limits from Bộ luật Lao động 2019 (Art. 98, 107) and Decree
145/2020 (Art. 57). Env overrides may lower them, never raise them.

| Limit | Value |
|---|---|
| Per normal working day | 4 h (18:00–22:00) |
| Per rest day / holiday, total work | 12 h |
| Per month | 40 h |
| Per year | 200 h (300 h sector rule not modelled) |

Pay multipliers on the hourly rate (monthly salary ÷ standard working days ÷ 8):

| Day type | Day | Night (from 22:00) |
|---|---|---|
| normal | 1.5× | 2.1× |
| restDay | 2.0× | 2.7× |
| holiday | 3.0× | 3.9× |

Rules:
- On a normal day overtime starts at 18:00 and stops at 22:00, so the night
  premium is only reachable on rest days and holidays.
- On a rest day or holiday there is no normal shift: the whole worked span is
  overtime, and the cap is the 12 h total-work limit.
- A shift is priced by the `dayType` **snapshotted on the request** at
  creation. Adding a Holiday row later does not reprice an approved shift.
- Only an **approved** request is paid or counted against the caps. Time
  worked past the boundary with no approval is recorded as
  `otUnapprovedMinutes` — visible, never paid, never counted.
- Clock evidence beats the plan: if the employee clocked out (`rawCheckOut`)
  the credited span ends there; otherwise it ends at `plannedEnd` and is
  marked `otEvidence: "planned"`.
- Applications close at **13:00 app time on the overtime date**; 12:59 is
  the last acceptable minute. Applying in advance is always allowed.
  HR/Admin assignment is exempt from the cutoff (a role rule, checked in the
  controller, not in the cutoff helper).
- One live (pending/approved) request per employee per date.
- Overtime pay is PIT-exempt (Law 109/2025/QH15), switchable by
  `OT_PIT_EXEMPT`.
- Overtime is stored in whole **minutes**; hours are presentation only.

Code: `utils/overtime.js` (limits), `utils/overtimeRate.js` (pricing),
`utils/overtimeRecompute.js` (deriving minutes from an attendance row),
`utils/overtimeCutoff.js`, `controller/overtimeRequestController.js`.

## D6 — Review-queue pattern

Every "employee asks, someone decides" flow — leave, profile edit,
promotion, overtime, no-show review — shares one shape: the base fields
(`employee, requestedBy, status, reviewNote, reviewedBy, reviewedAt`), one
`list` and one `review` handler, and a per-type `onApprove` side effect
that runs **before** the status is written, so a failing side effect leaves
the request pending rather than approved-with-no-effect.

An employee may have only one pending request of a given type at a time.

Code: `utils/reviewQueue.js`.

## D7 — Which notifications may leave the app

An in-app notice costs the reader nothing; a phone buzz costs something, so
which categories may use push / email / Telegram is decided once, per
category, and **fails closed** — a category with no entry is in-app only.

| Category | Out-of-app channels |
|---|---|
| leave, performance, overtime | push, email, telegram |
| payroll | push, email |
| employee, hiring, holiday, announcement, system | none |

`overtime` gets the full set because of the 13:00 cutoff (D5): a reviewer
who does not see it before lunch cannot act at all. `system` (e.g.
"attendance closed") never leaves the app by any route — the same rule is
enforced client-side for desktop toasts in `hrms-react/src/utils/desktopNotify.js`.

A user's own preference can only narrow this table, never widen it.

Code: `utils/notifyPolicy.js`; the guard test is `tests/notifyPolicy.test.js`.

## D8 — One entry point for notifications; fan-out never fails the caller

`emitNotification()` in `utils/notify.js` is the only way a notification is
created. It propagates database write errors to the caller (every call site
already decides what a failure means there). Delivery fan-out (SSE, push,
email, Telegram) is fire-and-forget: it never throws and is never awaited,
so a dead socket or bounced email cannot fail the leave request that
triggered it.

Recipient resolution stays at the call site — the per-type audiences
genuinely differ (a promotion proposal goes to ADMIN only; leave goes to
manager + HR + ADMIN), and a manager can only be reached by an **addressed**
notification, never by an `hr` broadcast.

The SSE hub is process-local memory, which is correct for the single-instance
deployment. A second instance would need Mongo change streams or Redis
pub/sub behind the same `publish()` signature.

Code: `utils/notify.js`, `utils/sseHub.js`.

## D9 — Payroll

- Monthly periods move `draft → approved → paid`. The 1st-of-month job drafts
  the current month; the 10th-of-month job pays the **previous** month.
- Every payslip in a period is priced at one **VND-per-USD snapshot** taken
  once per month (`ExchangeRate`, unique on `{year, month}`). A failed FX
  fetch falls back to `DEFAULT_FX_RATE_VND_PER_USD` and records
  `source: "fallback"` — payroll must still run.
- Deductions: `unpaid` leave days and `absent` attendance days (not
  `no-show`, see D4). Statutory insurance (BHXH 8 %, BHYT 1.5 %, BHTN 1 %)
  is exempt once unpaid days in the month reach 14.
- A draft does not refresh itself when a salary changes; HR regenerates it.

Code: `utils/payrollEngine.js`, `utils/payrollGeneration.js`,
`utils/exchangeRate.js`, `jobs/generateMonthlyPayrollDraft.js`,
`jobs/runMonthlyPayroll.js`.

## D10 — Time and time zone

The company operates in `APP_TIMEZONE` (`Asia/Ho_Chi_Minh`, no DST). The
deployment container runs UTC, so time-of-day rules must not read the
host clock: attendance, overtime and payroll go through `Intl.DateTimeFormat`
with an explicit zone (`dateKeyInTz`, `hhmmInTz`). The same-day leave cutoff
(D3) is the one remaining exception. Attendance and holiday
dates are stored at UTC midnight of the calendar day.

Code: `utils/workday.js`, `utils/overtimeCutoff.js`, `utils/payrollPeriod.js`.

## D11 — Scheduled jobs run from GitHub Actions

The backend runs with `ENABLE_SCHEDULER=false` because Render's free tier
sleeps after ~15 minutes idle, which makes an in-process cron
non-deterministic. Every job has an ADMIN-only HTTP trigger and
`.github/workflows/scheduled-jobs.yml` is the scheduler (one job per cron
entry, times in UTC = ICT − 7 h). Every job is idempotent, so a replayed or
delayed run is a no-op.

Code: `jobs/index.js`, `.github/workflows/scheduled-jobs.yml`,
`.github/scripts/trigger-job.sh`.

## D12 — Role scope

`HR` and `ADMIN` are company-wide. `MANAGER` is scoped to their own
department for everything they list or act on (`utils/managerScope.js`),
and cannot rate themselves in a performance review — nor can anyone else,
including ADMIN (`utils/performanceScope.js`). Departments with no
`role: "MANAGER"` user are "orphan": HR reviews them.

Code: `utils/managerScope.js`, `utils/performanceScope.js`.
