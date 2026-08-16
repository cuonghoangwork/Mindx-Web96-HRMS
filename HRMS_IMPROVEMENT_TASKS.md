# HRMS Improvement Tasks — Master List

**Project:** MindX Web96 Capstone — HR Management System
**Source docs:** `HRMS improvement.txt` (v3/v4), plus follow-up discussion on Position Ladder and Eng/Vie language switch
**Status:** §0–§7 planning, §8–§9 (Navy Signal Blue redesign) shipped 2026-08. See §10 for what the redesign sprint deliberately cut.

This document is the single source of truth for what's being built next. Each task has a priority (High / Medium / Low) and a rough effort size (S / M / L). Tasks are grouped by feature area, with dependencies called out explicitly since several items share infrastructure (scheduler, Payroll model, review-queue pattern).

---

## 0. Shared Infrastructure (build once, reuse everywhere)

These aren't user-facing features on their own, but four other feature areas below depend on them. Build these first or alongside their first consumer.

| # | Task | Depends on | Priority | Effort |
|---|---|---|---|---|
| 0.1 | **Job scheduler** (e.g. `node-cron`) — backend currently has none | — | High | M |
| 0.2 | **Generic review-queue pattern** — generalize the existing `ProfileEditRequest` (submit → pending → HR approves/rejects → notification fires) so Leave Requests, Promotion Reviews, and No-show Reviews can reuse the same shape instead of three bespoke models | Existing `ProfileEditRequest` | High | S–M |
| 0.3 | **`PositionLevel` lookup model** (`level`, `baseSalary`, `department?`) | — | High | S |
| 0.4 | **Real `Payroll` model** — `employee`, `period`, `basicSalary`, `bonus`, `allowance`, `deductions`, `net`, `status: draft/approved/paid` | 0.3 (for basicSalary defaults) | High | M |

> **Decision confirmed:** Payroll moves from "computed live off `employee.salary`" to a real persisted model per pay period. The existing VN-tax math in `Payroll.jsx` (progressive PIT brackets, BHXH/BHYT/BHTN) becomes the **calculation engine** that runs against a `Payroll` record instead of against a live salary lookup. This is what finally gives the system real payroll history.

---

## 1. Employee — Account Model Flip

| # | Task | Priority | Effort | Notes |
|---|---|---|---|---|
| 1.1 | Remove/lock public self-registration (`Register.jsx` + `POST /auth/register`) | High | M | Architecture reversal — decide what happens to any already-registered self-service accounts before shipping. |
| 1.2 | HR/Admin creates account as part of `AddEmployee` flow (Name, Email, Employee ID required) | High | S | Fields already collected in the existing stepper; extend `employeeController.create` to *create* a `User`, not just link an existing one. |
| 1.3 | Auto-generate login credentials from Employee ID | High | S | Pattern already exists in `seed.js`. **Recommend forcing password reset on first login** rather than leaving the ID-derived password live indefinitely. |
| 1.4 | Employee can view own contract as PDF | Medium | M | Needs `Employee.contractUrl` (or a versioned `Contract` collection) + upload path (reuse Cloudinary avatar pattern) + a "My Contract" panel in Settings. |

---

## 2. Position Ladder

| # | Task | Priority | Effort | Notes |
|---|---|---|---|---|
| 2.1 | Add `Employee.positionLevel` (`Intern`/`Full-time`/`Senior`/`Manager`) **separate from** `contractType` | High | S | Conflating with `contractType` breaks representable states (e.g. part-time Senior). Two distinct fields required. |
| 2.2 | Add `Employee.levelStartDate` to track tenure-in-level | High | S | Needed so promotion timing is computed, not guessed from `createdAt`. |
| 2.3 | `PositionLevel` lookup: level → base salary (see 0.3) | High | S | Shared with Payroll — same table feeds both. |
| 2.4 | Scheduled promotion-eligibility check (Intern→FT @ 2mo, FT→Senior @ 4yr, Senior→Manager @ 5yr) | High | M | Uses shared scheduler (0.1). **Auto-flag for HR review, never auto-promote** — this changes salary and title, higher stakes than the no-show case below. |
| 2.5 | Promotion review queue (HR approves/rejects) | High | S | Reuse generic review-queue pattern (0.2) + `notifyHR()`. On approval: update `positionLevel` + `levelStartDate`, recalc salary off new base. |
| 2.6 | Resolve: does "Manager" level mean `Department.manager` (single ref per dept) or a title/pay-grade? | Medium | — | Decision only, no code — but must be settled before 2.5 ships, since `Department.manager` today can't hold multiple Manager-level employees. |

