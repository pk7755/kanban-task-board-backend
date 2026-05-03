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

## 📋 Table of Contents

- [Description](#-description)
- [Tech Stack](#-tech-stack)
- [Features](#-features)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [Database Setup](#-database-setup)
- [Running the Project](#-running-the-project)
- [API Documentation](#-api-documentation)
- [Authentication Flow](#-authentication-flow)
- [API Endpoints](#-api-endpoints)
- [NPM Scripts](#-npm-scripts)
- [Deployment](#-deployment)
- [Contributing](#-contributing)
- [License](#-license)

---

## 📖 Description

**Kanban Task Board API** is a production-ready backend service built with **NestJS** and **TypeScript**. It powers a Kanban-style project management tool where managers can create boards, organise work into columns, assign tasks to team members, and track progress — all secured behind JWT authentication and role-based access control.

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

- 🔐 **JWT Authentication** — Access token (15 min) + Refresh token (7 days) with token rotation
- 👥 **Role-based Access Control** — `MANAGER` and `TEAM_MEMBER` roles with route-level guards
- 📋 **Boards** — Create boards, manage members, eager-load columns & tasks
- 📌 **Columns** — Ordered columns per board with position management
- ✅ **Tasks** — Full task lifecycle: priority, due date, assignee, archived flag, checklist items, tags
- 🏷 **Tags** — Board-scoped tags assignable to tasks
- 📊 **Audit Logs** — Track all critical actions (user changes, ticket events, board events)
- 🛡 **Security** — Helmet headers, CORS whitelist, global rate limiting, bcrypt password hashing
- 📄 **Swagger UI** — Interactive API docs at `/api/docs`

---

## 📁 Project Structure

```
src/
├── auth/                   # JWT auth — login, register, refresh, logout
│   ├── dto/
│   ├── guards/             # JwtAuthGuard
│   ├── interfaces/         # JwtPayload interface
│   └── strategies/         # Passport JWT strategy
│
├── users/                  # User profile + team management (MANAGER only)
│   └── dto/
│
├── boards/                 # Board CRUD + member management
│   └── dto/
│
├── common/                 # Shared cross-cutting concerns
│   ├── decorators/         # @CurrentUser, @Roles, @Public
│   ├── filters/            # Global HTTP exception filter
│   ├── guards/             # RolesGuard
│   ├── interceptors/       # Logging, response transform
│   └── pipes/
│
├── prisma/                 # PrismaService (global module)
├── health/                 # Health check endpoint
├── app.module.ts
└── main.ts

prisma/
├── schema.prisma           # Database schema
├── migrations/             # Prisma migration history
└── seed.ts                 # Database seeder
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js `>= 22.x`
- npm `>= 10.x`
- PostgreSQL `>= 16`
- Docker (optional, for DB via Docker Compose)

### Installation

```bash
# Clone the repository
git clone https://github.com/pk7755/kanban-task-board-backend.git
cd kanban-task-board-api

# Install dependencies
npm install
```

---

## 🔧 Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

```env
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/kanban

# JWT
JWT_SECRET=your-super-secret-jwt-key-here
JWT_REFRESH_SECRET=your-super-secret-refresh-key-here
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Server
PORT=3000
NODE_ENV=development

# CORS — comma-separated allowed origins
CORS_ORIGINS=http://localhost:5173,http://localhost:3001
```

> ⚠️ Never commit your `.env` file. It is already listed in `.gitignore`.

---

## 🗄 Database Setup

### Option 1 — Docker Compose (Recommended)

```bash
# Start PostgreSQL in a container
docker-compose up -d
```

### Option 2 — Local PostgreSQL

Create a database manually:

```sql
CREATE DATABASE kanban;
```

### Run Migrations

```bash
# Apply all pending migrations
npm run prisma:migrate

# Generate Prisma client after schema changes
npm run prisma:generate
```

### Seed the Database

Creates an initial **Manager** account using the credentials in your `.env`:

```bash
npm run seed
```

---

## 🔑 Default Login

After seeding, a manager account is ready immediately:

| Field    | Value                   |
|----------|-------------------------|
| Email    | `manager@example.com`   |
| Password | `Manager@123`           |
| Role     | `MANAGER`               |

> Override with `SEED_MANAGER_EMAIL` and `SEED_MANAGER_PASSWORD` in `.env` before seeding.

A second team member is also seeded:

| Field    | Value                  |
|----------|------------------------|
| Email    | `member1@example.com`  |
| Password | `Member@123`           |
| Role     | `TEAM_MEMBER`          |

---

## 🏗 Architecture

```
                          HTTP Requests
                               │
                          ┌────▼────┐
                          │  main   │  Helmet · CORS · Throttler · Prefix /api/v1
                          └────┬────┘
                               │
                     ┌─────────▼─────────┐
                     │     AppModule      │  Global: JwtAuthGuard · RolesGuard
                     │                   │         LoggingInterceptor · TransformInterceptor
                     │                   │         GlobalExceptionFilter
                     └──┬────────────────┘
                        │  imports
          ┌─────────────┼─────────────────────────────────────────┐
          │             │             │              │             │
     ┌────▼───┐  ┌──────▼────┐ ┌─────▼────┐ ┌──────▼───┐ ┌──────▼────┐
     │  Auth  │  │  Users    │ │  Boards  │ │ Columns  │ │   Tasks   │
     │ Module │  │  Module   │ │  Module  │ │  Module  │ │  Module   │
     └────────┘  └──────┬────┘ └──────────┘ └──────────┘ └────┬──────┘
                        │                                       │
                   ┌────▼──────────────────────────────────────▼────┐
                   │               AuditModule                       │
                   │   AuditService.log() ← called from UsersService │
                   │                      ← called from TasksService │
                   │   GET /audit-logs (MANAGER only, paginated)     │
                   └────────────────────────────────────────────────┘
          │             │
     ┌────▼──────┐ ┌────▼────┐
     │ Checklist │ │  Tags   │
     │  Module   │ │ Module  │
     └───────────┘ └─────────┘
          │             │             │
     ┌────▼─────────────▼─────────────▼────┐
     │            PrismaModule              │
     │   PrismaService → PostgreSQL DB      │
     └──────────────────────────────────────┘

Module → Service → PrismaService (all DB calls)
Controller → Service only (no business logic in controllers)
Guards: JwtAuthGuard (global) · RolesGuard (global, opt-in via @Roles())
Public routes opt out via @Public() decorator
```

---

```bash
npm run prisma:studio
```

---

## ▶️ Running the Project

```bash
# Development (watch mode)
npm run start:dev

# Debug mode
npm run start:debug

# Production build + run
npm run build
npm run start:prod
```

The server starts at: `http://localhost:3000` (or the `PORT` in your `.env`)

---

## 📄 API Documentation

Interactive Swagger UI is available at:

```
https://blah-stallion-detail.ngrok-free.dev/api/docs
```

All endpoints are documented with:
- Request body schemas (validated DTOs)
- Response examples
- Bearer token auth requirement
- Role requirements per endpoint

---

## 🔐 Authentication Flow

```
1. POST /auth/register  →  Create account, receive { accessToken, refreshToken, user }
2. POST /auth/login     →  Receive { accessToken, refreshToken, user }

3. All protected requests:
   Authorization: Bearer <accessToken>

4. POST /auth/refresh   →  Send { refreshToken } → receive new token pair

5. POST /auth/logout    →  Invalidates refresh token in DB
                           Client should discard both tokens
```

**Token details:**
- `accessToken` — short-lived (15 min), stateless JWT
- `refreshToken` — long-lived (7 days), stored hashed in DB, rotated on each refresh
- Token version field prevents replay attacks after password reset

---

## 🗺 API Endpoints

### Auth

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/auth/register` | Public | Register new user |
| `POST` | `/auth/login` | Public | Login, receive JWT tokens |
| `GET` | `/auth/me` | ✅ JWT | Get current user profile |
| `POST` | `/auth/refresh` | Public | Refresh access token |
| `POST` | `/auth/logout` | ✅ JWT | Logout and revoke refresh token |

### Users

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/users` | ✅ JWT | List users (search, paginate) |
| `GET` | `/users/:id` | ✅ JWT | Get user by ID |
| `PATCH` | `/users/me` | ✅ JWT | Update own profile |

### Team Management *(MANAGER only)*

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/users/team` | MANAGER | List team members |
| `POST` | `/users/team` | MANAGER | Create team member |
| `PATCH` | `/users/team/:id` | MANAGER | Update role / status |
| `DELETE` | `/users/team/:id` | MANAGER | Soft-deactivate member |
| `POST` | `/users/team/:id/reset-password` | MANAGER | Reset member password |

### Boards

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/boards` | ✅ JWT | List boards (owned + member) |
| `POST` | `/boards` | ✅ JWT | Create board |
| `GET` | `/boards/:id` | Member | Board detail with columns & tasks |
| `PATCH` | `/boards/:id` | Owner | Rename board |
| `DELETE` | `/boards/:id` | Owner | Delete board (cascade) |
| `POST` | `/boards/:id/members` | Owner | Add member by email |
| `DELETE` | `/boards/:id/members/:userId` | Owner | Remove member |

### Sample Request — Create Board

```http
POST /boards
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "name": "Sprint 1"
}
```

```json
{
  "id": "uuid",
  "name": "Sprint 1",
  "ownerId": "uuid",
  "memberCount": 1,
  "createdAt": "2026-04-30T07:00:00.000Z"
}
```

---

## 📦 NPM Scripts

| Script | Description |
|--------|-------------|
| `npm run start:dev` | Start in watch (development) mode |
| `npm run start:prod` | Run compiled production build |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run lint` | Lint and auto-fix with ESLint |
| `npm run format` | Format code with Prettier |
| `npm run test` | Run unit tests |
| `npm run test:e2e` | Run end-to-end tests |
| `npm run test:cov` | Test coverage report |
| `npm run prisma:migrate` | Run Prisma migrations |
| `npm run prisma:generate` | Regenerate Prisma client |
| `npm run prisma:studio` | Open Prisma Studio (DB browser) |
| `npm run seed` | Seed initial manager account |

---

## 🐳 Deployment

### Docker

```bash
# Build image
docker build -t kanban-task-board-api .

# Run container
docker run -p 3000:3000 --env-file .env kanban-task-board-api
```

### Docker Compose (Full Stack)

```bash
docker-compose up --build
```

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use strong, random values for `JWT_SECRET` and `JWT_REFRESH_SECRET` (min 64 chars)
- [ ] Set `CORS_ORIGINS` to your actual frontend domain(s)
- [ ] Run `npm run prisma:migrate` before starting
- [ ] Use a managed PostgreSQL service (e.g. Railway, Supabase, RDS)
- [ ] Set up process manager (e.g. PM2) or use the Docker image

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

