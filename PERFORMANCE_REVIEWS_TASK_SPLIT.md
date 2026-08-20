# Performance Reviews — Task Split (Frontend / Backend)

**Owners:** `cuonghoangwork` (frontend) · `hoangquan14727` (backend)
**Split logic:** horizontal — one of you builds the UI, the other builds the API it talks to. That makes the API contract the single most important sync point: agree on it before either of you writes real code, or you'll end up rebuilding whichever side guessed wrong.
**Source:** feature detail extracted from the uploaded demo (`HRMS Navy Signal Blue.dc.html`, `isPerformance`/review-dialog sections; note that file is **not** in this repo) — scope confirmed as: full feature set, AI insight included (closes task 7.3), backend gets a new dedicated model rather than forced through `reviewQueue.js`, no fixed calendar deadline.

> **Read `PERFORMANCE_REVIEWS_API_CONTRACT.md` first — it is the frozen contract and it corrects several statements below.** The corrections are marked inline here too.

---

## What's being built (recap from the demo)

Review cycles are semi-annual (H1/H2), auto-generated on a rolling window (2 closed + 1 open) plus Admin-created custom cycles with their own label/start/end. Each employee gets one review record per cycle: a self-rating (1–5) + comments, a manager rating (1–5) + comments, six fixed competencies each rated 1–5 by both self and manager, a freeform goals list with progress tracking, freeform peer feedback, and an appeal flow (employee appeals within 14 days of the manager rating; Admin/HR resolves as upheld or adjusted). Visibility follows the existing manager-scoping model: Admin/HR see everyone, Manager sees their own review plus their department's reports, Employee sees only their own — including the "orphan manager" edge case where a manager with nobody above them gets their manager-review filled in by HR instead. There's also a roster-level analytics panel (rating distribution, department comparison, competency averages) and a per-review "Ask AI" button that calls an LLM for a neutral summary + growth suggestion.

> **Two corrections, both settled in the contract.** (a) "Rolling window of 2 closed + 1 open" is what the server *generates*; `GET /performance/cycles` returns **all** cycles, so don't build a fixed three-item selector. (b) "Manager sees their own review plus their department's reports" is satisfied by a **single** `{department}` filter, not a union — a manager's own Employee record is already in their own department. Don't add a special case for it.

---

## Milestone 0 — API contract (both of you, before anything else)

Do this together in one sitting, written down somewhere you can both reference (a shared doc, a PR description, whatever) — not from memory. At minimum, nail down:

- The `PerformanceReview` record shape: `cycleKey`, `empId`, `selfRating`, `selfComments`, `selfSubmittedDate`, `managerRating`, `managerComments`, `managerSubmittedDate`, `competencies` (map of 6 fixed keys → `{self, manager}`), `goals` (array of `{id, text, progress}`), `peerFeedback` (array of `{name, relation, comments}`), `appeal` (`{reasonCategory, detail, status, filedDate, resolution, resolvedRating, resolverNote, resolvedDate}` or `null`).
- The `ReviewCycle` shape: `key`, `label`, `kind` (`standard`/`custom`), `status` (`Open`/`Closed`), `start`, `end`.
- The rating scale (1–5, with labels: Needs improvement / Developing / Meets expectations / Exceeds expectations / Outstanding) and the 6 competency keys (communication, execution, ownership, collaboration, leadership, problemSolving) — put these in ONE place both sides read from, not copy-pasted independently. The frontend and backend already independently hardcode shared enums today and drift apart: `hrms-react/src/utils/leaveTypes.js` is a verbatim copy of the three constants in `hrms-backend/model/LeaveRequest.js`, allowance numbers included, and `Notification`'s category enum disagrees with the frontend's `CATEGORY_CONFIG` badly enough that `utils/mappers.js` carries a bridge map for it. This is a good place to actually fix that instead of adding a third copy — see `GET /performance/meta` in the contract.
- Every endpoint you'll need and who's allowed to call it (see backend milestones below for the list).
- The `POST /performance/ai-insight` (or similar) request/response shape for the AI feature.

---

## Backend (`hoangquan14727`)

