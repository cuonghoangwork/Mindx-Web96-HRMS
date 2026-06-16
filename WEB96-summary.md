# WEB96 Repository Summary

Repository: `phamdactai9x66/WEB96`

A collection of Node.js/Express backend exercises from a web development course, organized by lesson. Each lesson builds incrementally on REST API, authentication, database, and file-upload concepts.

## lesson1 — JS Fundamentals
Plain Node.js script demonstrating utility functions (e.g. `formatPhoneNumber`) imported and used via `require`. No server framework.

## lesson2 — Basic Express API (in-memory data)
- Express app (`practice/index.js`) with in-memory `customers`, `orders`, `products` data
- Endpoints:
  - `GET /` – health check
  - `GET /customers` – list customers
  - `GET /customers/:id` – get customer by id
  - `GET /customers/:customerId/orders` – get a customer's orders
  - `GET /products` – list products, with optional `min`/`max` price filtering
  - `POST /customers` – create a customer with validation (required fields, duplicate email check)

## lesson3 — Mock Database
Contains `Db/db.json`, a static JSON file used as a mock database (no server code in this lesson).

## lesson4 — Express + MongoDB + Auth (JWT)
Full Express app with MongoDB via Mongoose.
- **Models**: `users`, `customers`, `posts`, `comments`
- **Routers**: `/users` (admin-protected), `/customers`
- **Middleware**: `auth.js` for authentication and admin authorization
- **Auth endpoints**:
  - `POST /register` – register user, password hashed with `bcrypt`
  - `POST /login` – issue JWT access & refresh tokens
  - `POST /refresh_token` – refresh access token using refresh token
- Uses `dotenv` for environment-based config (`.env.dev`, `.env.uat`, `.env.production`) and `cross-env` for npm scripts
- Connects to local MongoDB (`mongodb://localhost:27017/fullstack-web`)

**Dependencies**: express, mongoose, bcrypt, jsonwebtoken, dotenv, cross-env, uuid, nodemon

## lesson9 — Express + MongoDB + File Uploads (Cloudinary)
Expanded Express app with role-based accounts and file uploads.
- **Models**: `Account` (with `role`: MANAGER / CUSTOMER / EMPLOYEE), `Customers`, `Employees`, `Managers`, `Properties`, `DepositOrders`
- **Routers**:
  - `/customers` – register, login, update info, paginated list with search (`pageSize`, `pageNumber`, `search`)
  - `/managers` – create employee, list employees
- **File upload endpoints** (via `multer` + `cloudinary`):
  - `POST /upload` – single file upload to Cloudinary
  - `POST /upload_multiple` – multiple file uploads
  - `DELETE /delete_file` – delete a file from Cloudinary by `public_id`
- Connects to MongoDB via `MONGO_URI` env variable

**Dependencies**: express, mongoose, bcrypt, jsonwebtoken, multer, cloudinary, dotenv, cross-env, nodemon

## Overall Tech Stack
- **Runtime**: Node.js (ES modules, `"type": "module"`)
- **Framework**: Express 5
- **Database**: MongoDB (Mongoose ODM)
- **Auth**: JWT (access + refresh tokens), bcrypt password hashing
- **File storage**: Cloudinary (lesson9)
- **Tooling**: nodemon, cross-env, dotenv for multi-environment config

## Progression
The lessons show a clear learning progression: plain JS → in-memory REST API → mock JSON DB → MongoDB-backed API with JWT auth and role-based access → adding file upload/cloud storage and pagination/search features.
