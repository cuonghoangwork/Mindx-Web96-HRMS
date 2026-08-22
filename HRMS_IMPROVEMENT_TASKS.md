# HRMS Improvement Tasks — Master List

**Project:** MindX Web96 Capstone — HR Management System
**Source docs:** `HRMS improvement.txt` (v3/v4), plus follow-up discussion on Position Ladder and Eng/Vie language switch
**Status:** §0–§7 planning, §8–§9 (Navy Signal Blue redesign) shipped 2026-08. §10 was the redesign sprint's cut list — as of 2026-08-22, most of it has since shipped too; see §10 below for what's actually still open versus what this doc had drifted out of sync with the code on.

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
| 7.3 | AI-assisted employee review generation | Medium | M | **Done** — shipped as the per-review "Ask AI" insight button inside the Performance Reviews module (§10.1), backed by `utils/geminiClient.js` (Google AI Studio / Gemini, not a generic placeholder). |

---

## 8–9. Navy Signal Blue Redesign — shipped

Full visual reskin (design tokens, Archivo typeface, flat/border-first aesthetic) plus the structural pieces that reuse existing data: role-aware nav/shell (Admin vs. Manager/Employee), department-scoped client-side filtering for Managers, tabbed Employee Detail (Profile/Attendance/Leave/Salary/Documents/Activity), Attendance Weekly/Monthly toggle, Org Chart, and Candidates Kanban board. Delivered over a 10-day/2-person sprint per `HRMS_REDESIGN_SPRINT_PLAN.md`. Full Vitest suite green (53/53), production build clean throughout. See §10 below for what this sprint explicitly did not attempt.

---

## 10. Redesign Sprint — Backlog (cut from Navy Signal Blue scope)

The Navy Signal Blue mockup (source: `HRMS Navy Signal Blue.dc.html`) specified more than the 10-day/2-person sprint could responsibly fit. These items were deliberately deferred, not forgotten.

**Update, 2026-08-22:** this section had drifted out of sync with the code — five of the ten items below shipped in follow-on work without this doc being updated. Verified against the actual repo (`git log`, live controller/route/component inspection), not just re-reading this file. Split into what's shipped and what's still genuinely open.

### Shipped since this list was written

| # | Item | Status |
|---|---|---|
| 10.1 | **Performance Review module** — review cycles, self/manager ratings, competency dot-grid, goals, peer feedback, appeal workflow, analytics, AI insight | **Shipped** — `PerformanceCycle`/`PerformanceReview` models, `performanceController`/`performanceRouter`, `utils/performanceScope.js` (real server-side access control — see 10.7 below), `utils/geminiClient.js` for the "Ask AI" insight. Frontend: `Performance.jsx`, `PerformanceReviewDialog.jsx`, `CreateCycleDialog.jsx`, all with tests. Merged to `main` 2026-08-21. See `PERFORMANCE_REVIEWS_TASK_SPLIT.md` / `PERFORMANCE_REVIEWS_API_CONTRACT.md` for the frozen contract this was built against. |
| 10.3 | **Audit log settings tab** | **Shipped** — `Settings.jsx`'s `AuditLogTab`, gated to HR-tier, has real content (actor/role/action/time columns) wired to `GET /audit-log`, not a stub. |
| 10.5 | **USD⇄VND currency toggle** in the topbar | **Shipped** — `Header.jsx` uses `useCurrency()`/`toggleCurrency` from `CurrencyContext`. |
| 10.7 | **Manager department-scoping was UI-level only** | **Resolved** — real server-side enforcement now exists everywhere it matters: `utils/managerScope.js`'s `getManagerDepartmentId()` is used across `attendanceController` (checkIn/checkOut/update/remove, not just list), `employeeController` (write actions), `payrollController`, and the shared `utils/reviewQueue.js` pattern (leave/profile-edit/promotion/no-show requests, with 403s on both list and review). The new Performance module has its own equivalent in `utils/performanceScope.js`. `employeeController.getDetail` is the one deliberate exception — Manager directory reads are company-wide by design (see its inline comment), while writes stay department-scoped. |
| 10.8 | **Payroll self-service** — no payslip endpoint for `EMPLOYEE` | **Shipped** — `GET /payroll/my-payslips`, scoped to the requesting employee's own records, filters out draft-status periods so employees never see unapproved payroll data. |

