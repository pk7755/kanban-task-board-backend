# API Changelog

All endpoint additions and breaking changes are recorded here.

---

## 2024-01-15 — Initial API

### Added
- `POST /auth/register` — Register a new user
- `POST /auth/login` — Login and receive JWT tokens
- `GET /auth/me` — Get current authenticated user
- `POST /auth/refresh` — Refresh access token

---

## 2024-01-20 — Users & Boards

### Added
- `GET /users` — List users (supports `?search=`)
- `GET /users/:id` — Get user by ID
- `PATCH /users/me` — Update own profile
- `GET /boards` — List boards the user is a member of
- `POST /boards` — Create a board
- `GET /boards/:id` — Get board with columns and tasks
- `PATCH /boards/:id` — Rename a board
- `DELETE /boards/:id` — Delete a board (owner only)
- `POST /boards/:id/members` — Add a member to a board
- `DELETE /boards/:id/members/:userId` — Remove a member from a board
- `POST /columns` — Create a column
- `PATCH /columns/:id` — Update a column
- `DELETE /columns/:id` — Delete a column (cascades tasks)
- `PATCH /columns/reorder` — Bulk reorder columns

---

## 2024-01-25 — Tasks

### Added
- `GET /tasks` — List tasks with filters: `boardId`, `columnId`, `priority`, `assigneeId`, `tagIds`, `search`, `dueBefore`, `dueAfter`, `overdue`, `page`, `limit`, `sort`
- `POST /tasks` — Create a task
- `GET /tasks/:id` — Get a task by ID
- `PATCH /tasks/:id` — Update a task
- `DELETE /tasks/:id` — Delete a task
- `PATCH /tasks/:id/move` — Move task to a column at a specific position (handles sibling reorder in a transaction)
- `POST /tasks/:id/archive` — Archive a task
- `POST /tasks/:id/unarchive` — Unarchive a task

---

## 2024-01-28 — Checklist & Tags

### Added
- `POST /tasks/:taskId/checklist` — Add a checklist item to a task
- `PATCH /checklist/:id` — Update a checklist item
- `DELETE /checklist/:id` — Delete a checklist item
- `GET /boards/:id/tags` — List tags for a board
- `POST /boards/:id/tags` — Create a tag on a board
- `PATCH /tags/:id` — Update a tag
- `DELETE /tags/:id` — Delete a tag

---

## 2024-02-01 — User Management, RBAC, Audit Log

### Added
- `GET /users/team` — List all team members (manager only); supports `?search=`, `?role=`, pagination
- `POST /users/team` — Create a team member (manager only)
- `PATCH /users/team/:id` — Update a team member's name, role, or active status (manager only)
- `DELETE /users/team/:id` — Soft-delete a team member — sets `isActive = false` (manager only)
- `POST /users/team/:id/reset-password` — Reset a team member's password; returns temp password once (manager only)
- `GET /audit-logs` — List all audit log entries, paginated (manager only)

### Changed
- `POST /tasks` — Team members now have `assigneeId` locked to themselves (server ignores any other value)
- `PATCH /tasks/:id` — Team members can only update their own tasks (returns 403 otherwise); team members cannot reassign tasks
- `DELETE /tasks/:id` — Team members can only delete their own tasks (returns 403 otherwise)
- `PATCH /tasks/:id/move` — Team members can only move their own tasks (returns 403 otherwise)
- `POST /tasks/:id/archive` — Team members can only archive their own tasks
- `POST /tasks/:id/unarchive` — Team members can only unarchive their own tasks

### Security
- Manager-only endpoints guarded by `RolesGuard` with `@Roles(MANAGER)` decorator
- Audit log written on: `USER_CREATED`, `ROLE_CHANGED`, `USER_DEACTIVATED`, `PASSWORD_RESET`, `TICKET_REASSIGNED`
