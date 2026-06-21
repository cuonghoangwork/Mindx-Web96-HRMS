# HRMS Backend

Express + MongoDB (Mongoose) backend for the MindX Web96 HRMS capstone, built to the
conventions in `WEB96_BACKEND_REFERENCE.md` (lesson9 pattern: MVC, JWT AT/RT with two
secrets, password hashing, `authorize(...roles)` middleware, paginated list responses) and
the collections in `hrms_schema_docs.md`.

> Note: uses **`bcryptjs`** rather than `bcrypt`. Same `hashSync`/`compareSync` API as the
> reference doc, but pure JavaScript — no native build step (`node-gyp`), which avoids a
> common install failure on machines without build tools / Python set up.

## Structure

```
hrms-backend/
├── index.js                entry point: env, DB connect, app, error handler
├── config/db.js            mongoose connection
├── model/                   one Mongoose schema per collection (DB shape, per hrms_schema_docs.md)
├── controller/               business logic; maps req.body/query <-> DB shape via utils/, then calls *ToClient() before responding
├── router/                   express.Router() per resource, mounted under /api/v1
├── middleware/auth.js        verifyToken + authorize(...roles)
└── utils/
    ├── tokens.js            signs AT/RT pairs
    ├── mappers.js           pure functions: DB doc <-> frontend-shaped JSON (enum casing, field names, dates, ids)
    └── refResolvers.js      async lookups: department/manager display name -> ObjectId
```

## Setup

```bash
npm install
cp .env.example .env.dev   # fill in CONNECT_STRING, AT_SECRETKEY, RT_SECRETKEY
npm run dev:env            # nodemon, reads .env.dev
```

Server listens on `PORT` (default 8080), all routes mounted under `/api/v1`.

## Auth flow

- `POST /api/v1/auth/register` — creates a `User` (role defaults to `EMPLOYEE`; `ADMIN` can't
  be self-assigned, must be promoted manually/by another admin later)
- `POST /api/v1/auth/login` — returns `{ access_token, refresh_token, user }`
- `POST /api/v1/auth/refresh-token` — exchanges a valid refresh token for a new pair
- `POST /api/v1/auth/logout` — clears the stored refresh token (requires `Authorization: Bearer <access_token>`)
- `GET /api/v1/auth/me` — current user from the access token

All other routes require `Authorization: Bearer <access_token>`. Mutating routes are
additionally gated with `authorize("ADMIN", "MANAGER")` or `authorize("ADMIN")` per the
reference doc's role conventions.

## List endpoints

Employees/Jobs/Candidates/Attendance follow the `{ totalItems, totalPages, currentPage, items }`
envelope from the reference doc, driven by `?pageNumber=&pageSize=&search=&sortBy=&sortDir=`
query params (department/status/stage/type filters added per-resource where it matches the
frontend's existing filter UI — see below, these accept the frontend's *client-shaped* labels,
e.g. `?status=Active`, not the DB's `active`).

## Response/Request Mapping Layer

Every controller routes Mongoose documents through `utils/mappers.js` before sending JSON,
and `req.body`/filter query params through the same module before writing to or querying the
DB. This means the database keeps the exact shape documented in `hrms_schema_docs.md`, while
the API speaks the vocabulary the frontend (`StoreContext.jsx` and every page that reads it)
already uses — no frontend changes needed for any of the translations below.

**Enum casing** (`utils/mappers.js`, both directions):

| Resource.field | API / frontend value | DB value |
|---|---|---|
| `employee.status` | `Active` / `On Leave` / `Terminated` | `active` / `on-leave` / `terminated` |
| `employee.type` | `Full-time` / `Part-time` / `Contract` / `Intern` | `full-time` / `part-time` / `contract` / `intern` |
| `employee.sex` | `Male` / `Female` / `Other` | `male` / `female` / `other` |
| `job.status` | `Open` / `Filled` / `Closed` | `open` / `filled` / `closed` |
| `job.type` | same as `employee.type` | same as `employee.contractType` |
| `candidate.stage` | `Applied` → `Screening` → `Interview` → `Offer` → `Hired` / `Rejected` | lowercase equivalents |
| `holiday.type` | `Public` / `Company` / `Optional` | `public` / `company` / `optional` |
| `attendance.status` | `Present` / `Late` / `On Leave` / `Absent` | `present` / `late` / `on-leave` / `absent` |
| `notification.category` | `interview` (matches the frontend's actual category, not the schema doc's `hiring`) | `hiring` |

**Field renames** (API ↔ DB): `employee.type↔contractType`, `employee.sex↔gender`,
`employee.salary↔annualSalary`, `candidate.jobId↔job`, `attendance.employeeId↔employee`,
`notification.timestamp↔createdAt`. Every response also exposes Mongo's `_id` as `id` (string).

**Reference resolution** (`utils/refResolvers.js`, async — needs a DB query, so it lives
outside the pure mapper functions and is called directly by the controllers):
- `employee.department` / `job.department` — the frontend sends/expects a department **name**
  string (e.g. `"Engineering"`); the controller resolves it to/from the Department's ObjectId.
  Creating/updating with an unknown department name throws a clear 400 rather than silently
  creating a new department.
- `department.manager` — the frontend's `AddDepartmentModal` collects this as **free text**,
  not a picked employee, so there's no real ObjectId to resolve most of the time. Added a
  `managerName` string field to `model/Department.js` (not in `hrms_schema_docs.md`, but a
  minimal, additive extension) that always preserves exactly what was typed; the resolver
  *also* opportunistically links the documented `manager` ObjectId ref if an Employee with a
  matching name exists, for relational integrity when it's available. The response prefers
  `managerName`, falling back to the linked employee's name.

## ⚠️ Still a frontend-side task: ID types

The mapping layer fixes field names, enum casing, and ref-to-name conversion — but it can't
fix the fact that MongoDB issues 24-character hex string `_id`s, while the current frontend
mock data assumes **numeric, sequential IDs** (`Date.now()` / `Math.max(...ids) + 1` when
creating, `Number(id)` when reading a route param like `/employees/:id`). That's a real
behavior change, not just a naming one, and has to happen on the frontend when it's wired to
this API:
- Drop client-generated IDs; use the `id` the API returns from `create()`.
- Change `Number(id)` / `employee.id === Number(routeParam)` style comparisons to plain string
  equality.

Everything else (the field names, enum values, department/manager display strings) now matches
what the frontend already expects, so that swap should be the only remaining piece.
