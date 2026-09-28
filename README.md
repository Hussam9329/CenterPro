# CenterPro

Arabic-first, RTL employee, attendance and payroll management for one physical center. Built directly in the final Next.js application, using the official CenterPro identity.

## Current delivery: Phase 1 — UI approval preview

This branch contains the complete interactive frontend with fictional, linked data. **It is not a live payroll or authentication system.** The owner's frontend-first workflow requires explicit UI approval before Neon, server authentication, production mutations, financial persistence and secure QR validation are implemented.

Preview roles: **المدير العام**, **مدير العمليات**, **موظف**. Select a role on the login screen; no real password is required. The visible password field is a design demonstration. Changes remain in `sessionStorage` for the current browser tab and can be reset from Settings. No credentials are stored. An accidentally created Vercel Production deployment displays a holding screen instead of exposing the mock application.

## Implemented preview

- Branded Arabic RTL, Latin digits, Baghdad dates/times, light theme, original vector logo, locally bundled Noto Sans Arabic and Inter.
- Responsive admin/employee navigation and all required management screens.
- Employee create/edit, profile, employment/account details, photo preview, activation and salary override forms.
- Department tier builder and fixed salary settings with validation and impact confirmation.
- Workdays, department selection, employee inclusion/exclusion, manual attendance and absence resolution.
- Camera scanner UI, rotating **preview-only** QR, all failure states and simulated own-account attendance.
- Payroll calculations in an independently tested domain layer, deductions/bonuses, negative balances, archives, explicit historical recalculation and preserved payment history.
- Seven report views, structured XLSX downloads and branded browser print-to-PDF. Reports are visibly marked as preview data.
- Audit history, before/after details, settings and a fixed role permission matrix.
- PWA manifest/icons and safe offline fallback. Financial pages and API data are never cached by the service worker.

## Stack

Next.js 16 App Router · React 19 · TypeScript strict · Tailwind CSS 4 + shared design tokens · Radix accessible dialogs · Lucide · Zod · Vitest · Playwright · ExcelJS.

Neon PostgreSQL and Drizzle are reserved for Phase 2. There are deliberately no database migrations, database connections, live authentication sessions or production data seeds in this preview.

## Local development

Node.js **24.x** and npm are required.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:3000. Use a fresh browser context to start with the original fixture.

## Quality gates

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

`npm run check` runs lint, typecheck, unit tests and production build. Browser tests launch the built application automatically; build before running them. CI also installs browser dependencies and runs E2E tests. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` may point to an existing headless Chromium in restricted environments; standard local/CI runs do not require this variable.

The responsive suite covers 360×800, 390×844, 430×932, 768×1024, 1024×1366, 1366×768, 1440×900 and 1920×1080 across all major admin and employee routes. Generated screenshots, PDFs and test reports remain ignored verification artifacts.

## Vercel Preview

- Framework: **Next.js**.
- Node.js: **24.x**.
- Install: `npm ci`.
- Build: `npm run build`.
- Root directory: repository root.
- Deploy to **Preview**, not Production.
- No environment variables or database credentials are required for Phase 1.

The deployed preview can be used on actual phones/tablets. Camera access requires HTTPS and an explicit permission gesture. Preview QR payloads are intentionally unsigned and cannot authorize real attendance. They are not a security implementation.

## Environment variables after UI approval

`.env.example` contains commented placeholders only. Do not add production credentials to this frontend preview.

| Variable | Phase 2 purpose |
| --- | --- |
| `DATABASE_URL` | Neon PostgreSQL connection; server-only |
| `SESSION_SECRET` | Strong random server-side session secret |
| `APP_TIMEZONE` | `Asia/Baghdad` |
| `BLOB_READ_WRITE_TOKEN` | Object storage for employee photos |

Phase 2 will add normalized Drizzle migrations, secure bootstrap (`db:seed-admin`), Argon2id password hashing, database-backed sessions, permission validation, transactions, authenticated object storage and signed QR token verification. The approved frontend and repository/service contracts will remain intact.

## Architecture

- `src/app`: final application routes, admin route group, employee workspace and standalone attendance display.
- `src/components/ui.tsx`: shared accessible primitives.
- `src/components/demo-provider.tsx`: replaceable browser-only preview repository/session adapter.
- `src/lib/types.ts`: shared domain contracts.
- `src/lib/payroll.ts`, `attendance.ts`, `permissions.ts`: testable preview rules.
- `src/lib/mock-data.ts`: deterministic fictional fixtures; must be replaced by real repositories before production release.
- `docs/MASTER_SPECIFICATION.txt`: supplied final specification, preserved verbatim.
- `docs/IMPLEMENTATION_PLAN.md`: phase boundary and execution plan.
- `docs/BRAND.md`: exact identity provenance and asset constraints.
- `docs/PHASE1_ACCEPTANCE.md`: delivered workflows, verification evidence and review instructions.

## Security and data boundary

All roles and attendance/payment operations are simulated in the browser. Client role checks demonstrate intended UX and are not a security boundary. Production authorization must be implemented server-side in Phase 2. Never use this preview for real employee records. No real passwords are accepted or saved by preview forms; password changes only simulate the success flow and sanitized audit event. Object URLs/base64 photo previews are temporary client-side data, not production photo storage.

The production backup and restore runbook will be added with Neon integration. There is no production database to migrate, seed or back up during Phase 1.