---

## 3. Payroll Rework

| # | Task | Priority | Effort | Notes |
|---|---|---|---|---|
| 3.1 | `Payroll` model (see 0.4) | High | M | Foundation for everything below. |
| 3.2 | Basic salary / bonus / allowance / deductions as distinct fields per pay period | High | S | Once 3.1 exists, this is just the schema. |
| 3.3 | Basic salary +10%/year, varies by position | Medium | M | Feeds off `PositionLevel` (2.3) — needs an annual increment job (uses 0.1). |
| 3.4 | Bonus rules: up to 40% of basic for Sales (KPI-based), fixed 10% for other positions | Medium | L | Requires KPI tracking, which doesn't exist anywhere today — the largest net-new subsystem in the whole list. |
| 3.5 | Payroll run on the 10th of each month, notify everyone | Medium | M | Uses shared scheduler (0.1) + `notifyHR()`/broadcast notification. |
| 3.6 | Manager/Admin manual payroll adjustment | High | S–M | Reuse the audit-log pattern already built for employees/departments. |
| 3.7 | Migrate `Payroll.jsx` display + CSV export to read from `Payroll` records instead of live `employee.salary` | High | M | UI rework once 3.1–3.2 are live; keep the existing VN PIT/BHXH/BHYT/BHTN math intact as the engine. |

---

## 4. Attendance & Leave

| # | Task | Priority | Effort | Notes |
|---|---|---|---|---|
| 4.1 | `LeaveRequest` model — 12 paid days/year, apply-by-9AM rule | High | M | Reuse generic review-queue pattern (0.2) — same shape as `ProfileEditRequest`. |
| 4.2 | Late = half-day paid or half-day unpaid leave | Medium | S | Business-rule addition to existing `resolveStatus()` logic. |
| 4.3 | Per-employee attendance log/report view | Low | S | Data already exists in `attendance` collection — this is a view/reporting task only. |
| 4.4 | Leave beyond 12 days → unpaid | Medium | S | Extension of 4.1's balance tracking. |
| 4.5 | 14+ unpaid days/month → tax/social-insurance exemption | Low | S | Depends on real `Payroll` model (3.1) existing first. |
| 4.6 | No-show status when no leave request filed | Medium | S | New derived status distinguishing "absent" from "absent, no request." |
| 4.7 | 5 no-shows → flag for HR review (**not** auto-terminate) | Medium | S | Deliberately changed from "auto-terminate" in the source doc — silently flipping employment status from a cron job is a liability. Auto-flag + notify only. |
| 4.8 | Notify Manager/Admin on flags above | High | S | Trivial — `notifyHR()` already exists and is used everywhere else. |

---

## 5. Jobs & Candidates

| # | Task | Priority | Effort | Notes |
|---|---|---|---|---|
| 5.1 | Expand `Job` fields: JD, requirements, pay/benefits, location, company info, application form, deadline | Medium | S–M | Additive schema change, no conflicts with current model. |
| 5.2 | Candidate count per job | — | — | **Already implemented** (`applicantCount` via `getApplicantCount`). |
| 5.3 | Real PDF CV upload for candidates | Medium | S–M | Extend existing Multer + Cloudinary avatar pattern to resumes (`resource_type: "raw"`). |
| 5.4 | HR accept/reject candidates | — | — | **Already implemented** via `stage` enum (`Hired`/`Rejected`) + `CandidateSidePanel`. |

---

## 6. Eng/Vie Language Switch

