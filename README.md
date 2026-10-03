# CenterPro

Arabic-first, RTL employee, attendance and payroll management for one physical center. Built directly in the final Next.js application using the official CenterPro identity.

## Current scope: revised Phase 1 — UI approval preview

The current revision starts as an **empty installation**. Departments, employees, attendance days and records, deductions, bonuses, payroll archives, payments and audit events all begin at zero. The owner can create records manually or explicitly load the six attendance test accounts from the login screen. Evaluation cycles, exams and scores always start empty.

This remains a browser-only frontend approval preview. It is not a live payroll or authentication system. Explicit UI approval is required before Neon, production authentication, server-side permissions, financial persistence or secure QR validation can be implemented.

The original [Master Specification](docs/MASTER_SPECIFICATION.txt) is preserved unchanged. The later owner-approved [Phase 1 Revision Request](docs/PHASE1_REVISION_REQUEST.md) overrides its previous default data, salary terminology, attendance navigation/open-day and welcome-duration assumptions. The subsequent [required-days patch](docs/patches/required-days_employee-form_attendance.patch) changes the salary basis, employee contact fields, deactivation dates and attendance notes. The latest [audit and evaluation patch](docs/patches/audit-evaluation-testdata.patch) adds evaluation workflows, optional test accounts and direct name selection at login. Current rules are recorded in [UI_CONTRACT.md](docs/UI_CONTRACT.md).

**Previous verified Preview (before the evaluation patch):** https://centerpro-2al22y1ye-hussam9329s-projects.vercel.app/login

