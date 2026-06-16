# HRMS Frontend — Project Summary
**MindX Web96 · Capstone Project**
**Stack:** Vite + React 18 · React Router v6 · Context API · CSS Custom Properties
**Repo:** [github.com/cuonghoangwork/Mindx-Web96-HRMS](https://github.com/cuonghoangwork/Mindx-Web96-HRMS.git)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Build | Vite 5 |
| UI | React 18 (no external UI library) |
| Routing | React Router v6 |
| State | Context API (Auth / Store / Theme) |
| Styling | CSS Custom Properties — Design System v2 |
| Charts | Pure SVG (no recharts/chart.js) |
| Font | Lexend (Google Fonts) |

---

## Design System (`src/index.css`)

### Color Tokens
- **6 palettes × 10 stops:** Primary (purple), Success, Warning, Danger, Info, Neutral
- **Semantic tokens:** `--bg-*`, `--txt-*`, `--bdr-*` → auto-switch light/dark, including `--bg-*-subtle` chip backgrounds (primary/success/warning/danger/info)
- **Dark mode:** `[data-theme="dark"]` via `ThemeContext`

### Scale Systems
| Scale | Tokens |
|-------|--------|
| Spacing | `--sp-1` (4px) → `--sp-24` (96px) — 8px grid |
| Font Size | `--fs-2xs` (10px) → `--fs-6xl` (40px) — 11 steps |
| Font Weight | `--fw-light` (300) → `--fw-bold` (700) |
| Shadow | `--shadow-xs` → `--shadow-xl` — 5 levels |
| Radius | `--radius-sm` (6px) → `--radius-full` (9999px) |
| Z-index | `--z-base` (0) → `--z-toast` (2000) |

### CSS Components
`.btn`, `.badge`, `.card`, `.stat-card`, `.content-card`, `.data-table`, `.modal`, `.modal-overlay`, `.form-group`, `.pagination`, `.toast`, `.empty-state`, `.skeleton`, `.quick-link` / `.quick-link-icon`, `.dash-notif`, `.search-input`, `.toolbar`

### Fixes from this session
- **`.data-table th`** was missing `text-align: left`, so headers defaulted to browser center-alignment while `td` was left-aligned — every table (AllEmployees, AllDepartments, Candidates, Holidays) had misaligned headers vs. cells. Fixed with a single global rule.
- **`.logo-icon` / `.quick-link-icon`** updated to support inline SVG icons (stroke-based, `currentColor`) instead of emoji, with `fill`/`stroke` no longer hardcoded in CSS.
- **`.dash-notif`** given an explicit `color` (and hover color) so its SVG bell icon inherits correctly via `currentColor`.

---

## Pages (`src/pages/`)

### Dashboard
- 4 stat cards with SVG sparklines
- Attendance trend bar chart (7 days, color-coded ≥90%/≥75%/<75%)
- Headcount horizontal bar chart by department
- Contract type SVG donut chart
- Recent employees table with Avatar + StatusBadge
- Recent activity feed
- **Quick Actions grid** — *(updated this session)* emoji icons replaced with outline SVG icons (Add Employee, All Employees, Attendance, Payroll, Departments, Holidays), each in a 32×32px colored chip using `--bg-*-subtle` / `--clr-*-400/500` tokens

### AllEmployees
- Sortable table (6 columns)
- Search + Filter modal (department multi-select, contract type)
- **Checkbox bulk selection** — select all / per page
- **Bulk actions bar** — Export CSV, Set Status (Active/On Leave/Terminated), Delete
- **Employee detail side panel** — slide-in from right, quick status change, link to full profile
- Pagination
- *(this session)* table header/cell alignment fixed via `.data-table th` rule

### AddEmployee *(4-step stepper)*
- **Step 1 — Personal:** Name, Age, Gender, Phone, Email, Address
- **Step 2 — Job:** Employee ID, Start Date, Department, Designation, Contract Type, Status
- **Step 3 — Finance:** Annual salary + live breakdown (monthly/weekly preview)
- **Step 4 — Review:** Profile card + 3-section summary with ✏ Edit shortcuts per section
- **Realtime validation:** per-field on blur + on change after touch
- Step completion % mini-bar in header
- Progress bar + clickable completed steps
- Dot nav indicator + toast on success

### ViewEmployee
- Avatar with status dot
- StatusBadge + TypeBadge
- Inline editable Status and Contract Type via `<select>`
- Confirm change modal before applying
- InfoItem grid (ID, dept, designation, age, gender, salary, address)

### AllDepartments
- Table with aligned headers (center/right per column)
- Inline budget editing (click to edit → input + confirm/cancel)
- Dynamic employee count + total salary per dept
- Add Department modal
- *(this session)* table header/cell alignment fixed

### Attendance *(2 views)*
- **Calendar View:** month grid, each day shows attendance rate bar + color + status dots. Click day → detail panel with per-employee table (check-in, check-out, hours, status)
- **Table View:** filter by employee, shows date, day, check-in, check-out, hours, status badge
- Month navigation (‹ ›)
- Month summary badges (Present / Late / On Leave / Absent totals)
- Mock data generation for full month (deterministic, based on employeeId × day seed)

### Payroll
- 4 stat cards (total, average, highest, monthly)
- Department salary horizontal bar chart (sorted by spend)
- **Contract type donut chart** (`TypeDonut`) with salary per type — *(this session)* fixed overflow: legend was laid out side-by-side with the donut in a too-narrow 240px column, causing values like "$170K" to spill outside the card. Reworked to stack the donut above a full-width legend with ellipsis-truncated labels.
- Salary table: search + dept filter + type filter + sort by Annual
- **Inline breakdown panel:** click row → expand Gross→Tax→SS→Medicare→Net table + mini distribution bar chart
- Export CSV (respects current filter)
- Footer totals row

### ViewDepartment
- Department stats (manager, team size, budget)
- Team members table with link to each employee profile

### Jobs *(rebuilt this session)*
- 4 stat cards: Open Positions, Total Applicants (derived live from Candidates), Filled Roles, Total Postings
- Search + status filter (Open/Filled/Closed) + department filter (from `StoreContext.departments`)
- Job cards with `StatusBadge`/`TypeBadge`, posted date, applicant count
- "View Applicants" → navigates to `/candidates?job=<id>`
- Add/Edit via `AddJobModal`; Delete with confirm
- Data now lives in `StoreContext.jobs[]`

### Candidates *(rebuilt this session)*
- 4 stat cards: Total Candidates, In Interview, Offers Extended, Avg. Rating
- Search + pipeline stage filter (Applied/Screening/Interview/Offer/Hired/Rejected)
- Reads `?job=<id>` query param (set from Jobs) to filter pipeline to one posting, with removable filter chip
- Table: Avatar, name, role applied for (resolved via `getJobById`), `CandidateStageBadge`, SVG star rating, applied date
- "View" → `CandidateSidePanel` slide-in with full details, resume link, notes, editable stage select, remove action
- Data now lives in `StoreContext.candidates[]`, linked to jobs via `jobId`

### Holidays *(rebuilt this session)*
- 4 stat cards: Total Holidays, Upcoming, Public Holidays, Next Holiday
- Holiday dates updated to **2026** (Tet, Reunification Day, National Day, etc.)
- Type badges: Public (success), Company (primary), Optional (info)
- Past/Upcoming status badges, past rows dimmed
- Inline date editing (click date → date picker → confirm/cancel)
- Add/Edit via `AddHolidayModal`, duplicate name+date check, Delete
- Empty state

### Notifications *(rebuilt this session)*
- 3 stat cards: Total, Unread, Today
- 6 categories with icon chips: Leave 🏖️, Hiring 🧑‍💼, Payroll 💰, Employee 👋, Holiday 📅, System ⚙️
- Filter chips: All / Unread / per-category
- Per-item "Mark read" / "Dismiss"; toolbar "Mark all as read" / "Clear read"
- Relative timestamps ("2 hours ago", "Yesterday", etc.)
- Data now lives in `StoreContext.notifications[]`; unread count surfaces as a badge on the Header bell

### Other Pages
- **Login** — demo credentials, redirect if authenticated
- **ForgotPassword / EnterOTP / LoginSuccessful** — auth flow
- **Settings** — dark/light toggle, email notifications, language

---

## Components (`src/components/`)

### FormField
Universal input wrapper — label, hint, error message, success state, accessible aria attributes. Replaces all inline form patterns. Props: `label`, `htmlFor`, `required`, `hint`, `error`, `success`, `touched`, `disabled`, `type` (default | inline).

### Avatar
Auto-generates initials + picks gradient color by name hash (10 palettes, stable across renders). Props: `name`, `src` (with img error fallback), `size` (xs/sm/md/lg/xl), `shape` (circle/square), `status` (active/leave/remote/terminated → dot indicator). Exports `AvatarGroup` for stacked avatars with overflow count.

### Badge
Generic semantic badge. Variants: `active | leave | remote | terminated | pending | primary | success | warning | danger | info | neutral`. Sizes: `sm | md | lg`. Props: `dot`, `icon`, `pill`. Named exports: `StatusBadge` (auto-maps employee status string), `TypeBadge` (auto-maps contract type), **`CandidateStageBadge`** *(new this session)* — maps pipeline stages (Applied/Screening/Interview/Offer/Hired/Rejected) to semantic colors.

### EmployeeStatusBadge
Dedicated employee status badge with per-status SVG icons and pulse animation for Active. Variants: `badge` (default) | `dot` | `pill`. Pulse can be disabled via `pulse={false}`.

### Button
Full-featured button component. Variants: `primary | secondary | ghost | danger | success | brand-outline`. Sizes: `xs | sm | md | lg | xl`. Features: `loading` (spinner), `leftIcon`, `rightIcon`, `iconOnly`, `fullWidth`, polymorphic `as` prop (renders as `<Link>` etc). Exports `ButtonGroup`.

### AttendanceTrendChart
SVG line chart + stacked mini bars for attendance trend. Auto-generates 7-day data from StoreContext attendance array. Features hover tooltip with per-status breakdown, color-coded line (green/amber/red by rate), today highlighted. Props: `attendance`, `totalStaff`, `height`, `showLegend`, `showTooltip`. *(this session)* fallback base date updated from 2024 → 2026.

### New components (this session)
- **AddJobModal** — title/department/location/type/status form for posting/editing job openings; duplicate-safe, integrates with `StoreContext.addJob` / `updateJob`
- **AddHolidayModal** — name/date/type form for holidays; duplicate name+date check
- **CandidateSidePanel** — slide-in panel (animated from right) with candidate avatar, contact info, applied date, SVG star rating, resume link, notes, editable pipeline-stage `<select>`, remove action

### Other Components
- **Header** — page title, date/time widget (adjustable), notifications bell *(this session: emoji → outline SVG bell + unread badge sourced from `StoreContext.unreadNotificationCount`)*, profile dropdown with logout
- **SideMenu** — NavLink list with active indicator, light/dark theme switch; *(this session)* logo icon redesigned from filled cube/package SVG to an outline two-people "HR" icon (`fill="none" stroke="white"`)
- **FilterModal** — department multi-select checkboxes + contract type radio buttons
- **AddDepartmentModal** — name/manager/budget form with duplicate name check
- **EmployeeModal** — quick add employee modal (alternative to stepper)
- **SearchBar** — controlled search with clear button
- **HeaderDateTime** — clock display + panel to set custom date/time for demo purposes
- **Layout** — sidebar + main content wrapper with mobile backdrop
- **ProtectedRoute** — redirects to `/login` if not authenticated

---

## Context (`src/context/`)

### StoreContext
Central data store. Provides:
- `employees[]` — CRUD: `addEmployee`, `removeEmployee`, `updateEmployee`
- `departments[]` — `addDepartment`, `updateDepartmentBudget`
- `attendance[]`
- **`jobs[]`** *(new this session)* — CRUD: `addJob`, `updateJob`, `removeJob`
- **`candidates[]`** *(new this session)* — CRUD: `addCandidate`, `updateCandidate`, `removeCandidate`; each linked to a job via `jobId`
- **`notifications[]`** *(new this session)* — `markNotificationRead`, `markAllNotificationsRead`, `removeNotification`, `clearReadNotifications`
- `filters` — `search`, `department`, `type` + setters + `clearFilters`
- `modals` — `openModal`, `closeModal`, `closeAllModals`
- Selectors: `getEmployeesByDepartment`, `getEmployeeCountByDepartment`, `getTotalSalaryByDepartment`, **`getJobById`**, **`getCandidatesByJob`**, **`getApplicantCount`** (derived live from candidates), **`unreadNotificationCount`** *(all new this session)*
- Clock: `getAppNow`, `setAppDateTime`, `resetAppDateTime`, `isClockAdjusted`
- All seed data dates updated from 2024 → **2026**

### AuthContext
Demo auth (email: `admin@hrms.com` / password: `admin123`). Persists session to `localStorage`. Provides `user`, `isAuthenticated`, `login`, `logout`.

### ThemeContext
Persists to `localStorage`. Sets `data-theme` attribute on `<html>`. Provides `theme`, `toggleTheme`, `setTheme`.

---

## Key Patterns

```jsx
// Realtime validation (AddEmployee)
const handleChange = useCallback((e) => {
  const { name, value } = e.target;
  setForm(prev => ({ ...prev, [name]: value }));
  if (touched[name]) setErrors(prev => ({ ...prev, [name]: validateField(name, value) }));
}, [touched]);

// Bulk selection (AllEmployees)
const toggleOne = useCallback((id, e) => {
  e.stopPropagation();
  setSelectedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
}, []);

// CSV export
const blob = new Blob([csv], { type: "text/csv" });
const url  = URL.createObjectURL(blob);
const a    = document.createElement("a");
a.href = url; a.download = "filename.csv"; a.click();
URL.revokeObjectURL(url);

// Derived selector pattern (StoreContext) — Jobs ↔ Candidates sync
const getApplicantCount = useCallback(
  (jobId) => candidates.filter(c => c.jobId === jobId).length,
  [candidates],
);

// Cross-page query param filter (Jobs → Candidates)
// Jobs.jsx:        navigate(`/candidates?job=${job.id}`)
// Candidates.jsx:  const jobIdParam = useSearchParams()[0].get("job");
```

---

## Project Stats

| Metric | Value |
|--------|-------|
| Total lines of code (JSX) | ~8,955 |
| Pages | 17 |
| Components | 18 |
| Contexts | 3 |
| Build output (JS gzip) | ~92.5 KB |
| Build output (CSS gzip) | ~6.3 KB |
| External UI libraries | **0** |
| Build errors | **0** |

---

## File Structure

```
src/
├── pages/
│   ├── Dashboard.jsx          ← Charts, sparklines, activity feed, SVG Quick Actions icons
│   ├── AllEmployees.jsx       ← Bulk actions, side panel
│   ├── AddEmployee.jsx        ← 4-step stepper, realtime validation
│   ├── ViewEmployee.jsx       ← Inline edit, confirm modal
│   ├── AllDepartments.jsx     ← Inline budget editing
│   ├── ViewDepartment.jsx
│   ├── Attendance.jsx         ← Calendar + table view
│   ├── Payroll.jsx            ← Charts, breakdown, CSV export, fixed donut overflow
│   ├── Jobs.jsx                ← Store-backed, derived applicant counts
│   ├── Candidates.jsx          ← Store-backed, pipeline, side panel, job-filter via URL
│   ├── Holidays.jsx             ← 2026 dates, inline edit, add/edit modal
│   ├── Notifications.jsx        ← Categories, filters, mark read/dismiss
│   ├── Settings.jsx
│   ├── Login.jsx
│   ├── ForgotPassword.jsx
│   ├── EnterOTP.jsx
│   └── LoginSuccessful.jsx
├── components/
│   ├── FormField.jsx          ← Universal form input wrapper
│   ├── Avatar.jsx              ← Initials + image + status dot
│   ├── Badge.jsx                ← StatusBadge, TypeBadge, CandidateStageBadge
│   ├── EmployeeStatusBadge.jsx ← Icons + pulse animation
│   ├── Button.jsx               ← All variants + ButtonGroup
│   ├── AttendanceTrendChart.jsx ← SVG line + bar chart
│   ├── AddJobModal.jsx          ← Post/edit job openings
│   ├── AddHolidayModal.jsx      ← Add/edit holidays
│   ├── CandidateSidePanel.jsx   ← Candidate detail slide-in
│   ├── Header.jsx                ← SVG bell + unread badge
│   ├── SideMenu.jsx              ← Outline two-people logo icon
│   ├── Layout.jsx
│   ├── FilterModal.jsx
│   ├── AddDepartmentModal.jsx
│   ├── EmployeeModal.jsx
│   ├── SearchBar.jsx
│   ├── HeaderDateTime.jsx
│   └── ProtectedRoute.jsx
├── context/
│   ├── StoreContext.jsx        ← + jobs, candidates, notifications slices
│   ├── AuthContext.jsx
│   └── ThemeContext.jsx
├── index.css                  ← Design System v2, table alignment fix, icon chip styles
├── App.jsx
└── main.jsx
```

---

## Session Changelog (latest)

1. **Holidays.jsx** — full rewrite (v2 tokens, 2026 dates, stats, inline edit, add/edit modal); all other `2024` dates across the codebase updated to `2026`
2. **Jobs.jsx** — full rewrite (stats, search/filters, `AddJobModal`)
3. **Candidates.jsx** — full rewrite (pipeline stats, stage filter, `CandidateStageBadge`, `CandidateSidePanel`)
4. **Jobs ↔ Candidates sync** — moved both into `StoreContext` (`jobs[]`, `candidates[]`), applicant counts now derived live via `getApplicantCount`
5. **Table alignment fix** — global `.data-table th { text-align: left }` fix across AllEmployees, AllDepartments, Candidates, Holidays
6. **Payroll donut chart overflow fix** — `TypeDonut` legend reworked from side-by-side to stacked layout with text truncation
7. **Notifications.jsx** — full rewrite (categories, stats, filters, mark read/dismiss); added `StoreContext.notifications[]` + unread badge on Header bell
8. **Sidebar logo icon** — redesigned from filled cube/package to outline two-people "HR" icon
9. **Quick Actions icons** (Dashboard) — emoji → outline SVG icons in colored chips
10. **Notification bell icon** (Header) — emoji → outline SVG bell, with `currentColor` theming

---

*Generated: MindX Web96 HRMS Capstone — Frontend Phase*
