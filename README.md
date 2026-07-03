# HRMS — Human Resource Management System

**MindX Web96 Capstone Project**
Repo: [github.com/cuonghoangwork/Mindx-Web96-HRMS](https://github.com/cuonghoangwork/Mindx-Web96-HRMS)

A complete full-stack HR management system with employee lifecycle workflows, role-based access control, attendance tracking, payroll support, recruiting and candidate management, holidays, notifications, audit logging, and a self-service profile edit request flow.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Demo Credentials](#demo-credentials)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Notes](#notes)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 with Vite, React Router v6, Context API, custom design system |
| Backend | Node.js, Express, MVC architecture |
| Database | MongoDB with Mongoose |
| Authentication | JWT access + refresh tokens |
| File storage | Cloudinary for avatars |
| Testing | Vitest + Supertest + mongodb-memory-server |

---

## Project Structure

```
repo/hr-management-system/
├── hrms-backend/          # Backend server
│   ├── controller/         # Request handlers
│   ├── model/              # Mongoose schemas
│   ├── router/             # Express routes
│   ├── middleware/         # Auth, validation, upload, audit
│   ├── utils/              # Helpers and services
│   ├── seed.js             # Demo data seeding
│   └── .env.example        # Environment template

├── hrms-react/            # Frontend app
│   ├── src/api/            # API client and helpers
│   ├── src/components/     # Reusable UI components and modals
│   ├── src/context/        # App state and auth contexts
│   ├── src/pages/          # Route pages
│   └── .env.development    # Frontend env config

└── README.md              # This file
```

---

## Getting Started

### Prerequisites
- Node.js 18+
- MongoDB instance or MongoDB Atlas cluster
- Optional: Cloudinary account for avatar uploads

### Backend Setup

```bash
cd repo/hr-management-system/hrms-backend
npm install
cp .env.example .env.dev
```

Edit `.env.dev` with:

```env
CONNECT_STRING=mongodb://127.0.0.1:27017/hrms
AT_SECRETKEY=<random string>
RT_SECRETKEY=<a different random string>
CORS_ORIGIN=http://localhost:3000
CLOUD_NAME=
CLOUD_API_KEY=
CLOUD_API_SECRET=
```

Generate secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Start the backend:

```bash
npm run seed:env
npm run dev:env
```

The backend runs by default on `http://localhost:8080`.

### Frontend Setup

```bash
cd ../hrms-react
npm install
npm run dev
```

If the backend is not on `http://localhost:8080/api/v1`, set `VITE_API_URL` in `hrms-react/.env.development`.

### Run Backend Tests

```bash
cd ../hrms-backend
npm test
```

---

## Environment Variables

### Backend (`hrms-backend/.env.example`)

```env
NODE_ENV=dev
PORT=8080
CONNECT_STRING=
AT_SECRETKEY=
RT_SECRETKEY=
AT_EXPIRES_IN=20m
RT_EXPIRES_IN=4w
CORS_ORIGIN=http://localhost:3000
CLOUD_NAME=
CLOUD_API_KEY=
CLOUD_API_SECRET=
```

### Frontend (`hrms-react/.env.development`)

```env
VITE_API_URL=http://localhost:8080/api/v1
```

---

## Demo Credentials

Seeded by `npm run seed:env`:

| Role | Email | Password |
|---|---|---|
| Administrator | `admin@hrms.com` | `admin123` |
| HR / Manager | `hr@hrms.com` | `hr123456` |
| Employee | `john.doe@hrms.com` (and other seeded accounts) | `emp001pass` |

---

## API Reference

Base URL: `/api/v1`.

### Auth
- `POST /auth/register` — Create an employee account
- `POST /auth/login` — Returns `{ access_token, refresh_token, user }`
- `POST /auth/refresh-token` — Exchange refresh token for new tokens
- `POST /auth/logout` — Clear refresh token
- `GET /auth/me` — Current user profile
- `GET /auth/users` — Admin list accounts
- `PATCH /auth/users/:id/promote` — Admin promote/demote role

### Employees
- `GET /employees/me`
- `GET /employees`
- `GET /employees/:id`
- `POST /employees`
- `PUT /employees/:id`
- `DELETE /employees/:id`
- `POST /employees/:id/avatar`

### Departments
- `GET /departments`
- `GET /departments/:id`
- `POST /departments`
- `PUT /departments/:id`
- `DELETE /departments/:id`

### Attendance
- `GET /attendance`
- `POST /attendance/check-in`
- `POST /attendance/check-out`
- `PUT /attendance/:id`
- `DELETE /attendance/:id`

### Jobs
- `GET /jobs`
- `GET /jobs/:id`
- `POST /jobs`
- `PUT /jobs/:id`
- `DELETE /jobs/:id`

### Candidates
- `GET /candidates`
- `GET /candidates/:id`
- `POST /candidates`
- `PUT /candidates/:id`
- `DELETE /candidates/:id`

### Holidays
- `GET /holidays`
- `POST /holidays`
- `PUT /holidays/:id`
- `DELETE /holidays/:id`

### Notifications
- `GET /notifications`
- `GET /notifications/recipients`
- `POST /notifications`
- `PATCH /notifications/:id/read`
- `PATCH /notifications/read-all`
- `DELETE /notifications/:id`
- `DELETE /notifications/clear-read`

### Profile Edit Requests
- `GET /profile-edit-requests`
- `POST /profile-edit-requests`
- `PATCH /profile-edit-requests/:id/review`

### Audit Log
- `GET /audit-log/recent`
- `GET /audit-log`

---

## Database Schema

Collections:
- `users`
- `employees`
- `departments`
- `attendance`
- `jobs`
- `candidates`
- `holidays`
- `notifications`
- `auditlogs`
- `profileEditRequests`

See `hrms_schema_docs.md` for full schema documentation.

---

## Notes

- The frontend and backend are separate apps within the same repository.
- Only `.env.example` files are tracked; actual `.env.*` files are ignored.
- Cloudinary credentials are optional and required only for avatar uploads.
- Use `npm install` in both `hrms-backend` and `hrms-react` before running locally.