**Previous verified application commit:** `ae7623330e86878cf0551936bbd4670ae3281813`. Lint, strict typecheck, 114 domain tests, all 69 browser tests and the production build pass in [GitHub CI](https://github.com/Hussam9329/CenterPro/actions/runs/36601010200). See the [patch handoff](docs/PATCH_ACCEPTANCE.md) for verification and deployment evidence. The earlier revision remains documented in the [Phase 1 handoff](docs/PHASE1_ACCEPTANCE.md).

## Starting the empty preview

1. Open the application and wait for the five-second CenterPro welcome screen.
2. Select **مدير النظام — Super Admin** and click **تسجيل الدخول**. The preview-only system administrator has no employee record, department, attendance or payroll entry. No real password is required.
3. Create the first department, then its employees.
4. Open an attendance day from **الحضور** and manage it from its dedicated details page.

The account selector shows existing active employees. From an empty installation, **تحميل بيانات الاختبار** adds ابرار حقي، هبة محمد، فاطمة فراس، مريم عصام (التصحيح) and جعفر علي، مريم فهد (التدقيق), with the requested attendance scenarios and no exams/evaluations. Role switching never fabricates accounts. A successful login shows the five-second welcome screen before navigation to the destination.

Changes persist in the current tab's `sessionStorage`, using key `centerpro-ui-preview-v3` and storage version `3`. Valid v2 owner data migrates without resetting employees, attendance or archived payroll. Old v1 fixtures are not restored. The Settings reset action returns the installation to the same empty state and retains the separate system administrator access. No credentials are stored.

## Revised workflows

- Official CenterPro logo, Arabic RTL, Latin digits, Baghdad dates/times, light theme, locally bundled Noto Sans Arabic and Inter.
- Five-second welcome on every full page load and successful login, with the exact message **مرحباً بك موظفنا المميز**. Ordinary client navigation does not replay it. Reduced motion keeps the duration and simplifies animation.
- Guided empty states, prerequisite checks and setup links. Employee creation requires a department; financial adjustments require an employee.
- Salary type labels are only **قطعي** (`FIXED`) and **غير قطعي** (`TIERED`). Department configuration uses **قوانين القسم**, **إضافة قانون** and **القانون 1**. Stable internal domain names remain unchanged.
- Employee create/edit, profile, employment/account details, photo preview, activation and salary overrides. Both phones require fixed `07` plus nine editable digits; Telegram uses a fixed `@`. Email and editable employment end date are removed. Deactivation sets the end date; reactivation clears it.
- One **الحضور** navigation item. `/attendance` lists days; `/attendance/[id]` contains day settings, employees, exceptions, attendance review and closing/reopening actions.
- **At most one OPEN attendance day across the entire system.** Opening or reopening another day is rejected until the current day is closed. The shared preview mutation boundary also enforces this rule.
- Unresolved employees block closing and are never automatically marked absent. Seconds precision, absence rules and audits remain intact. Attendance-record notes are optional; removal still requires confirmation. Day-setting and archive/reopen reasons retain their existing requirements.
- `/workdays` safely redirects to `/attendance`; its former create shortcut forwards to `/attendance?open=new`.
- Standalone `/attendance-display` uses the single open day. Camera decoding and rotating QR remain preview-only simulations.
- Payroll salary laws now use required days (present, excused/unexcused absence and unresolved required days), followed by deductions and bonuses. EXEMPT days do not count. Partial fixed salary uses required days × daily rate up to the fixed salary; full-month fixed salary is unchanged. Archived financial snapshots and payment history stay frozen until explicit authorized recalculation.
- Seven report views, genuine structured XLSX downloads and branded browser print-to-PDF. Reports identify their preview status.
- Exam and cycle evaluation leaderboards, auditor multiselect, automatic save, read-only corrector views, frozen archives and score = papers − correction errors × 5 − behavior errors × 3. Exam count is informational.
- Audit history, before/after details, settings and role restrictions.
- PWA manifest/icons and public offline fallback. The service worker does not cache financial pages or business/API data.

## Stack

Next.js 16 App Router · React 19 · TypeScript strict · Tailwind CSS 4 + shared design tokens · Radix accessible dialogs · Lucide · Zod · Vitest · Playwright · ExcelJS.

Neon PostgreSQL and Drizzle are reserved for Phase 2. There are no database migrations, database connections, production sessions or production data seeds in this preview.

## Local development

Node.js **24.x** and npm are required.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:3000. A fresh browser context starts with empty operational collections and the separate preview system administrator. Existing v2 owner data upgrades to v3 with empty evaluation collections and remains intact until an explicit reset.

## Quality gates

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

`npm run check` runs lint, typecheck, unit tests and the production build. Browser tests launch the built application; build before running them. CI installs browser dependencies and runs the E2E suite. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` may select an existing headless Chromium in restricted environments; normal local/CI runs do not require it.

Broad populated regression scenarios remain in `tests/fixtures/populated-data.ts`. Six owner-requested test accounts are available through the explicit preview loader only. The normal startup remains empty. Tests explicitly opt into fixture data through helpers. Shared browser helpers advance the real five-second welcome with Playwright's clock; the application has no test-only splash bypass.

Responsive coverage targets 360×800, 390×844, 430×932, 768×1024, 1024×1366, 1366×768, 1440×900 and 1920×1080. Generated screenshots, PDFs and test reports remain ignored verification artifacts. The revised application passes all gates, including empty and populated workflows, attendance dialogs, accessibility, welcome timing, PWA and exports.

## Vercel Preview

- Framework: **Next.js**.
- Node.js: **24.x**.
- Install: `npm ci`.
- Build: `npm run build`.
- Root directory: repository root.
- Deploy to **Preview**, not Production.
- No environment variables or database credentials are required for Phase 1.

Camera access requires HTTPS and explicit user permission. Preview QR payloads are unsigned and cannot authorize real attendance. Accidental Production deployments show a holding screen instead of the preview application.

## Environment variables after UI approval

`.env.example` contains commented placeholders only. Do not add production credentials to this frontend preview.

| Variable | Phase 2 purpose |
| --- | --- |
| `DATABASE_URL` | Neon PostgreSQL connection; server-only |
| `SESSION_SECRET` | Strong random server-side session secret |
| `APP_TIMEZONE` | `Asia/Baghdad` |
| `BLOB_READ_WRITE_TOKEN` | Object storage for employee photos |

Phase 2 will add normalized Drizzle migrations, secure Super Admin bootstrap, password hashing, database-backed sessions, server permission validation, transactions, authenticated object storage and signed QR verification. The approved frontend design will remain intact.

## Architecture

- `src/app`: final application routes, unified attendance hub/details, employee workspace and standalone attendance display.
- `src/components/ui.tsx`: shared accessible primitives.
- `src/components/demo-provider.tsx`: browser-only preview repository/session adapter and shared state guard.
- `src/components/welcome-provider.tsx`: shared initial-load and post-login welcome lifecycle.
- `src/lib/preview-config.ts`: versioned preview storage and separate system administrator identity.
- `src/lib/mock-data.ts`: empty installation factory, preview constants and explicit six-account test-data factory.
- `src/lib/types.ts`: shared domain contracts.
- `src/lib/payroll.ts`, `attendance.ts`, `evaluations.ts`, `permissions.ts`: independently testable preview rules.
- `tests/fixtures/populated-data.ts`: test-only populated scenarios.
- `tests/e2e/helpers/preview.ts`: explicit fixture seeding and splash-aware browser helpers.
- `docs/MASTER_SPECIFICATION.txt`: original supplied specification, preserved verbatim.
- `docs/PHASE1_REVISION_REQUEST.md`: later supplied change request, preserved verbatim.
- `docs/UI_CONTRACT.md`: current frontend contracts and revision invariants.
- `docs/BRAND.md`: identity provenance and asset constraints.
- `docs/EVALUATION_PATCH_ACCEPTANCE.md`: current evaluation patch delivery and verification evidence.
- `docs/PATCH_ACCEPTANCE.md`: prior required-days patch delivery and verification evidence.
- `docs/PHASE1_ACCEPTANCE.md`: preceding Phase 1 revision and historical evidence.

## Security and data boundary

Roles and attendance/payment operations are simulated in the browser. Client checks demonstrate intended UX; they are not production authorization. Use manually entered test data only. Real passwords are not accepted or saved by preview forms; resets simulate the success flow and sanitized audit event. Photo previews are temporary client data, not production object storage.

There is no production database to migrate, seed or back up in Phase 1. Stop after the revised Preview is delivered and wait for explicit UI/UX approval.
