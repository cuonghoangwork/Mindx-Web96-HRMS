# WEB96 Backend Course — Reference Summary

**Course:** MindX WEB96 — Backend & Fullstack Track
**Lesson docs:** Lessons 1–13 (Vietnamese course material)
**Code repo:** [github.com/phamdactai9x66/WEB96](https://github.com/phamdactai9x66/WEB96)
**Verified against:** live repo content for `lesson1`, `lesson2`, `lesson3`, `lesson4`, `lesson9` (the only lessons with committed code; lessons 5–8 and 10–13 are concept-only docs with no companion code folder in the repo)

This document exists as a single reference point for backend API conventions to apply when building the HRMS backend — patterns, file structure, and code shapes are pulled directly from the course's own progression rather than reconstructed from memory.

---

## Course Progression at a Glance

| Lesson | Topic | Repo folder | Has code? |
|---|---|---|---|
| 1 | Raw Node `http` web server | `lesson1/` | ✅ |
| 2 | Express.js basics | `lesson2/` | ✅ |
| 3 | JSON Server (mock RESTful DB) + try/catch error handling | `lesson3/` | ✅ |
| 4 | MongoDB + Mongoose, env-based config | `lesson4/` | ✅ |
| 5 | MVC pattern, middleware, Express Router | — | doc only |
| 6 | Authentication vs. Authorization concepts | — | doc only |
| 7 | Password hashing (bcrypt), `.env` files | — | doc only |
| 8 | JWT structure, Access Token / Refresh Token | — | doc only |
| 9 | Database relationships (1-1, 1-n, n-n) + full MVC app | `lesson9/` | ✅ |
| 10 | File upload — Multer + Cloudinary | — | doc only |
| 11 | Data management — pagination, search, sort | — | doc only |
| 12 | Deployment (Render) + CORS | — | doc only |
| 13 | Redux Toolkit (frontend state) + ProtectedRoute | — | doc only |

`lesson9` is the most complete and current example — it folds together MVC, JWT (AT/RT with separate secrets), bcrypt, role-based authorization, pagination/search, and Cloudinary file upload into one working app. **Treat `lesson9` as the canonical pattern reference** when scaffolding the HRMS backend; earlier lessons show the same ideas in simpler/earlier form.

---

## 1. Raw HTTP Server (Lesson 1)

Before Express, the course starts with Node's built-in `http` module and manual routing via `request.url` string matching:

```javascript
import http from "http";
import { customers, orders } from "./data.js";

const app = http.createServer((request, response) => {
  const endpoint = request.url;
  switch (endpoint) {
    case "/customers":
      response.end(JSON.stringify(customers));
      break;
    default:
      if (request.method === "GET" && endpoint.startsWith("/customers/") && endpoint.endsWith("/orders")) {
        const idCustomer = endpoint.split("/")[2];
        const filterOrder = orders.filter((o) => o.customerId === idCustomer);
        response.end(JSON.stringify(filterOrder));
      }
      // ...more manual route matching
  }
});
```

Not used in later lessons once Express is introduced — included here only because it's the conceptual starting point (manual routing, no middleware, no framework).

---

## 2. Express.js Basics (Lesson 2)

Introduces `express()`, `app.get/post`, `express.json()` body parsing, and in-memory data arrays (reset on restart).

```javascript
import express from "express";
const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.send({ message: "Hello MindX-er" });
});

app.listen(8080, () => console.log("Server is running!"));
```

---

## 3. JSON Server + Error Handling (Lesson 3)

### Mock database via `json-server`
```bash
npm install -g json-server
json-server --watch db.json
```
`db.json` models resources as top-level keys (`users`, `posts`, `comments`), each an array of documents — same shape conventions later carried into Mongoose collections.

### Dev tooling
- **`concurrently`** — run Express + json-server with one command (`npm run dev`)
- **`nodemon`** — auto-restart on file change (`nodemon index.js`)

### Calling json-server from Express
```javascript
app.get('/users', (req, res) => {
  fetch('http://localhost:3000/users')
    .then((rs) => rs.json())
    .then((data) => res.send({ message: 'Hello MindX-er', data }));
});
```

### Error handling pattern — `try/catch` + `throw new Error(...)`
This is the baseline error-handling convention used in **every subsequent lesson's controllers**:

```javascript
app.post('/register', (req, res) => {
  try {
    const { userName, email, password } = req.body;
    if (!userName) throw new Error('userName is required!');
    if (!email) throw new Error('email is required!');
    if (!password) throw new Error('password is required!');

    const newUser = users.push({ userName, email, password });
    res.status(201).send({ data: newUser, success: true, error: 'Đăng ký tài khoản thành công' });
  } catch (error) {
    res.status(403).send({ data: null, success: false, error: error.message });
  }
});
```

**Convention:** every controller method wraps its logic in `try/catch`; validation failures `throw new Error('message')` and the `catch` block sends a uniform `{ data: null, success: false, error/message: ... }` response shape with `403` (or `400`/`404`/`500` depending on the failure type — this varies slightly across lessons; lesson9 standardizes more on `400`/`401`/`403`/`404`/`500` per-situation).

---

## 4. MongoDB + Mongoose (Lesson 4)

### Connection + env-per-mode pattern
```javascript
import dotenv from "dotenv";
const env = process.env.NODE_ENV || "dev";
dotenv.config({ path: `.env.${env}` });

mongoose.connect(url_db).then(() => {
  console.log("Connected to MongoDB");
  app.listen(process.env.PORT, () => console.log("Server is running!"));
});
```
`package.json` scripts select the environment file at launch:
```json
"scripts": {
  "dev:env": "cross-env NODE_ENV=dev nodemon index.js",
  "uat:env": "cross-env NODE_ENV=uat nodemon index.js",
  "production:env": "cross-env NODE_ENV=production nodemon index.js"
}
```
This `cross-env NODE_ENV=<mode>` → `dotenv.config({ path: \`.env.${env}\` })` pattern is used consistently through `lesson9` and is the recommended approach for the HRMS backend (`.env.dev`, `.env.production`, etc., never `.env` committed to git).

### Mongoose model definition
```javascript
import mongoose from "mongoose";
const userSchema = new mongoose.Schema({
  email: String,
  password: String,
  salt: String,
});
const UsersModel = mongoose.model("users", userSchema);
export default UsersModel;
```

### JWT Access Token + Refresh Token issued together at login
```javascript
const access_token = jwt.sign({ ...userData, tokenType: "AT" }, process.env.SECRET_KEY, { expiresIn: "20m" });
const refresh_token = jwt.sign({ ...userData, tokenType: "RT" }, process.env.SECRET_KEY, { expiresIn: "4w" });
```
A `tokenType` field (`"AT"` vs `"RT"`) is embedded in the payload so middleware can reject a refresh token presented where an access token is expected, and vice versa. `lesson4` uses one shared `SECRET_KEY` for both; `lesson9` improves this by using **two separate secrets** (see §6 below).

---

## 5. MVC Pattern & Middleware (Lesson 5 — concept doc)

Maps cleanly onto the project's actual split:
- **View** → React frontend (client)
- **Model** → Mongoose schemas (`model/*.js`)
- **Controller** → handler functions (`controller/*.js`)

### Folder structure convention (carried through lesson4 → lesson9)
```
project/
├── index.js              ← entry point, mounts routers, connects DB
├── model/ (or Model/)     ← Mongoose schemas, one file per collection
├── controller/            ← business logic, exported as an object of methods
├── routers/ (or Router/)  ← express.Router() per resource, wires routes → controller methods
├── middlewares/ (or middleware/) ← auth, validation, logging
└── .env.<mode>
```

### Controller convention
A controller file exports a single object whose keys are handler methods:
```javascript
const customerController = {
  getCustomer: async (req, res) => { /* ... */ },
  getDetailCustomer: async (req, res) => { /* ... */ },
  createCustomer: async (req, res) => { /* ... */ },
  // ...
};
export default customerController;
```

### Router convention
```javascript
import { Router } from 'express';
const router = Router();
router.get('/', controller.getAll);
router.get('/:id', controller.getDetail);
router.post('/', controller.create);
export default router;
```

### Mounting routers with a common prefix
```javascript
// routers/index.js
const rootRouter = Router();
rootRouter.use('/users', userRouter);
export default rootRouter;

// index.js
app.use('/api/v1', rootRouter);
```
This `/api/v1` prefix pattern is recommended for the HRMS backend so versioning is possible later without breaking existing client calls.

### Middleware types covered
1. **Builtin** — e.g. `express.json()`
2. **Custom** — `function myLogger(req, res, next) { ...; next(); }`
3. **Stacked** — multiple `app.use()` calls run in registration order
4. **Route-specific** — passed as an extra argument to `router.get(path, middlewareFn, handlerFn)`

---

## 6. Authentication & Authorization (Lesson 6 — concept doc, refined in lesson9)

### Conceptual split
- **Authentication** = "who are you" (login, identity verification)
- **Authorization** = "what are you allowed to do" (role/permission check, runs *after* authentication)

### Middleware module convention
```javascript
// middlewares/auth.js
const authMiddleware = {
  authentication: (req, res, next) => { /* verify identity */ },
  auhthorizationAdmin: (req, res, next) => { /* check role === 'admin' */ },
};
export default authMiddleware;
```

### Production-grade version (from `lesson9/middleware/auth.js`) — **this is the pattern to reuse**
```javascript
import jwt from "jsonwebtoken";

export const verifyToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // "Bearer <token>"
  if (!token) return res.status(401).json({ message: "No token provided." });

  try {
    const decoded = jwt.verify(token, process.env.SECRET_KEY);
    if (decoded.tokenType !== "AT")
      return res.status(401).json({ message: "Invalid token type." });
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ message: "Token is invalid or expired." });
  }
};

// Variadic — supports any number of allowed roles per route
export const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role))
    return res.status(403).json({ message: "Access denied." });
  next();
};
```

Usage on a route — stack `verifyToken` then `authorize(...)`:
```javascript
router.post("/create_employee", verifyToken, authorize("MANAGER"), managersController.createEmployee);
router.get("/employees", verifyToken, authorize("MANAGER", "EMPLOYEE"), managersController.getAllEmployees);
```

This `authorize(...roles)` higher-order-function pattern is the recommended approach for HRMS role gating (e.g. `authorize("Administrator")`, `authorize("HR", "Administrator")` matching the three roles already defined in the frontend's `Register.jsx`: Employee / HR / Administrator).

---

## 7. Password Hashing & Environment Variables (Lesson 7)

### bcrypt hashing on register
```javascript
import bcrypt from 'bcrypt';
const saltRounds = 10;

const salt = bcrypt.genSaltSync(saltRounds);
const hash = bcrypt.hashSync(password, salt);
// store both `hash` and `salt` in the user document
```

### Verifying on login
Course doc shows a manual re-hash-and-compare:
```javascript
const hashingPasswordLogin = bcrypt.hashSync(password, currentUser.salt);
if (hashingPasswordLogin !== currentUser.password) throw new Error("Sai tài khoản hoặc mật khẩu");
```
**Note:** `lesson9`'s actual implementation upgrades this to bcrypt's own constant-time comparator, which is the version to use going forward:
```javascript
const isMatch = bcrypt.compareSync(password, findCustomer.password);
if (!isMatch) return res.status(400).json({ message: "Email or password is incorrect." });
```

### `.env` conventions
- `dotenv.config()` must run before any `process.env.X` access, at the top of the entry file
- Restart the server manually after editing `.env` (no hot-reload for env vars)
- Multiple env files by purpose: `.env.example` (documents required keys, no real secrets), `.env.staging`, `.env.test`, `.env.production` — actual runtime always reads from a file named exactly `.env.<mode>` per the `dotenv.config({ path: ... })` call
- `.env*` (except `.env.example`) must never be committed — confirm `.gitignore` covers this

---

## 8. JWT Tokens (Lesson 8)

### Structure
A JWT has three dot-separated parts: `header.payload.signature`
- **Header** — `{ "alg": "HS256", "typ": "JWT" }`
- **Payload** — arbitrary claims, e.g. `{ "userId": "...", "role": "USER", "exp": ... }`
- **Signature** — HMAC of header+payload using a secret key; verifies integrity

### Access Token vs. Refresh Token
| | Access Token (AT) | Refresh Token (RT) |
|---|---|---|
| Purpose | Authorizes individual API calls | Used only to mint a new AT |
| Lifetime | Short (course examples use `20m`) | Long (course examples use `4w`) |
| Distinguishing field | `tokenType: "AT"` | `tokenType: "RT"` |

### Attaching the token to requests
Recommended: `Authorization: Bearer <access_token>` header (not query string, not request body) — this is what `verifyToken` in lesson9 expects and what should be used for HRMS.

### Verifying + decoding
```javascript
jwt.verify(token, secretKey, (err, decoded) => {
  if (err) return res.status(401).json({ message: 'Access token is invalid' });
  req.user = decoded;
  next();
});
```

### `lesson9` refresh-token endpoint (recommended shape for HRMS)
```javascript
refreshToken: (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) return res.status(401).json({ message: "No refresh token provided." });
  try {
    const decoded = jwt.verify(refresh_token, process.env.REFRESH_SECRET);
    if (decoded.tokenType !== "RT") return res.status(401).json({ message: "Invalid token type." });
    const { access_token, refresh_token: new_refresh_token } = signTokens({ id: decoded.id, email: decoded.email, role: decoded.role });
    res.json({ access_token, refresh_token: new_refresh_token });
  } catch {
    res.status(401).json({ message: "Refresh token is invalid or expired." });
  }
}
```
Note `lesson9` correctly uses **two distinct secrets** — `SECRET_KEY` for ATs, `REFRESH_SECRET` for RTs — so a leaked AT secret can't be used to forge refresh tokens. This is an improvement over `lesson4`'s single shared secret and should be the standard for HRMS.

---

## 9. Database Relationships (Lesson 9) + Full Reference App

### Relationship modeling in MongoDB/Mongoose
- **One-to-many** — embed an array of sub-documents, or reference via a foreign-key-style field
- **Many-to-many** — array of ObjectId references on both sides, or a join collection
- **One-to-one** — reference field, or nest the related document directly

### Reference pattern (the one actually used in lesson9's models)
```javascript
const employeesSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  managerId: { type: mongoose.Schema.Types.ObjectId, ref: "manager" },
  accountId: { type: mongoose.Schema.Types.ObjectId, ref: "account" },
});
```
Populate related data at query time with `.populate('fieldName')`.

### `lesson9` full domain model (real-estate-style, the most complete code example in the course)
| Model | Key fields | References |
|---|---|---|
| `Account` | `email` (unique), `password`, `salt`, `isActive`, `role: enum["MANAGER","CUSTOMER","EMPLOYEE"]` | — |
| `Customer` | `name`, `email`, `phone`, `address` | `accountId → Account` |
| `Manager` | `name`, `email`, `phone`, `department` | `accountId → Account` |
| `Employee` | `name`, `email`, `phone`, `department` | `managerId → Manager`, `accountId → Account` |
| `Property` | `address`, `price`, `area`, `status: enum["available","sold","pending"]` | `employeeId → Employee` |
| `DepositOrder` | `depositAmount`, `date`, `status: enum["cancel","sold","pending"]` | `customerId → Customer`, `propertyId → Property` |

**Key architectural decision worth carrying into HRMS:** identity/auth lives in a separate `Account` collection (email, password, salt, role, isActive) referenced by `accountId` from each role-specific profile collection (`Customer`, `Manager`, `Employee`), rather than mixing auth fields directly into a single "User" document with a role flag. This cleanly separates "who can log in" from "what kind of person/profile they are," and makes the registration flow (account first, profile completed second) match exactly what `Register.jsx`'s UI shell already anticipates on the frontend.

### Pagination + search pattern (from `lesson9/controller/customer.js` and `managers.js`, identical in both)
```javascript
getAllCustomers: async (req, res) => {
  try {
    const { pageSize = 10, pageNumber = 1 } = req.query;
    const totalItems = await CustomersModel.countDocuments();
    const totalPages = Math.ceil(totalItems / pageSize);
    const skip = (pageNumber - 1) * pageSize;

    let condition = {};
    if (req.query.search) {
      condition.name = { $regex: req.query.search, $options: "i" };
    }

    const result = await CustomersModel.find(condition).skip(skip).limit(pageSize);

    res.json({ totalItems, totalPages, currentPage: +pageNumber, items: result });
  } catch (error) {
    res.status(500).json({ message: "Error getting customers" });
  }
},
```
This `{ totalItems, totalPages, currentPage, items }` envelope is the recommended list-response shape for every paginated HRMS endpoint (employees, departments, jobs, candidates, attendance, payroll, holidays, notifications).

### Registration → role-escalation flow (from `lesson9/controller/managers.js`)
A manager creating an employee both creates the `Employee` profile document **and** updates the linked `Account.role` to `"EMPLOYEE"` in the same handler:
```javascript
const createEmployee = await EmployeesModel.create({ name, email, phone, department, accountId });
const updateRoleAccount = await AccountModel.findOneAndUpdate({ _id: accountId }, { role: "EMPLOYEE" }, { new: true });
```
This two-step "create profile, then promote the account's role" pattern is directly relevant to HRMS: an Admin/HR registering a new Employee account should follow the same shape.

---

## 10. File Upload — Multer + Cloudinary (Lesson 10)

### Why not store files in MongoDB
Binary file data bloats document size and degrades query performance — store only a CDN URL string in the database; the actual bytes live on a third-party file host (Cloudinary in this course).

### Multer setup (memoryStorage — required when piping straight to Cloudinary, no disk write)
```javascript
import multer from "multer";
const storage = multer.memoryStorage();
const upload = multer({ storage });
```

### Cloudinary config (env-driven, confirmed in `lesson9/index.js`)
```javascript
import { v2 as cloudinary } from "cloudinary";
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET,
});
```

### Single-file upload route (verified shape from `lesson9/index.js`)
```javascript
app.post("/upload", upload.single("file"), (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "Không có tệp được tải lên." });

  const dataUrl = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
  const fileName = file.originalname.split(".")[0];

  cloudinary.uploader.upload(dataUrl, { public_id: fileName, resource_type: "auto" }, (err, result) => {
    if (result) console.log(result.secure_url); // persist this URL to the relevant document
  });

  res.json({ message: "Tệp được tải lên thành công.", data: file });
});
```
**Caveat to fix in HRMS, not copy as-is:** in this exact lesson9 code, `res.json(...)` fires *before* the Cloudinary callback resolves, so the response never actually contains `secure_url` — it's logged but not returned. For HRMS, `await` a Promise-wrapped version of `cloudinary.uploader.upload` (or use `upload_stream`) and only respond once the URL is available, e.g. for employee avatar uploads.

### Multi-file upload
Same idea with `upload.array("files")`, looping the array and uploading each with its own `public_id`.

### Deleting a file
```javascript
cloudinary.uploader.destroy(public_id, (error, result) => { /* ... */ });
```

---

## 11. Data Management — Pagination, Search, Sort (Lesson 11)

Reiterates and names the four pagination parameters used throughout `lesson9`'s controllers: `totalItems`, `pageSize`, `totalPages`, `skip`. Sorting uses Mongoose's `.sort({ field: 1 | -1 })` (1 = ascending, -1 = descending) and does not mutate stored order — only the returned result order.

Search/filter uses Mongoose's `.find({ field: value })` or `$regex` for partial/case-insensitive text match (as seen in `lesson9`'s `{ name: { $regex: search, $options: "i" } }`).

These three concerns (page, search, sort) commonly combine on the same endpoint — accept all three as query-string parameters (`?pageNumber=1&pageSize=10&search=foo&sortBy=name&sortDir=1`) and apply them in sequence: filter → sort → skip/limit.

---

## 12. Deployment & CORS (Lesson 12)

### CORS
Required any time the frontend (different origin/port) calls the backend. Without it, browser requests fail with a CORS error before even reaching the route handler.
```javascript
import cors from 'cors';
app.use(cors()); // place before route definitions; open to all origins by default
```
For production, restrict to the actual frontend origin via `cors({ origin: 'https://your-frontend-domain' })` rather than the wide-open default.

### Render deployment flow (manual, via dashboard — no code changes needed)
1. New → Web Service → connect GitHub repo
2. Configure build/start commands, set Environment Variables in the Render dashboard (mirrors `.env.production`)
3. "Build successful" = deployed; "Manual Deploy → Deploy latest commit" to push new commits live
4. Frontend deploys separately as a **Static Site** pointed at the same or a different repo

### Required `.env` keys for local dev (from the lesson's own example)
```
PORT=8080
CONNECT_STRING=mongodb://localhost:27017/social-app
AT_SECRETKEY=...
RT_SECRETKEY=...
```
Matches the two-secret JWT pattern from `lesson9` (§6/§8 above) — `AT_SECRETKEY`/`RT_SECRETKEY` here map to `lesson9`'s `SECRET_KEY`/`REFRESH_SECRET`.

---

## 13. Redux Toolkit (Frontend State — Lesson 13)

Not part of the HRMS frontend's current architecture (which uses Context API per `HRMS_PROJECT_SUMMARY.md`), but documented here for completeness since it's part of the course sequence and may be relevant if the HRMS frontend state management is revisited later.

### Core pieces
- **`createSlice({ name, initialState, reducers, extraReducers })`** — defines a slice; auto-generates action creators matching reducer names
- **`createAsyncThunk(typePrefix, payloadCreator)`** — wraps an async call (e.g. an API request) into dispatchable `pending`/`fulfilled`/`rejected` actions
- **`extraReducers`** — handles actions from `createAsyncThunk` (or other slices) inside a slice that didn't define them directly, via `builder.addCase(...)`
- **`configureStore({ reducer: { sliceName: sliceReducer, ... } })`** — assembles the root store
- **`useSelector` / `useDispatch`** — read state / dispatch actions from components

### `ProtectedRoute` pattern (relevant regardless of state library — HRMS already has its own `ProtectedRoute.jsx` using `AuthContext`)
The course's Redux-based version checks `localStorage` for an access token on mount, dispatches a thunk to validate it against the server, and redirects to `/login` if absent or invalid — conceptually identical to the HRMS frontend's existing `AuthContext`-based `ProtectedRoute`, just wired through Redux instead of Context.

---

## Recommended HRMS Backend Conventions (synthesized from the above)

Based on which lesson patterns are most complete/correct (favoring `lesson9` over earlier, simpler lessons wherever they conflict):

1. **Folder structure:** `index.js`, `model/`, `controller/`, `router/`, `middleware/`, mounted under an `/api/v1` prefix.
2. **Auth:** `Account` collection holds `email`/`password`/`salt`/`role`/`isActive`, separate from role-specific profile collections (`Employee`, etc.) — matches the Employee/HR/Administrator roles already defined in `Register.jsx`.
3. **Passwords:** bcrypt with per-user salt; verify with `bcrypt.compareSync`, not manual re-hash-and-string-compare.
4. **Tokens:** JWT AT (short-lived, e.g. 20m) + RT (long-lived, e.g. 4w) with a `tokenType` claim and **two separate secrets** (`SECRET_KEY` / `REFRESH_SECRET`); sent as `Authorization: Bearer <token>`.
5. **Authorization:** variadic `authorize(...roles)` middleware stacked after `verifyToken`.
6. **Error handling:** every controller method wrapped in `try/catch`; validation failures `throw new Error('message')`; catch block responds with a consistent shape, e.g. `{ message, data: null, success: false }` and an appropriate status code (`400` bad input, `401` auth, `403` forbidden, `404` not found, `500` unexpected).
7. **Lists/pagination:** every list endpoint accepts `pageNumber`, `pageSize`, optional `search` (regex, case-insensitive); responds with `{ totalItems, totalPages, currentPage, items }`.
8. **File upload:** Multer `memoryStorage()` → base64 data URL → Cloudinary `uploader.upload`, but **await it properly** before responding (fix the lesson9 race condition rather than copying it).
9. **Env:** `cross-env NODE_ENV=<mode>` + `dotenv.config({ path: '.env.<mode>' })`; never commit real `.env.*` files, only `.env.example`.
10. **CORS:** enabled in dev; scoped to the actual frontend origin in production.

---

*Compiled from MindX WEB96 lesson documentation (lessons 1–13) cross-checked against the live code in `lesson1`, `lesson2`, `lesson3`, `lesson4`, and `lesson9` of `github.com/phamdactai9x66/WEB96` — intended as the working reference for the HRMS backend build-out.*