### Still open

| # | Item | Priority | Effort | Notes |
|---|---|---|---|---|
| 10.2 | **AI chat assistant** (floating widget, role-scoped context, deep-linking into pages) | Low | M | Confirmed not started — no floating widget component anywhere in `src/`. Distinct from 10.1's per-review "Ask AI" button, which is a different, narrower feature that did ship. |
| 10.4 | **Roles & Permissions matrix** settings tab (system-admin only) | Medium | M | Partially misleading to call fully open: a "Roles & Permissions" tab now exists in Settings (`RolesTab`, admin-only), but its content is `PromoteUsersPanel` — a tool for promoting a user's *role* (Employee→Manager, etc.), not a matrix for configuring what each role is *permitted to do*. The latter (no backend permissions-config model) is still genuinely unbuilt. |
| 10.6 | **Icon system removal** (mockup is nearly icon-free; current app kept its outline-SVG icon system, per decision 8.0c) | — | — | Unchanged, deliberate no-op. Only revisit if explicitly requested by whoever owns the design brief. |
| 10.9 | **Employee Detail Documents tab — single-document limit** | Low | M | Confirmed still open — `ViewEmployee.jsx`'s Documents tab has an explicit inline note that only one contract PDF is supported and multi-document upload needs a new backend model. |
| 10.10 | **i18n coverage gap in redesign-sprint UI** | Medium | S–M | Confirmed still open, and uneven: `OrgChart.jsx` and `Candidates.jsx` (Kanban view) have **zero** `useTranslation`/`t()` usage — fully hardcoded English. `ViewEmployee.jsx`'s newer tabs (Salary/Documents/Activity) are also mostly hardcoded (1 `t()` call across a 1,300+ line file). `Dashboard.jsx` is the exception — largely already extracted (37 `t()` calls), likely from a later i18n pass that didn't circle back to the others. |

**Explicitly confirmed as no leftover mock/seed data (as of the original redesign sprint):** the sprint's end-of-day audit (Day 10) checked every file touched or added in Days 6–9 for mock/seed/fake/dummy data patterns. The only matches were the Attendance page's pre-existing deterministic mock-fill logic (present before this sprint, only relocated into `utils/attendance.js` verbatim) and Dashboard's pre-existing mock activity-feed array (also unchanged). The new Employee Detail Activity tab deliberately avoided copying that mock pattern and instead wired the real `AuditLog` API.

---

## Recommended Build Order

1. **Shared infrastructure** (§0) — scheduler, review-queue pattern, PositionLevel model, Payroll model
2. **Account model flip** (§1) — blocks payroll/leave/contracts, which all assume a real linked account
3. **Position Ladder** (§2) + **Payroll rework** (§3) — built together; they share the `PositionLevel` table and the scheduler
4. **Leave Request system** (§4.1–4.8) — highest reuse of existing review-queue pattern
5. **Jobs/Candidates schema expansion + resume upload** (§5) — additive, low risk, can run in parallel with the above
6. **AI review generation** (§7.3) — **done**, shipped as part of the Performance module (§10.1)
7. **Language switch** (§6) — substantially done; remaining work is closing the §10.10 gap (Org Chart, Candidates Kanban, and the newer Employee Detail tabs are hardcoded English)
8. **Design rework** (§7.1 / §8–§9) — **done**
9. **Redesign backlog** (§10) — 10.1/10.3/10.5/10.7/10.8 **done**; remaining open items are the AI chat widget (10.2), a real permissions-config matrix (10.4), multi-document upload (10.9), and the i18n gap (10.10) — see §10 for current status of each
10. **Chat** (§7.2) — only if time permits; optional

---

*This document should be updated as tasks are completed or re-scoped. See `HRMS_TASK_SPLIT_2PEOPLE.md` for how these tasks are divided between contributors, and `HRMS_REDESIGN_SPRINT_PLAN.md` for the full day-by-day plan behind §8–§10.*
