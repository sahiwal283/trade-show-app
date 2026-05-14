# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Trade show expense management PWA with OCR receipt scanning, Zoho Books integration, and offline-first architecture. Full-stack: React/Vite frontend + Express/TypeScript backend + PostgreSQL.

## Commands

### Development

```bash
# Start both frontend and backend together
npm run start:all

# Start individually
npm run dev                    # Frontend only (http://localhost:5173)
npm run start:backend          # Backend only (http://localhost:5000)

# Backend dev server with hot reload
cd backend && npm run dev
```

### Build

```bash
npm run build                   # Frontend production build
npm run build:sandbox           # Sandbox build (validates env first)
npm run build:production        # Production build (validates env first)

cd backend && npm run build     # Compile TypeScript + copy Python files
```

### Testing

```bash
# Frontend
npm run lint
npm run format:check

# Backend
cd backend && npm test                          # Unit tests (Vitest)
cd backend && npm run test:integration          # Integration tests
cd backend && npm run test:integration:schema   # Schema validation test
cd backend && npm run test:coverage             # Coverage report

# Single test file
cd backend && npx vitest run tests/path/to/file.test.ts
```

### Database

```bash
cd backend && npm run migrate   # Run pending migrations
cd backend && npm run seed      # Seed demo data (admin/password123)
```

## Architecture

### Monorepo Structure

```
trade-show-app/
├── src/            # React frontend
├── backend/src/    # Express backend
├── public/         # Static assets + service worker
├── scripts/        # Build and deployment scripts
└── docs/           # ARCHITECTURE.md, MASTER_GUIDE.md
```

### Backend (`backend/src/`)

- **`server.ts`** — Express app setup, middleware registration, route mounting
- **`routes/`** — 20 route files, each mounted at `/api/<resource>`
- **`services/`** — Business logic; never import directly from routes into other routes
- **`database/repositories/`** — Repository pattern over raw `pg` queries (no ORM)
- **`database/migrations/`** — SQL files; tracked in `schema_migrations` table; auto-run on startup
- **`middleware/`** — Auth JWT verification, session tracker (updates `last_activity`), request logger

Key service boundaries:
- **`zohoIntegrationClient.ts`** — All Zoho Books OAuth and sync logic lives here. Enforced boundary: only the integration service accesses Zoho.
- **`ocr/`** — Tesseract.js → optional Ollama LLM enhancement (when confidence < 0.70) → correction tracking
- **`ExpenseService.ts`** — Owns expense status transitions via 3-rule automated approval logic
- **`EventParticipantService.ts`** — Event-user relationship management

### Frontend (`src/`)

- **`App.tsx`** — Single-page app with string-based view state (not React Router); role-based rendering
- **`components/`** — Feature folders: `admin/`, `auth/`, `checklist/`, `expenses/`, `events/`, `reports/`, `developer/`
- **`hooks/`** — `useAuth`, `useApi`, `useDataFetching` are the primary data-access hooks
- **`utils/apiClient.ts`** — Axios instance with JWT injection; all API calls go through here
- **`utils/syncManager.ts`** — Offline sync queue; auto-flushes on reconnect
- **`utils/offlineDb.ts`** — Dexie (IndexedDB) wrapper for offline storage

### Authentication & Sessions

JWT stored in localStorage, injected via Axios interceptor. The session tracker middleware updates `last_activity` on every authenticated request. Frontend auto-refreshes with a 5-minute inactivity warning.

### Offline-First PWA

Service worker (`public/service-worker.js`) handles caching. IndexedDB (Dexie) stores pending mutations. `syncManager` replays the queue when the connection restores. After deploying a new frontend, the NPMplus proxy cache must be cleared (Proxmox container 104).

### Dynamic Role System

Roles are database-driven. System roles: `admin`, `accountant`, `coordinator`, `salesperson`, `developer`, `temporary`, `pending`. Custom roles can be created via the Admin UI. The `developer` role is the only one with access to `/dev-dashboard`.

### Zoho Books Integration

OAuth 2.0 with auto token refresh. Separate credentials for sandbox vs. production (different organization IDs). `zoho_expense_id` on the expense record prevents duplicates. Supports 5 entities: Haute Brands, Alpha, Beta, Gamma, Delta.

## Database Conventions

- Raw SQL with parameterized queries — no ORM
- All schema changes go in a new numbered migration file (`NNN_description.sql`)
- Never modify an existing migration; always add a new one
- Migrations auto-apply at startup via `migrate.ts`

## Environment

Frontend env vars use `VITE_` prefix (Vite convention). Backend uses dotenv. Use `env.example` as the template. The key vars:

```
# Backend
PORT, DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
JWT_SECRET (≥32 chars)
ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, ZOHO_ORGANIZATION_ID

# Frontend
VITE_API_BASE_URL=/api
```

## Deployment Notes

Version must be bumped in both `package.json` and `backend/package.json` before deploying. Run `npm run build:sandbox` or `npm run build:production` (both validate env first). After frontend deploy, restart NPMplus proxy to bust cache. Backend service: `systemctl restart trade-show-app-backend`.