Current state: `LanguageContext.jsx` + `src/i18n/locales/en.json`/`vi.json` already exist and cover most of the app (confirmed during the Navy Signal Blue sprint's pre-work audit, 2026-08) — this section is **substantially further along** than "from scratch" implied below when it was first written.

| # | Task | Priority | Effort | Notes |
|---|---|---|---|---|
| 6.1 | Install `react-i18next`, add `LanguageContext` | High | S | **Done.** Same persistence pattern as `ThemeContext`. |
| 6.2 | Extract strings — Tier 1: Dashboard, Attendance, Settings, Notifications | High | M | Largely done via existing locale files; re-verify coverage after the redesign sprint's new UI (Org Chart, Candidates Kanban, Employee Detail tabs, self-service Dashboard) — those were built in this sprint without translation-key extraction and are currently English-only. |
| 6.3 | Extract strings — Tier 2: Payroll, Jobs, Candidates, AllEmployees, Departments | Medium | L | Re-verify same as above. |
| 6.4 | Vietnamese translations | High | M | Requires a fluent translator. Must stay consistent with existing correct terms (BHXH/BHYT/BHTN) already in the payroll module — don't re-translate those. |
| 6.5 | Backend error-message translation or error-code refactor | Medium | M | Controllers currently return hardcoded English strings (e.g. `"Employee not found."`). Either translate server-side or move to error codes the frontend maps to translated strings. |
| 6.6 | Locale-aware date/number formatting | Medium | S | Several pages hardcode `toLocaleDateString("en-US", ...)` — needs to switch with language. |

**Scope note:** despite looking like a small settings toggle, this is one of the larger items on the whole list in raw string-touching volume — bigger than the Payroll rework in file-count terms, even though each individual change is trivial.

---

## 7. v4 — Major Add-ons

| # | Task | Priority | Effort | Notes |
|---|---|---|---|---|
| 7.1 | Redesign pages to be less generic | Medium | L | **Done** — see §8/§9 (Navy Signal Blue redesign, shipped 2026-08). |
| 7.2 | In-house chat (Zalo-style) | Low | L | Flagged as disproportionate — real-time infra (WebSockets, persistence, presence) unrelated to core HR domain logic. Treat as stretch/optional. |
| 7.3 | AI-assisted employee review generation | Medium | M | Feasible, good demo value, no new infra beyond an LLM API call. Depends on attendance/payroll/KPI data existing to feed it, and on the Performance module (net new, see §10) existing to attach reviews to. |

---

## 8–9. Navy Signal Blue Redesign — shipped

Full visual reskin (design tokens, Archivo typeface, flat/border-first aesthetic) plus the structural pieces that reuse existing data: role-aware nav/shell (Admin vs. Manager/Employee), department-scoped client-side filtering for Managers, tabbed Employee Detail (Profile/Attendance/Leave/Salary/Documents/Activity), Attendance Weekly/Monthly toggle, Org Chart, and Candidates Kanban board. Delivered over a 10-day/2-person sprint per `HRMS_REDESIGN_SPRINT_PLAN.md`. Full Vitest suite green (53/53), production build clean throughout. See §10 below for what this sprint explicitly did not attempt.

---

## 10. Redesign Sprint — Backlog (cut from Navy Signal Blue scope, for the next planning pass)

The Navy Signal Blue mockup (source: `HRMS Navy Signal Blue.dc.html`) specified more than the 10-day/2-person sprint could responsibly fit. These items were deliberately deferred, not forgotten — most need real backend work first, not just frontend wiring.

| # | Item | Why it was cut | Priority | Effort | Notes |
|---|---|---|---|---|---|
| 10.1 | **Performance Review module** — review cycles, self/manager ratings, competency dot-grid, goals, peer feedback, appeal workflow, analytics | No backend model exists at all; comparable in scope to the Payroll rework (§3), needs its own sprint(s) | Medium | L | Blocks §7.3 (AI-assisted review generation) if that's ever picked up. |
| 10.2 | **AI chat assistant** (floating widget, role-scoped context, deep-linking into pages) | Matches already-planned §7.3 but wasn't sequenced into this sprint | Low | M | Feasible as a fast-follow — no new infra beyond an LLM API call once the shell is stable. |
| 10.3 | **Audit log settings tab** (system-wide, not per-employee) | Backend (`AuditLog` model + controller + router) is real and already partially wired — this sprint's Employee Detail Activity tab (§9) consumes `GET /audit-log/recent` and filters client-side per employee, but there's no standalone Settings-level audit log browser with the full `resource`/`action`/`actor` filters the backend already supports | Low | S | **Cheapest item on this list** — confirmed frontend-only work during the sprint's pre-work audit. Worth pulling in first if a slot opens up. |
| 10.4 | **Roles & Permissions matrix** settings tab (system-admin only) | No backend permissions-config model exists — genuinely new scope, not just a UI gap | Medium | M | — |
| 10.5 | **USD⇄VND currency toggle** in the topbar (live, user-facing switch) | `ExchangeRate` model and backend usage already exist; `Payroll.jsx`/`Jobs.jsx`/`format.js` already touch currency formatting. Lower risk than the original comparison doc assumed, but a topbar-level live toggle wasn't in this sprint's Day 1–10 scope | Low | S | Cheapest currency-related gap; the underlying FX infra is done. |
| 10.6 | **Icon system removal** (mockup is nearly icon-free; current app kept its outline-SVG icon system, per decision 8.0c) | Deliberate scope decision — no clear product reason to strip icons, and it would touch every page | — | — | Only revisit if explicitly requested by whoever owns the design brief. |
| 10.7 | **Manager department-scoping is UI-level only, not a real security boundary** | This sprint's Manager scoping (Attendance/Leave/roster filtered to `department === me.department`) is entirely client-side filtering over an already-unscoped API response — a Manager account can still reach company-wide data by calling the API directly, matching today's status quo elsewhere in the app | Medium | M | If real least-privilege enforcement is ever wanted, add department checks inside `attendanceController`/`leaveRequestController`/`employeeController`, not just the frontend filter. |
| 10.8 | **Payroll self-service** — no payslip endpoint for `EMPLOYEE` role | Payroll API (`payrollRouter.js`) is entirely `authorize("MANAGER","ADMIN")`-gated; the new Employee Detail Salary tab (§9) shows Employees their on-file salary figure only, with an explicit note that a full payslip view isn't available to them today | Medium | S | Needs one new self-service route (`GET /payroll/my-payslips` or similar) scoped to the logged-in employee's own records — the `Payslip` model and calculation engine already exist, this is additive routing/authorization only. |
| 10.9 | **Employee Detail Documents tab — single-document limit** | Current `Employee.contractUrl` (or equivalent) supports one contract file; the mockup implies multi-document upload (contract + ID + certificates, etc.) | Low | M | Needs a versioned `Document`/`Contract` collection instead of a single URL field — schema change, not just UI. |
| 10.10 | **i18n coverage gap in new redesign-sprint UI** | Org Chart, Candidates Kanban, the self-service Dashboard, and the new Employee Detail tabs (Attendance/Leave/Salary/Documents/Activity) were all built with hardcoded English strings — they were not extracted into `en.json`/`vi.json` during this sprint | Medium | S–M | Should be folded into §6.2/§6.3's next pass rather than treated as fully separate work — same extraction process, just a few more files. |

**Explicitly confirmed as no leftover mock/seed data:** the sprint's end-of-day audit (Day 10) checked every file touched or added in Days 6–9 (Org Chart, Candidates Kanban, Dashboard self-service view, Employee Detail tabs, Attendance weekly toggle, and the new `utils/attendance.js`/`utils/payroll.js` extractions) for mock/seed/fake/dummy data patterns. The only matches were the Attendance page's pre-existing deterministic mock-fill logic (present before this sprint, only relocated into `utils/attendance.js` verbatim) and Dashboard's pre-existing mock activity-feed array (also unchanged). The new Employee Detail Activity tab deliberately avoided copying that mock pattern and instead wired the real `AuditLog` API — the one place this sprint improved on data-fidelity rather than just matching the mockup's visuals.

---

## Recommended Build Order

1. **Shared infrastructure** (§0) — scheduler, review-queue pattern, PositionLevel model, Payroll model
2. **Account model flip** (§1) — blocks payroll/leave/contracts, which all assume a real linked account
3. **Position Ladder** (§2) + **Payroll rework** (§3) — built together; they share the `PositionLevel` table and the scheduler
4. **Leave Request system** (§4.1–4.8) — highest reuse of existing review-queue pattern
5. **Jobs/Candidates schema expansion + resume upload** (§5) — additive, low risk, can run in parallel with the above
6. **AI review generation** (§7.3) — bolt-on once attendance/payroll/KPI data is stable
7. **Language switch** (§6) — substantially done; remaining work is re-verifying coverage after §8–§9 and closing the §10.10 gap
8. **Design rework** (§7.1 / §8–§9) — **done**
9. **Redesign backlog** (§10) — pick off cheapest items first: audit log tab (10.3) and currency toggle (10.5) are frontend-only; payroll self-service (10.8) is a small additive route
10. **Chat** (§7.2) — only if time permits; optional

---

*This document should be updated as tasks are completed or re-scoped. See `HRMS_TASK_SPLIT_2PEOPLE.md` for how these tasks are divided between contributors, and `HRMS_REDESIGN_SPRINT_PLAN.md` for the full day-by-day plan behind §8–§10.*
