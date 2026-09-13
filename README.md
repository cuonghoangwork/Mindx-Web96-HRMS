# HRMS — Human Resource Management System

**MindX Web96 Capstone Project**
Repo: [github.com/cuonghoangwork/Mindx-Web96-HRMS](https://github.com/cuonghoangwork/Mindx-Web96-HRMS)

A full-stack HR management system covering the employee lifecycle end to end: four-tier role-based access control, attendance with an end-of-day closer, statutory Vietnamese overtime and payroll, a five-type leave system, performance review cycles with appeals, recruiting, holidays, an org chart, an audit log, a self-service profile-edit queue, an HR-toggleable permission matrix, and multi-channel notifications (in-app SSE, desktop, Web Push, email, Telegram).

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Roles and Demo Credentials](#roles-and-demo-credentials)
- [Scheduled Jobs](#scheduled-jobs)
- [API Reference](#api-reference)
- [Testing and CI](#testing-and-ci)
- [Deployment](#deployment)
- [Database Schema](#database-schema)
- [Notes](#notes)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite 7, React Router v7 (lazy-loaded routes), Context API, custom design system ("Navy Signal Blue") |
| i18n | i18next / react-i18next — English and Vietnamese, lazily loaded locale bundles |
| Backend | Node.js 24, Express 4, MVC (router → controller → model → utils) |
| Database | MongoDB with Mongoose 8 |
| Authentication | JWT access + refresh tokens, forced password change on first login |
| Scheduling | node-cron (attendance close, payroll draft/run, promotion eligibility, annual raise, review reminders) |
| File storage | Cloudinary — avatars (images), contracts and employee documents (raw PDFs) |
| Notifications | Server-Sent Events, Web Push (VAPID + service worker), Nodemailer, Telegram bot |
| AI | Google Gemini — performance-review "Ask AI" insight and the in-app chat widget |
| Testing | Vitest everywhere; Supertest + mongodb-memory-server (backend), Testing Library + jsdom (frontend) |
| CI/CD | GitHub Actions (lint + test + build, both packages); Render Blueprint (`render.yaml`) |

---

## Project Structure

The repository root holds two independent npm packages — separate `package.json`, lockfile and Vitest config each.

```
Mindx-Web96-HRMS/
├── hrms-backend/               # Express API
│   ├── config/                 # Env loading, DB connection, Cloudinary
│   ├── controller/             # Request handlers
│   ├── model/                  # 23 Mongoose schemas
│   ├── router/                 # Express routes, mounted in router/index.js
│   ├── middleware/             # verifyToken, authorize, validate, upload, audit
│   ├── jobs/                   # node-cron scheduled jobs
│   ├── utils/                  # Payroll/overtime engines, notify spine, scoping helpers
│   ├── i18n/                   # Server-side copy for out-of-app messages (en/vi)
│   ├── scripts/                # One-off migrations and backfills
│   ├── tests/                  # 61 test files (unit + Supertest integration)
│   ├── postman/                # Exported Postman collection
│   ├── seed.js                 # Demo data seeding
│   └── .env.example            # Environment template — the source of truth
│
├── hrms-react/                 # React SPA
│   ├── public/                 # sw.js (Web Push), manifest.webmanifest, icon
│   └── src/
│       ├── api/                # API client and per-resource helpers
│       ├── components/         # Shared UI, modals, panels
│       ├── context/            # Auth, Store, Notification, Theme, Language, Currency
│       │   └── providers/      # Provider implementations, split from the contexts
│       ├── pages/              # Route pages + per-page feature folders
│       ├── i18n/locales/       # en / vi translation bundles
│       └── utils/              # Formatting, ids, desktopNotify, webPush, chunk errors
│
├── HTML demo/                  # Static HTML/CSS mockup the UI was ported from
├── .github/workflows/          # ci.yml, scheduled-jobs.yml
├── render.yaml                 # Render Blueprint (backend web service + static frontend)
├── hrms_schema_docs.md         # Full database schema documentation
├── WEB96_BACKEND_REFERENCE.md  # Course backend reference notes
└── README.md                   # This file
```

---

## Getting Started

### Prerequisites

- Node.js 24 (matches CI and `render.yaml`; 18+ will run locally)
- A MongoDB instance or MongoDB Atlas cluster
- Optional: Cloudinary, Gemini, SMTP, Telegram and VAPID credentials — every one of these degrades gracefully when unset

### Backend

```bash
cd hrms-backend
npm install
cp .env.example .env.dev
```

Fill in at minimum:

```env
CONNECT_STRING=mongodb://127.0.0.1:27017/hrms
AT_SECRETKEY=<random string>
RT_SECRETKEY=<a different random string>
CORS_ORIGIN=http://localhost:3000
```

Generate secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Seed and run:

```bash
npm run seed:env
npm run dev:env
```

The API listens on `http://localhost:8080`, mounted at `/api/v1`.

### Frontend

```bash
cd ../hrms-react
npm install
npm run dev
```

The client defaults to `http://localhost:8080/api/v1`. To point elsewhere, create `hrms-react/.env.development` (untracked) with:

```env
VITE_API_URL=http://localhost:8080/api/v1
```

### Useful scripts

| Command | Where | What it does |
|---|---|---|
| `npm run dev:env` | backend | Nodemon, `NODE_ENV=dev` |
| `npm run seed:env` | backend | Reseed the demo dataset |
| `npm start` | backend | Production start |
| `npm test` | both | Vitest, single run |
| `npm run dev` | frontend | Vite dev server |
| `npm run build` | frontend | Production build |
| `npm run lint` | frontend | ESLint with `--max-warnings 0` |

---

## Environment Variables

`hrms-backend/.env.example` is the source of truth and documents every variable inline, including the statutory reasoning behind the overtime limits. Summary:

**Required**

| Variable | Notes |
|---|---|
| `CONNECT_STRING` | MongoDB URI |
| `AT_SECRETKEY` / `RT_SECRETKEY` | Two *different* JWT secrets |
| `CORS_ORIGIN` | Frontend origin |

**Core options** — `NODE_ENV`, `PORT`, `AT_EXPIRES_IN`, `RT_EXPIRES_IN`, `ALLOW_PUBLIC_REGISTRATION`, `ACCOUNT_EMAIL_DOMAIN`, `APP_BASE_URL`.

**Uploads (Cloudinary)** — `CLOUD_NAME`, `API_KEY`, `API_SECRET`. Upload endpoints return a clear error when unset instead of crashing.

**Scheduler** — `ENABLE_SCHEDULER`, `SCHEDULER_TZ`, `CRON_CLOSE_ATTENDANCE`, `CRON_PROMOTION_ELIGIBILITY`, `CRON_MONTHLY_PAYROLL_DRAFT`, `CRON_MONTHLY_PAYROLL_RUN`, `CRON_ANNUAL_RAISE`, `CRON_PERFORMANCE_REMINDERS`, `WORKDAY_END`, `WORKDAY_LATE_AFTER`.

**Overtime** — `OT_WORKDAY_START`, `OT_WINDOW_END`, `OT_APPLY_CUTOFF`, `OT_NIGHT_START`, `OT_DAILY_CAP_HOURS`, `OT_RESTDAY_TOTAL_CAP`, `OT_MONTHLY_CAP_HOURS`, `OT_ANNUAL_CAP_HOURS`, `OT_PIT_EXEMPT`. Every one has a working default, so leaving the block unset is correct for a normal deployment.

> `OT_PIT_EXEMPT` has **inverted polarity** — unset or empty means *exempt*; only the literal string `false` switches it off.

**Payroll FX** — `FX_RATE_API_URL` (free tier, no key; falls back to a default rate and tags the snapshot `fallback`).

**Notifications** — SSE: `SSE_HEARTBEAT_MS`, `SSE_MAX_CONNECTION_MS`. Email: `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM`. Web Push: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. Telegram: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_MODE`, `TELEGRAM_WEBHOOK_URL`.

> No VAPID or Telegram value ever gets a `VITE_` prefix. The browser is handed the public push key at runtime by `GET /notifications/push`.

**AI** — `GEMINI_API_KEY`, `GEMINI_MODEL`. Unset returns a clean 503.

**Demo** — `DEMO_MODE`. When `true`, an `X-App-Now` header may override server time so date rules (such as the 13:00 overtime cutoff) can be demonstrated on demand. It bypasses *every* date rule and must be off in production; the server logs a startup warning when it is on.

Frontend (`hrms-react/.env.development`, untracked): `VITE_API_URL`.

---

## Roles and Demo Credentials

`ADMIN`, `HR`, `MANAGER` and `EMPLOYEE` are four distinct roles. `HR` is company-wide and unscoped; `MANAGER` is a line manager scoped to a single department (`utils/managerScope.js`). On top of the coarse `authorize()` role check, an ADMIN can switch individual MANAGER capabilities off in Settings — `approveLeaveRequests`, `reviewProfileEdits`, `manageAttendanceRecords`, `proposePromotions`, `approveOvertimeRequests`. That matrix can only ever make a role stricter, never wider.

Seeded by `npm run seed:env`:

| Role | Email | Password |
|---|---|---|
| Administrator (`ADMIN`) | `admin@hrms.com` | `admin123` |
| HR — company-wide (`HR`) | `hr@hrms.com` | `hr123456` |
| Manager — department-scoped (`MANAGER`) | `manager@hrms.com` | `manager123` |
| Employee | `john.doe@hrms.com` (and other seeded accounts) | `emp001pass` |

`manager@hrms.com` is seeded into Engineering.

---

## Scheduled Jobs

Registered from `hrms-backend/jobs/index.js` when `ENABLE_SCHEDULER=true`. On hosts that sleep while idle (Render's free plan), turn the scheduler off and drive the equivalent endpoints from an external scheduler — `.github/workflows/scheduled-jobs.yml` does exactly that.

| Job | Default schedule | What it does |
|---|---|---|
| `closeAttendanceDay` | `0 23 * * *` | Auto clock-out, `late` / `no-show` resolution, half-day leave deduction, overtime recompute |
| `checkPromotionEligibility` | `0 2 * * *` | Raises system-generated promotion requests from tenure-in-level |
| `generateMonthlyPayrollDraft` | `0 1 1 * *` | FX snapshot + draft period for the new month (no-op if one exists) |
| `runMonthlyPayroll` | `0 3 10 * *` | The official monthly run |
| `annualSalaryRaise` | `0 4 * * *` | Flags +10% annual-raise candidates |
| `performanceReminders` | `0 9 * * *` | Role-aware reminders for reviews due within 7 days |

Keep `CRON_CLOSE_ATTENDANCE` clear of the overtime window, which ends at 22:00 — a 22:00 run would close records mid-shift.

---

## API Reference

Base URL: `/api/v1`. Every route requires a bearer access token except `GET /api/v1/health`, the auth entry points, and the Telegram webhook (which is protected by its secret path).

### Health
- `GET /health` — public, no auth; used by Render's health check

### Auth
- `GET /auth/config` · `POST /auth/register` · `POST /auth/login` · `POST /auth/refresh-token` · `POST /auth/logout`
- `GET /auth/me` · `POST /auth/change-password`
- `GET /auth/users` · `PATCH /auth/users/:id/promote` *(ADMIN)*

### Employees
- `GET /employees/me` · `GET /employees` · `GET /employees/:id`
- `POST /employees` *(ADMIN, HR)* · `PUT /employees/:id` *(ADMIN, HR, MANAGER own dept)* · `DELETE /employees/:id` *(ADMIN)*
- `POST /employees/:id/avatar`
- `POST /employees/:id/contract` *(ADMIN, HR, MANAGER)*
- `POST /employees/:id/documents` · `DELETE /employees/:id/documents/:docId` *(ADMIN, HR, MANAGER)*

### Departments
- `GET /departments` · `GET /departments/:id` · `POST /departments` · `PUT /departments/:id` · `DELETE /departments/:id`

### Attendance
- `GET /attendance` · `POST /attendance/check-in` · `POST /attendance/check-out`
- `POST /attendance/close-day` — manual trigger for the end-of-day closer
- `PUT /attendance/:id` · `DELETE /attendance/:id`

### Leave Requests
- `GET /leave-requests/balance` · `GET /leave-requests/balances` *(ADMIN, HR, MANAGER)*
- `GET /leave-requests` · `POST /leave-requests` · `PATCH /leave-requests/:id/review`

### Overtime Requests
- `GET /overtime-requests/balance` — remaining daily / monthly / annual allowance
- `GET /overtime-requests` · `POST /overtime-requests` — an employee applies for themselves
- `POST /overtime-requests/assign` *(ADMIN, HR, MANAGER)* — bulk assignment
- `PATCH /overtime-requests/:id/review` · `DELETE /overtime-requests/:id` — owner withdraws before the cutoff

### Payroll
- `GET /payroll/my-payslips`
- `GET /payroll/periods` · `POST /payroll/periods` · `DELETE /payroll/periods/:id`
- `POST /payroll/periods/:id/regenerate` · `GET /payroll/periods/:id/payslips` · `PATCH /payroll/periods/:id/status`
- `POST /payroll/generate-monthly-draft` · `POST /payroll/run-monthly`
- `GET /payroll/fx-rate/:year/:month`
- `PATCH /payroll/payslips/:id` · `POST /payroll/payslips/:id/recompute-deduction`

### Performance
- `GET /performance/meta`
- `GET /performance/cycles` · `POST /performance/cycles` · `PATCH /performance/cycles/:key`
- `GET /performance/cycles/:key/roster` · `/analytics` · `/comparison`
- `GET /performance/reviews/:cycleKey/:employeeId`
- `PATCH .../self` · `PATCH .../manager` · `PATCH .../competencies`
- `POST .../goals` · `PATCH .../goals/:goalId` · `POST .../peer-feedback`
- `POST .../appeal` · `PATCH .../appeal`
- `POST .../ai-insight` · `POST /performance/send-reminders` *(ADMIN)*

### Position Levels
- `GET /position-levels` · `PATCH /position-levels/:level`

### Promotion Requests
- `GET /promotion-requests` · `POST /promotion-requests` · `PATCH /promotion-requests/:id/review`
- `POST /promotion-requests/check-eligibility` · `POST /promotion-requests/annual-raise`

### No-Show Reviews
- `GET /no-show-reviews` · `PATCH /no-show-reviews/:id/review`

### Profile Edit Requests
- `GET /profile-edit-requests` · `POST /profile-edit-requests` · `PATCH /profile-edit-requests/:id/review`

### Jobs / Candidates / Holidays
- `GET|POST /jobs` · `GET|PUT|DELETE /jobs/:id`
- `GET|POST /candidates` · `GET|PUT|DELETE /candidates/:id`
- `GET|POST /holidays` · `PUT|DELETE /holidays/:id`

### Notifications
- `GET /notifications` · `POST /notifications` · `GET /notifications/recipients`
- `PATCH /notifications/:id/read` · `PATCH /notifications/read-all`
- `DELETE /notifications/:id` · `DELETE /notifications/clear-read`
- `GET /notifications/stream-ticket` · `GET /notifications/stream` — SSE handshake and live stream
- `GET /notifications/preferences` · `PATCH /notifications/preferences`
- `GET /notifications/push` · `POST /notifications/push/subscribe` · `DELETE /notifications/push/subscribe`
- `GET /notifications/telegram` · `POST /notifications/telegram/link-code` · `DELETE /notifications/telegram`
- `POST /notifications/telegram/webhook/:secret` — called by Telegram, not by the app

### Permissions
- `GET /permissions` · `PATCH /permissions/:role/:capability` *(ADMIN)*

### Audit Log
- `GET /audit-log/recent` · `GET /audit-log`

### AI
- `POST /ai/chat` — in-app assistant

A Postman collection lives in `hrms-backend/postman/`.

---

## Testing and CI

```bash
cd hrms-backend && npm test     # 61 test files — unit + Supertest integration
cd hrms-react   && npm test     # 25 test files — Testing Library + jsdom
cd hrms-react   && npm run lint # zero-warnings gate
```

The backend suite starts its own in-process MongoDB via `mongodb-memory-server`, so no database service is needed — but it downloads a `mongod` binary on the first run of a fresh cache, which is why `vitest.config.js` allows a long hook timeout. Environments with restricted egress cannot run these tests.

`.github/workflows/ci.yml` runs both packages as two independent jobs on every push and pull request: lint → test for the frontend, test → build for the backend, on Node 24.

---

## Deployment

`render.yaml` is a committed Render Blueprint describing both services:

- **hrms-backend** — Node web service, `rootDir: hrms-backend`, `npm install` / `npm start`, health check at `/api/v1/health`
- **hrms-frontend** — static site, `rootDir: hrms-react`, `npm install && npm run build`, with a rewrite rule for SPA routing

MongoDB Atlas backs production. On the free plan the instance sleeps when idle, so set `ENABLE_SCHEDULER=false` and let `.github/workflows/scheduled-jobs.yml` drive the jobs instead.

---

## Database Schema

23 collections:

`users` · `employees` · `departments` · `attendance` · `jobs` · `candidates` · `holidays` · `notifications` · `auditlogs` · `exchangeRates` · `leaveRequests` · `noShowReviews` · `overtimeRequests` · `payrollPeriods` · `payslips` · `performanceCycles` · `performanceReviews` · `positionLevels` · `profileEditRequests` · `promotionRequests` · `pushSubscriptions` · `rolePermissions` · `telegramLinkCodes`

See [`hrms_schema_docs.md`](./hrms_schema_docs.md) for the full field-by-field documentation, indexes and enum reference.

---

## Notes

- The frontend and backend are separate apps within the same repository; install dependencies in each.
- Only `.env.example` is tracked — real `.env.*` files are ignored.
- Cloudinary, Gemini, SMTP, Telegram and VAPID credentials are all optional. Each degrades gracefully: the feature logs once and no-ops rather than crashing the server.
- `HTML demo/` is the static mockup the React UI was ported from, kept for design reference.