### Milestone 1 — Core review loop
- `PerformanceReview` model (new, dedicated — not bolted onto `utils/reviewQueue.js`; that pattern is single-decision submit→approve/reject, this is two independent submissions per cycle, it doesn't fit).
- Cycle logic: compute the rolling standard H1/H2 cycles server-side (the demo faked "current cycle" client-side with `localStorage`; that has to be real here). Shipped as `utils/performanceCycles.js` plus a `PerformanceCycle` collection; manual open/close survives regeneration via a `statusOverriddenAt` stamp. **Not** a startup migration and **not** a cron — see the contract for why neither works in this repo.
- Endpoints: list cycles, get roster for a cycle (role-scoped via the existing `managerScope.js` — reuse it, don't reinvent department scoping), get one employee's review record for a cycle, submit self review, submit manager review.
- Role gating mirrors the existing `authorize(...)` middleware pattern: self-review only by the employee themselves while the cycle is Open; manager-review by that employee's Manager (not self), by ADMIN, or by HR when the employee is an "orphan manager." **The contract's §2.1 replaces the original `Department.manager`-based definition of "orphan", which is not implementable against this schema** — the manager relationship is derived from department membership instead.
- Tests: keep the project's existing convention (23 backend test files already exist, 376 tests) — unit tests for the rating/cycle-status business rules, integration tests for the core endpoints.

### Milestone 2 — Competencies + goals
- Extend the record with competency-rating and goal endpoints (or fold into the review-update endpoint — your call, just keep it consistent with how the frontend milestone 2 expects to call it per the Milestone 0 contract).

### Milestone 3 — Peer feedback + appeals
- Add-peer-feedback endpoint.
- Appeal endpoints: file appeal (employee, within the 14-day window, one per review), resolve appeal (Admin/HR only — uphold or adjust with a new rating + resolver note; adjusting overwrites `managerRating`).

### Milestone 4 — Cycle management + analytics
- Admin-only: create custom cycle, toggle cycle open/closed/reopen.
- Analytics endpoint(s) or just compute in the roster response: rating distribution, department comparison (Admin only), competency averages (self vs. manager).

### Milestone 5 — AI insight + reminders
- `POST /performance/ai-insight`: builds a prompt from the review's ratings/comments/competencies/goals/peer feedback and calls an LLM API, returns the text. **Open decision needed before this milestone starts:** which LLM API/provider, and where the API key lives (env var, following the project's existing `.env` convention). Note that no AI provider is integrated anywhere in this repo today and `hrms-backend` has no HTTP client dependency — the one outbound call it makes (the FX rate fetch) uses global `fetch`. Worth a short written decision note; don't let it sit unresolved and block the milestone.
- Scheduled reminder job: reuse the `node-cron` scheduler already wired in `jobs/index.js` — a daily check that fires role-aware notifications (employee: your self-review is due in N days; manager: N pending reports; Admin/HR: aggregate pending count) when a cycle's deadline is within 7 days. This replaces the demo's `localStorage`-based "have I already notified" hack with a real check against sent-notification records.

---

## Frontend (you)

### Milestone 1 — Core review loop
- New `Performance.jsx` page: stat strip (completed/self-submitted/not-started/avg manager rating), cycle toolbar, roster table (employee, department, self rating, manager rating, status, open action) — follow the existing page shape (`Attendance.jsx`/`Payroll.jsx` stat-card + panel pattern).
- New review-detail dialog component with the self-rating select + comments textarea and manager-rating select + comments textarea, gated read-only vs. editable exactly like the demo (`canEditSelf`/`canEditManager` logic — you're the employee editing your own open-cycle self review, or the manager/HR editing a report's).
- Route + nav entry: `/performance`, sidebar item visible to all roles (role-based content, not role-gated visibility — everyone has at least their own review) — mirror the `isPlainManager`/`isPlainEmployee` branching already in `SideMenu.jsx`.
- Dashboard stat card ("Performance reviews": completed/total, avg-rating trend) linking to the new page.

### Milestone 2 — Competencies + goals
- Competency rows with the 5-dot self/manager rating UI from the demo.
- Goals list with progress slider + add-goal form (editable only by the employee themselves).

### Milestone 3 — Peer feedback + appeals
- Peer feedback list + add form.
- Appeal button/form (employee side) and the resolve form (Admin/HR side: uphold / adjust-with-new-rating), with the appeal badge on the roster row.

### Milestone 4 — Cycle management + analytics
- Custom-cycle creation dialog (Admin-only), open/close/reopen toggle.
- Analytics panels: rating distribution bars, department comparison (Admin only), competency averages.

### Milestone 5 — AI insight + notifications
- "Ask AI" button + insight card on the review dialog, wired to the backend endpoint once it's ready — build the button and loading/error states first against a stub so you're not blocked waiting on Milestone 5 backend.
- Notification deep links: the backend emits `link: "/performance"` and `linkLabel: "Open review"` on review-related notifications — reusing the `link`/`linkLabel` pattern already wired in by the leave-request work, no new plumbing needed. **Correction:** an earlier draft of this line said `link: {route: 'performance'}`. That would break — `Notification.link` is a plain `String` and `Notifications.jsx:150` calls `navigate(notification.link)` directly. It is a relative path string, exactly like the existing `"/payroll"` and `"/attendance"` links.
- Notifications arrive with `category: "performance"`, a **new** value in the backend's `Notification` category enum. Add a matching `CATEGORY_CONFIG.performance` entry in `Notifications.jsx` plus `notifications.categories.performance` in `en.json`/`vi.json` — otherwise the notice still renders but wears the generic system chip and no "Performance" filter chip appears at all.
- Register the `/performance` route in `App.jsx` before testing any deep link, or it dead-ends.

### Milestone 6 (both) — i18n, tests, regression
- Add `tr.perf.*`/`tr.dlg.*`-equivalent strings to `en.json`/`vi.json` as you build each milestone rather than retrofitting at the end — cheaper than a bulk extraction pass later.
- Component tests for the new pieces, matching the existing `vitest`/`@testing-library` convention (5 component tests already exist as a reference).
- A joint regression pass once Milestone 5 lands, same as the "full regression pass across both tracks" step your existing sprint plan already builds in at the end of a feature.

---

## Sync points (don't skip these)

| When | What |
|---|---|
| Before Milestone 1 starts | API contract (Milestone 0) is written down and both of you have read it |
| Start of Milestone 1 | Backend ships roster + review-detail endpoints (even against seed data) early enough that frontend isn't blocked — frontend can start UI against the agreed contract shape in parallel if backend is a few days behind |
| Before Milestone 5 (AI) | LLM provider/API-key decision is made — don't let this idle until the milestone starts, it has its own lead time like the 6.4 translator did in the original sprint plan |
| End of each milestone | Quick check that both sides actually agree on the shape that shipped — cheaper to catch a drift after 2-3 days of work than after all 5 milestones |
| Before calling it done | Joint regression pass (Milestone 6) |

---

*Milestones are ordered, not dated — there's no fixed deadline for this task, so treat this as "build in this order" rather than a sprint calendar.*

---

## Frontend-visible facts worth knowing before you start

- **`employeeId` in this feature is the Mongo `_id`, not `"EMP001"`.** The repo uses that name for both things in different places; the contract's §0.1 freezes it. Roster rows carry `employeeCode` separately for display.
- **`GET /reviews/:cycleKey/:employeeId` returns a `permissions` object.** Use it for read-only vs editable instead of reimplementing the rule — deciding `canEditManager` needs per-department manager data the client never sees.
- **The goal progress slider must be `step={10}`.** The server enforces whole multiples of 10 and will 400 an in-between value. `0` is valid.
- **There is no draft save.** `PATCH .../self` submits and stamps the date; calling it again overwrites.
- **A closed cycle returns 409, not 403**, on any write.
- Against seeded data, `manager@hrms.com` is the only MANAGER account and every other seeded employee counts as an orphan manager, so HR/ADMIN fills in their manager review. That is correct behaviour, not a bug — worth knowing before it looks like a permissions leak.
