# HRMS Database Schema Documentation

> **Database**: MongoDB (Mongoose ODM)  
> **Project**: MindX WEB96 Capstone — Human Resource Management System

---

## Collections Overview

| Collection | Documents | Key Indexes |
|---|---|---|
| `users` | Auth accounts | `email` (unique) |
| `employees` | Employee profiles | `email`, `employeeId` (unique); `department`, `status` |
| `departments` | Org units | `name` (unique) |
| `attendance` | Daily check-in/out | `(employee, date)` (unique) |
| `jobs` | Job openings | `status`, `department` |
| `candidates` | Job applicants | `job`, `stage` |
| `holidays` | Public/company holidays | `(name, date)` (unique) |
| `notifications` | System notifications | `user`, `read`, `category` |

---

## Relationships

```
users ──────────────────────── employees   (1:1 optional — user.employee → employees._id)
departments ─────────────────► employees   (1:N — employee.department → departments._id)
departments ─────────────────── employees  (1:1 optional — department.manager → employees._id)
employees ───────────────────► attendance  (1:N — attendance.employee → employees._id)
departments ─────────────────► jobs        (1:N — job.department → departments._id)
jobs ────────────────────────► candidates  (1:N — candidate.job → jobs._id)
users ───────────────────────► notifications (1:N — notification.user → users._id, null = broadcast)
```

---

## Collections Detail

### `users`
Auth accounts linked optionally to an employee record.

| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | MongoDB primary key |
| `email` | String | ✅ | Unique, lowercase |
| `password` | String | ✅ | bcrypt hashed |
| `name` | String | ✅ | |
| `role` | String | ✅ | `ADMIN` \| `MANAGER` \| `EMPLOYEE` |
| `employee` | ObjectId | — | Ref → `employees._id` |
| `refreshToken` | String | — | Null after logout |
| `createdAt` | Date | auto | |
| `updatedAt` | Date | auto | |

---

### `employees`
Core HR record for every staff member.

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
| `department` | ObjectId | — | Ref → `departments._id` |
| `designation` | String | — | Job title |
| `startDate` | Date | — | |
| `contractType` | String | — | `full-time` \| `part-time` \| `contract` \| `intern` |
| `status` | String | — | `active` \| `on-leave` \| `terminated` |
| `annualSalary` | Number | — | Default `0` |
| `avatar` | String | — | URL |
| `createdAt` | Date | auto | |
| `updatedAt` | Date | auto | |

---

### `departments`
Organizational units. A department can have a manager (employee reference).

| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | |
| `name` | String | ✅ | Unique |
| `manager` | ObjectId | — | Ref → `employees._id` |
| `budget` | Number | — | Default `0` |
| `createdAt` | Date | auto | |
| `updatedAt` | Date | auto | |

---

### `attendance`
One record per employee per day. Unique compound index on `(employee, date)`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | |
| `employee` | ObjectId | ✅ | Ref → `employees._id` |
| `date` | Date | ✅ | |
| `checkIn` | String | — | e.g. `09:00` |
| `checkOut` | String | — | e.g. `18:00` |
| `hours` | Number | — | Default `0` |
| `status` | String | — | `present` \| `late` \| `on-leave` \| `absent` |
| `createdAt` | Date | auto | |
| `updatedAt` | Date | auto | |

> **Compound unique index**: `{ employee: 1, date: 1 }`

---

### `jobs`
Open job positions posted by a department.

| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | |
| `title` | String | ✅ | |
| `department` | ObjectId | — | Ref → `departments._id` |
| `location` | String | — | Not in the original doc, but the frontend has always collected it |
| `status` | String | — | `open` \| `filled` \| `closed` |
| `type` | String | — | `full-time` \| `part-time` \| `contract` \| `intern` |
| `description` | String | — | Job description (JD) |
| `requirements` | String[] | — | Task 5.1 — one entry per bullet. Default `[]` |
| `benefits` | String[] | — | Task 5.1 — one entry per bullet. Default `[]` |
| `salaryMin` | Number | — | Task 5.1 — optional, `null` if unset |
| `salaryMax` | Number | — | Task 5.1 — optional, `null` if unset |
| `salaryCurrency` | String | — | Task 5.1 — default `"USD"` |
| `companyInfo` | String | — | Task 5.1 — default `""` |
| `applicationInstructions` | String | — | Task 5.1 — where/how to apply (URL, email, or free text). Default `""` |
| `deadline` | Date | — | Task 5.1 — informational only; nothing auto-closes the posting when it passes |
| `postedDate` | Date | — | Default `now` |
| `createdAt` | Date | auto | |
| `updatedAt` | Date | auto | |

---

### `candidates`
Applicants per job, tracked through a hiring pipeline.

| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | |
| `name` | String | ✅ | |
| `email` | String | ✅ | |
| `phone` | String | — | |
| `job` | ObjectId | ✅ | Ref → `jobs._id` |
| `stage` | String | — | `applied` → `screening` → `interview` → `offer` → `hired` \| `rejected` |
| `rating` | Number | — | 0–5 |
| `resumeUrl` | String | — | URL |
| `notes` | String | — | |
| `appliedDate` | Date | — | Default `now` |
| `createdAt` | Date | auto | |
| `updatedAt` | Date | auto | |

---

### `holidays`
Public and company-wide holidays. Unique on `(name, date)`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | |
| `name` | String | ✅ | |
| `date` | Date | ✅ | |
| `type` | String | — | `public` \| `company` \| `optional` |
| `createdAt` | Date | auto | |
| `updatedAt` | Date | auto | |

---

### `notifications`
System-generated events. `user: null` = broadcast to all.

| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | |
| `user` | ObjectId | — | Ref → `users._id`, null = broadcast |
| `category` | String | ✅ | `leave` \| `hiring` \| `payroll` \| `employee` \| `holiday` \| `system` |
| `title` | String | ✅ | |
| `message` | String | — | |
| `read` | Boolean | — | Default `false` |
| `createdAt` | Date | auto | |
| `updatedAt` | Date | auto | |

---

## Enum Reference

| Collection.Field | Values |
|---|---|
| `users.role` | `ADMIN`, `MANAGER`, `EMPLOYEE` |
| `employees.gender` | `male`, `female`, `other` |
| `employees.contractType` | `full-time`, `part-time`, `contract`, `intern` |
| `employees.status` | `active`, `on-leave`, `terminated` |
| `attendance.status` | `present`, `late`, `on-leave`, `absent` |
| `jobs.status` | `open`, `filled`, `closed` |
| `jobs.type` | `full-time`, `part-time`, `contract`, `intern` |
| `candidates.stage` | `applied`, `screening`, `interview`, `offer`, `hired`, `rejected` |
| `holidays.type` | `public`, `company`, `optional` |
| `notifications.category` | `leave`, `hiring`, `payroll`, `employee`, `holiday`, `system` |
