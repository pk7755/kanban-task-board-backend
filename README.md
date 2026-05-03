<p align="center">
  <img src="https://nestjs.com/img/logo-small.svg" width="80" alt="NestJS Logo" />
</p>

<h1 align="center">Kanban Task Board API</h1>

<p align="center">
  A RESTful API for managing Kanban boards, tasks, columns, and team members with role-based access control.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-22.x-339933?logo=node.js&logoColor=white" alt="Node" />
  <img src="https://img.shields.io/badge/NestJS-11.x-E0234E?logo=nestjs&logoColor=white" alt="NestJS" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Prisma-7.x-2D3748?logo=prisma&logoColor=white" alt="Prisma" />
  <img src="https://img.shields.io/badge/PostgreSQL-16.x-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/License-UNLICENSED-red" alt="License" />
</p>

---

> **Base URL:** `http://localhost:3000/api/v1`  
> **Swagger:** `http://localhost:3000/api/docs`  
> **Repository:** `https://github.com/pk7755/kanban-task-board-backend`

## 📋 Table of Contents

- [Description](#-description)
- [Tech Stack](#-tech-stack)
- [Features](#-features)
- [Project Structure](#-project-structure)
- [Architecture](#-architecture)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [Database Setup](#-database-setup)
- [Default Login](#-default-login)
- [Running the Project](#-running-the-project)
- [API Documentation](#-api-documentation)
- [Authentication Flow](#-authentication-flow)
- [Response Format](#-response-format)
- [RBAC Rules](#-rbac-rules)
- [API Endpoints](#-api-endpoints)
- [Testing](#-testing)
- [NPM Scripts](#-npm-scripts)
- [ngrok / Sharing](#-ngrok--sharing)
- [Deployment](#-deployment)
- [Contributing](#-contributing)
- [License](#-license)

---

## 📖 Description

**Kanban Task Board API** is a production-ready backend service built with **NestJS** and **TypeScript**. It powers a Kanban-style project management tool where managers can create boards, organise work into columns, assign tasks to team members, and track progress — all secured behind JWT authentication and role-based access control.

All API routes are prefixed with **`/api/v1`**, so the local API base URL is:

```text
http://localhost:3000/api/v1
```

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [NestJS](https://nestjs.com/) v11 |
| Language | TypeScript 5 |
| ORM | [Prisma](https://www.prisma.io/) v7 |
| Database | PostgreSQL 16 |
| Auth | JWT (Access + Refresh tokens via `@nestjs/jwt`) |
| Validation | `class-validator` + `class-transformer` |
| API Docs | Swagger (`@nestjs/swagger`) |
| Security | Helmet, CORS, Rate limiting (`@nestjs/throttler`) |
| Containerisation | Docker + Docker Compose |

---

## ✨ Features

- 🔐 **Authentication** — JWT access token (15 min) + refresh token (7 days)
- 👥 **Roles** — `MANAGER` and `TEAM_MEMBER`
- 🧱 **Boards & Columns** — Board CRUD, membership management, ordered columns, bulk column reorder
- ✅ **Tasks** — CRUD, filtering, move between columns, archive/unarchive, assignees, tags, due dates, priorities
- ☑️ **Checklist** — Task checklist item CRUD
- 🏷 **Tags** — Board-scoped tag management
- 📊 **Audit Logs** — Manager-only audit log access plus internal write support from user/task workflows
- 🛡 **Global App Security** — Helmet, CORS whitelist, throttling, global JWT guard, roles guard
- 📦 **Standard Responses** — Success responses wrapped in `{ data, statusCode, timestamp }`
- 📄 **Swagger UI** — Interactive docs at `http://localhost:3000/api/docs`
- 🧪 **Test Coverage** — Unit and e2e suites with mocked Prisma e2e coverage

---

## 📁 Project Structure

```text
src/
├── app.module.ts
├── main.ts
├── auth/           # JWT auth — login, register, refresh, logout
│   ├── dto/
│   ├── guards/     # JwtAuthGuard
│   ├── interfaces/ # JwtPayload
│   └── strategies/ # Passport JWT strategy
├── users/          # User profile + team management (MANAGER only)
│   └── dto/
├── boards/         # Board CRUD + member management
│   └── dto/
├── columns/        # Column CRUD + bulk reorder
│   └── dto/
├── tasks/          # Task CRUD + move + archive + query
│   └── dto/
├── checklist/      # Checklist items per task
│   └── dto/
├── tags/           # Board-scoped tags
│   └── dto/
├── audit/          # Audit log — read and write
│   └── dto/
├── health/         # Health check endpoint
├── prisma/         # PrismaService (global module)
└── common/
    ├── decorators/   # @CurrentUser, @Roles, @Public
    ├── filters/      # Global HTTP exception filter
    ├── guards/       # RolesGuard
    ├── interceptors/ # Logging, response transform
    └── pipes/        # ParseDateRangePipe

prisma/
├── schema.prisma
├── migrations/
└── seed.ts

test/               # E2E tests (9 suites, 169 tests)
docs/
└── postman_collection.json
```

---

## 🏗 Architecture

```text
AppModule
├── AuthModule ──────────────→ PrismaModule, JwtModule
├── UsersModule ─────────────→ PrismaModule, AuditModule
├── BoardsModule ────────────→ PrismaModule
├── ColumnsModule ───────────→ PrismaModule
├── TasksModule ─────────────→ PrismaModule, AuditModule
│   └── TasksQueryService (read ops split from TasksService)
├── ChecklistModule ─────────→ PrismaModule
├── TagsModule ──────────────→ PrismaModule
├── AuditModule ─────────────→ PrismaModule  (exports AuditService)
├── HealthModule
└── PrismaModule (global)

Common (applied globally in AppModule):
  ThrottlerGuard
  JwtAuthGuard → all routes (opt-out via @Public())
  RolesGuard   → opt-in via @Roles(Role.MANAGER)
  GlobalExceptionFilter
  LoggingInterceptor   (logs requests > 500ms)
  TransformInterceptor (wraps all responses in { data, statusCode, timestamp })
```

**Request flow**
- `main.ts` configures Helmet, CORS, validation pipes, Swagger, and the `/api/v1` prefix.
- Controllers stay thin and delegate to services.
- Prisma powers all database access.
- `AuditService` is reused by user and task workflows.

---

## 🚀 Getting Started

### Prerequisites

- Node.js `>= 22.x`
- npm `>= 10.x`
- PostgreSQL `>= 16`
- Docker (optional, for PostgreSQL via Docker Compose)

### Installation

```bash
# Clone the repository
git clone https://github.com/pk7755/kanban-task-board-backend.git
cd kanban-task-board-backend

# Install dependencies
npm install
```

---

## 🔧 Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable | Description | Example / Default |
|----------|-------------|-------------------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5432/kanban` |
| `JWT_SECRET` | Access token signing secret | `your-super-secret-jwt-key-here` |
| `JWT_REFRESH_SECRET` | Refresh token signing secret | `your-super-secret-refresh-key-here` |
| `JWT_ACCESS_EXPIRES_IN` | Access token lifetime | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token lifetime | `7d` |
| `PORT` | API port | `3000` |
| `CORS_ORIGINS` | Comma-separated allowed origins | `http://localhost:5173,http://localhost:3001` |
| `SEED_MANAGER_EMAIL` | Seeded manager email | `manager@example.com` |
| `SEED_MANAGER_NAME` | Seeded manager display name | `Default Manager` |
| `SEED_MANAGER_PASSWORD` | Seeded manager password | `Manager@123` |
| `NODE_ENV` | Runtime environment | `development` |
| `NGROK_URL` | Public ngrok URL for shared frontend testing | `https://your-ngrok-url.ngrok-free.app` |

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/kanban
JWT_SECRET=your-super-secret-jwt-key-here
JWT_REFRESH_SECRET=your-super-secret-refresh-key-here
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
PORT=3000
CORS_ORIGINS=http://localhost:5173,http://localhost:3001
SEED_MANAGER_EMAIL=manager@example.com
SEED_MANAGER_NAME=Default Manager
SEED_MANAGER_PASSWORD=Manager@123
NODE_ENV=development
NGROK_URL=https://your-ngrok-url.ngrok-free.app
```

> ⚠️ Never commit your real `.env` file.

---

## 🗄 Database Setup

### Option 1 — Docker Compose

```bash
docker-compose up -d
```

### Option 2 — Local PostgreSQL

```sql
CREATE DATABASE kanban;
```

### Run Prisma

```bash
npm run prisma:migrate
npm run prisma:generate
```

### Seed the Database

The seed creates the default manager account automatically using the `SEED_MANAGER_*` variables.

```bash
npm run seed
```

You can also inspect data locally with:

```bash
npm run prisma:studio
```

---

## 🔑 Default Login

After seeding, the default login is:

| Field | Value |
|-------|-------|
| Email | `manager@example.com` (or `SEED_MANAGER_EMAIL`) |
| Password | `Manager@123` (or `SEED_MANAGER_PASSWORD`) |
| Role | `MANAGER` |

---

## ▶️ Running the Project

```bash
# Development
npm run start:dev

# Debug
npm run start:debug

# Production
npm run build
npm run start:prod
```

Local URLs:
- API root: `http://localhost:3000/api/v1`
- Swagger UI: `http://localhost:3000/api/docs`

---

## 📄 API Documentation

Swagger is available at:

```text
http://localhost:3000/api/docs
```

Notes:
- All API routes are prefixed with **`/api/v1`**.
- Swagger documents request DTOs, auth requirements, and endpoint groups.
- A Postman collection is included at `docs/postman_collection.json`.

---

## 🔐 Authentication Flow

```text
1. POST /api/v1/auth/register → Public
2. POST /api/v1/auth/login    → Public
3. Use access token on protected routes:
   Authorization: Bearer <accessToken>
4. POST /api/v1/auth/refresh  → Public, returns a fresh token pair
5. POST /api/v1/auth/logout   → JWT required, invalidates current refresh token
```

**Token lifetimes**
- `accessToken`: `15m`
- `refreshToken`: `7d`

---

## 📦 Response Format

Every successful response is wrapped as:

```json
{
  "data": { "id": "..." },
  "statusCode": 200,
  "timestamp": "2026-05-04T00:00:00.000Z"
}
```

Errors return:

```json
{
  "statusCode": 404,
  "message": "Task not found",
  "error": "Not Found",
  "timestamp": "2026-05-04T00:00:00.000Z",
  "path": "/api/v1/tasks/xyz"
}
```

---

## 🛂 RBAC Rules

### Roles
- `MANAGER`
- `TEAM_MEMBER`

### Task-specific rules
- `TEAM_MEMBER` creating a task → `assigneeId` is forced to their own user ID.
- `TEAM_MEMBER` editing, deleting, moving, archiving, or unarchiving a task they do not own → `403 Forbidden`.
- `TEAM_MEMBER` sending `assigneeId` in `PATCH /tasks/:id` to reassign a task → `403 Forbidden`.
- `MANAGER` can manage all tasks on boards they own or belong to.

### Other access rules
- `@Public()` routes opt out of the global JWT guard.
- `@Roles(Role.MANAGER)` is used for manager-only endpoints such as team management and audit logs.
- Board detail requires board membership.
- Board updates/member management require board ownership.
- Column mutations are currently enforced as **board-owner only** in the service layer.

---

## 🗺 API Endpoints

> All endpoints below are relative to **`/api/v1`**.

### Auth

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/auth/register` | Public | Register a new user |
| `POST` | `/auth/login` | Public | Login and receive access/refresh tokens |
| `GET` | `/auth/me` | JWT | Get the current authenticated user |
| `POST` | `/auth/refresh` | Public | Exchange refresh token for a new token pair |
| `POST` | `/auth/logout` | JWT | Logout and invalidate current refresh token |

### Users

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/users` | JWT | List users with `?search=&page=&limit=` |
| `GET` | `/users/:id` | JWT | Get a user by ID |
| `PATCH` | `/users/me` | JWT | Update the current user's profile |

### Team Management (`MANAGER` only)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/users/team` | MANAGER | List team members with `?search=&role=&page=&limit=` |
| `POST` | `/users/team` | MANAGER | Create a member with `{ email, name, password, role }` |
| `PATCH` | `/users/team/:id` | MANAGER | Update `name`, `role`, or `isActive` |
| `DELETE` | `/users/team/:id` | MANAGER | Soft-deactivate a member (`isActive=false`) |
| `POST` | `/users/team/:id/reset-password` | MANAGER | Reset password and return `{ tempPassword }` once |

### Boards

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/boards` | JWT | List boards the user owns or belongs to |
| `POST` | `/boards` | JWT | Create a board |
| `GET` | `/boards/:id` | Member | Get a board with columns and tasks |
| `PATCH` | `/boards/:id` | Owner | Rename a board |
| `DELETE` | `/boards/:id` | Owner | Delete a board and cascade related data |
| `POST` | `/boards/:id/members` | Owner | Add a board member by email |
| `DELETE` | `/boards/:id/members/:userId` | Owner | Remove a board member |

### Columns

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/columns` | Owner | Create a column in a board with `{ name, boardId, position?, color? }` |
| `PATCH` | `/columns/:id` | Owner | Update column `name`, `color`, or `position` |
| `DELETE` | `/columns/:id` | Owner | Delete a column and its tasks |
| `PATCH` | `/columns/reorder` | Owner | Bulk reorder columns with `[{ id, position }]` |

### Tasks

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/tasks` | JWT | Query tasks with `?boardId&columnId&priority&assigneeId&tagIds&search&dueBefore&dueAfter&overdue&page&limit&sort` |
| `POST` | `/tasks` | JWT | Create a task; `TEAM_MEMBER` assignee is forced to self |
| `GET` | `/tasks/:id` | JWT | Get a task by ID |
| `PATCH` | `/tasks/:id` | JWT | Update a task; `TEAM_MEMBER` cannot reassign |
| `DELETE` | `/tasks/:id` | JWT | Delete a task; `TEAM_MEMBER` only for own tasks |
| `PATCH` | `/tasks/:id/move` | JWT | Move task with `{ columnId, position }`; sibling positions update in a transaction |
| `POST` | `/tasks/:id/archive` | JWT | Set `archived=true` |
| `POST` | `/tasks/:id/unarchive` | JWT | Set `archived=false` |

### Checklist

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/tasks/:taskId/checklist` | JWT | Add a checklist item with `{ text, position? }` |
| `PATCH` | `/checklist/:id` | JWT | Update `{ text?, done?, position? }` |
| `DELETE` | `/checklist/:id` | JWT | Delete a checklist item |

### Tags

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/boards/:id/tags` | Member | List board tags |
| `POST` | `/boards/:id/tags` | Member | Create a tag with `{ name, color }` |
| `PATCH` | `/tags/:id` | Member | Update `{ name?, color? }` |
| `DELETE` | `/tags/:id` | Member | Delete a tag |

### Audit Logs (`MANAGER` only)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/audit-logs` | MANAGER | List paginated audit events with `?page=&limit=` |

### Health

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/health` | Public | Return `{ status, db, uptime }` |

---

## 🧪 Testing

```bash
# Unit tests
npm test

# E2E tests
npm run test:e2e

# Coverage
npm run test:cov
```

Current test status:
- `npm test` → **154 tests**, **8 suites**
- `npm run test:e2e` → **169 tests**, **9 suites**
- E2E tests use mocked Prisma, so they do **not** require a live database

---

## 📦 NPM Scripts

| Script | Description |
|--------|-------------|
| `build` | Build the NestJS app |
| `format` | Format `src/**/*.ts` and `test/**/*.ts` with Prettier |
| `format:check` | Check Prettier formatting |
| `start` | Start the app |
| `start:dev` | Start in watch mode |
| `start:debug` | Start in debug + watch mode |
| `start:prod` | Run the compiled production build |
| `lint` | Run ESLint with `--fix` |
| `test` | Run unit tests |
| `test:watch` | Run unit tests in watch mode |
| `test:cov` | Generate coverage report |
| `test:e2e` | Run end-to-end tests |
| `test:debug` | Run Jest in debug mode |
| `seed` | Seed the database |
| `prisma:generate` | Generate Prisma Client |
| `prisma:migrate` | Run Prisma migrations |
| `prisma:studio` | Open Prisma Studio |

---

## 🌐 ngrok / Sharing

When you need to share the backend with the frontend intern:

1. Start the API:
   ```bash
   npm run start:dev
   ```
2. In another terminal, expose port `3000`:
   ```bash
   ngrok http 3000
   ```
3. Add the generated URL to both:
   - `CORS_ORIGINS`
   - `NGROK_URL`
4. Share the ngrok URL at the start of each day.

---

## 🐳 Deployment

### Docker

```bash
docker build -t kanban-task-board-api .
docker run -p 3000:3000 --env-file .env kanban-task-board-api
```

### Docker Compose

```bash
docker-compose up --build
```

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use strong secrets for `JWT_SECRET` and `JWT_REFRESH_SECRET`
- [ ] Set `CORS_ORIGINS` to real frontend domains
- [ ] Run `npm run prisma:migrate`
- [ ] Use a managed PostgreSQL instance or hardened production database
- [ ] Serve the compiled app with Docker or a process manager

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m "feat: add your feature"`
4. Push to the branch: `git push origin feature/your-feature`
5. Open a Pull Request

Please follow [Conventional Commits](https://www.conventionalcommits.org/) for commit messages.

---

## 📜 License

This project is **UNLICENSED** — private and proprietary.

