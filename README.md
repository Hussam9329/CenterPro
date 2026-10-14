# CenterPro

Arabic RTL employee, attendance, evaluation and payroll management for one physical center, using the approved CenterPro visual identity.

## Current implementation: Neon backend integration

The owner authorized connecting Neon on October 12, 2026. This revision connects the approved Next.js frontend to server-side authentication, authorization, PostgreSQL persistence and signed QR attendance. Application records are shared between authenticated devices. The existing browser data is not silently uploaded, reset or deleted.

**Migration status:** the owner's downloaded backup was imported into Neon on October 12, 2026, preserving existing accounts and records. Public visitors cannot create an administrator. A fresh installation remains locked until its reviewed backup is imported.

The Neon integration was released from `ddbafceb5a011a66624c9bdd69caba0eed549523`. See [NEON_BACKEND.md](docs/NEON_BACKEND.md) for backend details and [QR_DISPLAY.md](docs/QR_DISPLAY.md) for the dedicated iPad account and its additive database upgrade. Historical browser-only backup documentation is retained in [SYSTEM_BACKUP.md](docs/SYSTEM_BACKUP.md).

## Development

Use Node.js **24.x** and npm.

```sh
npm ci
npm run dev
```

Without `DATABASE_URL`, local development keeps the isolated browser adapter used by the existing frontend regression suite. With `DATABASE_URL`, it uses the real backend. Vercel always selects the server adapter and fails closed if required configuration is missing; it never silently falls back to browser-local accounts.

Copy the variable names from `.env.example` into your local environment or Vercel settings. Never commit a credential or private backup.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Server-only pooled Neon PostgreSQL connection URL with TLS |
| `SESSION_SECRET` | At least 32 cryptographically random bytes, used for authentication-related HMACs and QR signatures |
| `APP_ORIGIN` | Canonical application origin, e.g. `https://centerpro-sigma.vercel.app` |
| `APP_TIMEZONE` | `Asia/Baghdad` |
| `BLOB_READ_WRITE_TOKEN` | Server-only token for the private Vercel Blob store containing employee photos |

Do not prefix secrets with `NEXT_PUBLIC_`. Production and Preview should use separate databases, secrets and private storage when Preview contains test data.

## Database and importing the existing browser backup

Migrations run explicitly, never during application startup or deployment builds:

```sh
npm run db:migrate -- --check
npm run db:migrate
npm run db:import -- /absolute/path/CenterPro-backup.json --dry-run
npm run db:import -- /absolute/path/CenterPro-backup.json
```

The dry run validates the file without connecting to the database. The real import runs atomically into an empty migrated database, checks the file digest and references, and refuses to overwrite an existing installation. Retrying the same completed import is a no-op. The import does not recalculate payroll archives or invent accounts, passwords, departments or evaluation seasons.

The JSON file includes private personnel records and password-verification hashes. Keep it private and out of Git. Existing password hashes are imported with their original derivation parameters, so the same usernames/passwords can be verified after migration. Browser session objects are never trusted or imported; users sign in again through secure server sessions.

The repository contains no supplied real user backup. Do not re-import or reset the existing Production installation when deploying updates.

## Implemented workflows

- Employee profiles, usernames, password resets, role restrictions, activation/deactivation, protected salary overrides and employee photos.
- Department salary rules, required-day payroll, negative balances, deductions, bonuses, immutable payments, archived snapshots and explicit historical recalculation.
- One open workday system-wide, per-date uniqueness, employee participation overrides, unresolved attendance review and manual corrections.
- Server-issued rotating QR, signed expiry/workday state, server-authoritative Baghdad timestamps and duplicate prevention. A dedicated QR Display account can remain signed in on the center iPad and is server-restricted to the attendance display only. No GPS or Wi-Fi restrictions.
- Evaluation seasons/cycles/exams, auditor-only count entry, frozen archives, and published-only corrector results and rankings.
- Append-only server audit events, owner-only complete backup, structured XLSX exports and Arabic print reports.
- Approved Arabic RTL UI, Latin digits, light/dark selection, responsive layouts, accessible forms, calculator and PWA public offline fallback.

Authentication uses username/password and opaque database-backed sessions. Cookies are HttpOnly, SameSite=Strict and Secure in Production. Password changes revoke existing sessions. Server permissions and read projections protect other employees' private data and unpublished evaluation results before any response reaches the browser.

## Quality gates

```sh
npm run check
npx playwright install --with-deps chromium
npm run test:e2e
DATABASE_URL=postgresql://test:test@localhost:5432/centerpro_transport_only SESSION_SECRET=transport-tests-only-not-a-production-secret npm run build
npm run test:e2e:remote
```

Run these gates in an isolated checkout without real deployment credentials. `npm run check` runs lint, strict TypeScript checks, unit/integration tests and the production build. The original browser suite uses the isolated local adapter; the second build selects the server adapter for remote transport tests with controlled API fixtures. PostgreSQL integration tests use PGlite to apply the actual SQL migration and exercise transactional persistence. Remote transport tests alone are not proof that Neon is reachable: deployment verification separately checks the real service.

See `.github/workflows/quality.yml` and [NEON_BACKEND.md](docs/NEON_BACKEND.md). Final test counts and the exact deployed commit must be recorded after release verification; older phase-one counts are historical only.

## Architecture and deployment

Next.js App Router · React · TypeScript strict · Drizzle ORM · Neon PostgreSQL · private Vercel Blob · Zod · Vitest · Playwright · ExcelJS.

- `src/components/demo-provider.tsx`: compatible client adapter, asynchronous saves and refreshed server snapshots; retains the isolated local regression adapter.
- `src/lib/server-contract.ts`: record-level change protocol; no whole-database PUT and no client-writable audit log.
- `src/server/domain.ts`: canonical server validation, authorization, attendance/financial transitions and audit derivation.
- `src/server/projection.ts`: role-scoped response data and safe evaluation aggregates.
- `src/server/auth.ts` / `auth-crypto.ts`: sessions, password verification, login throttling and signed QR.
- `src/server/db`: Drizzle schema, repository and transactional import.
- `drizzle/0001_centerpro.sql` + `drizzle/0002_qr_display_account.sql`: versioned database migrations.
- `src/app/api`: authenticated API handlers.

Each business collection has its own table. Indexed relational columns enforce identity, foreign keys and uniqueness; JSONB records retain the approved application's fields and frozen historical snapshots. This is a compatibility-preserving relational/JSONB schema, not a claim that every salary tier or nested archive has an individual normalized table.

Vercel project settings: **Next.js**, Node.js **24.x**, install `npm ci`, build `npm run build`, repository root, authorized branch `main` and target **Production**. Configure required environment variables before deployment. The repository's previous releases used explicit deployment API calls; a push is not itself evidence that a new Production deployment became active.

## Authoritative requirements and history

[MASTER_SPECIFICATION.txt](docs/MASTER_SPECIFICATION.txt) is retained unchanged. Later owner-approved patches take precedence where they intentionally revise it. [UI_CONTRACT.md](docs/UI_CONTRACT.md) records the approved frontend: required-day salary basis, optional attendance notes, separate owner identity, evaluation publication rules, rank artwork and theme behavior. Backend integration preserves those rules.

Phase-one acceptance documents describe earlier browser-only implementations. In particular, their local administrator setup, local-only credential/session explanations and Preview-only deployment restrictions are historical, not instructions for the current server deployment. [NEON_BACKEND.md](docs/NEON_BACKEND.md) is the current operational handoff.
