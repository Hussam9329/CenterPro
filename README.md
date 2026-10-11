# CenterPro

Arabic-first, RTL employee, attendance and payroll management for one physical center. Built directly in the final Next.js application using the official CenterPro identity.

## Current scope: revised Phase 1 — frontend on Vercel Production

The current revision starts as an **empty installation**. Departments, employees, attendance days and records, deductions, bonuses, payroll archives, payments and audit events all begin at zero. The owner creates records manually. The latest cleanup removes the login fixture loader and starts a new version-4 browser store, discarding the older preview stores. Evaluation cycles, exams and scores always start empty.

The owner explicitly authorized deployment of `main` to Vercel **Production** on October 11, 2026. This supersedes the earlier Preview-only hosting restriction. The application remains browser-only. The owner-supplied username/password patch adds local credential verification; Neon, centralized authentication, server-side permissions, financial persistence and secure QR validation still require the deferred backend phase and its approval.

The original [Master Specification](docs/MASTER_SPECIFICATION.txt) is preserved unchanged. The later owner-approved [Phase 1 Revision Request](docs/PHASE1_REVISION_REQUEST.md) overrides its previous default data, salary terminology, attendance navigation/open-day and welcome-duration assumptions. The subsequent [required-days patch](docs/patches/required-days_employee-form_attendance.patch) changes the salary basis, employee contact fields, deactivation dates and attendance notes. The [audit and evaluation patch](docs/patches/audit-evaluation-testdata.patch) adds evaluation workflows, optional test accounts and direct name selection at login. The latest owner-approved season/rank/theme changes are recorded in [SEASON_RANK_UI_REVISION.md](docs/SEASON_RANK_UI_REVISION.md) and override older welcome/theme/evaluation presentation rules. The later [rank assets and audit hub patch](docs/patches/rank-assets-audit-hub-ui-cleanup.patch) replaces rank artwork, splits administration pages and updates profile/login presentation. The October 5 [native ranks and UI clarity patch](docs/patches/native-ranks-ui-clarity.patch) replaces displayed rank PNGs with native SVG and improves readability in both themes. The October 7 [UI clarity and rank assets patch](docs/patches/ui-clarity-rank-assets.patch) switches to the supplied shadow-free faceted assets and simplifies shared presentation and notifications. The October 11 [final UI and calculator patch](docs/patches/final-ui-calculator-rank-fix.patch) adds the standalone calculator to every account, uses the complete approved welcome logo, replaces all 22 rank images with the supplied 1024px assets and strengthens crimson accents. The later October 11 [rank edge patch](docs/patches/rank-edge-final-fix.patch) adds aligned vector silhouette masks and thin tier-colored outlines, including the four missing SVG dependencies. The later [cleanup and dark welcome patch](docs/patches/production-cleanup-dark-welcome.patch) removes preview chrome and the fixture loader, clears legacy browser state, removes the production holding screen and keeps the welcome white with the colored brand logo in both themes. The latest [username/password patch](docs/patches/username-password-login.patch) replaces name selection with browser-local username/password login, initial system-administrator setup and functional employee password changes. It supersedes older account-selector and simulated-password behavior. Current rules are recorded in [UI_CONTRACT.md](docs/UI_CONTRACT.md).

**Verified Production:** https://centerpro-sigma.vercel.app/login — the inline employee password editing revision is deployed from `main` and assigned to the project's Production domain.

**Production source on `main`:** `3ffbd8becfd900d54d3384059776bfa7a6261c12`. [GitHub CI](https://github.com/Hussam9329/CenterPro/actions/runs/38159922612) passes lint, typecheck, **214 unit tests**, **150 browser scenarios** and production build. The [employee password edit handoff](docs/EMPLOYEE_PASSWORD_EDIT_ACCEPTANCE.md) records the inline edit behavior, permissions, browser-local scope and verified Production deployment. Previous acceptance documents remain historical evidence.

## Starting the empty frontend

1. Open the application; the login screen appears directly with no welcome splash.
2. On a browser without configured credentials, **تهيئة مدير النظام** suggests `centerpro-owner`. Choose that or another unique username, enter a password of at least six characters, repeat it in the confirmation field and select **إنشاء حساب مدير النظام**. There is no default password. This separate system administrator has no employee record, department, attendance or payroll entry.
3. A successful setup or explicit login shows the centered three-second CenterPro welcome. Later visits use **اسم المستخدم** and **كلمة المرور**, with no account selector.
4. Create the first department, then employees with their usernames and passwords. Existing employee records without credentials cannot log in until an authorized administrator uses **تغيير كلمة المرور**; no password is invented or migrated from older forms.
5. Open an attendance day from **الحضور** and manage it from its dedicated details page.

Usernames are trimmed and compared case-insensitively. Inactive employee accounts cannot log in. **ابقني مسجلاً** remembers the verified local session on the same browser; restored sessions do not replay the welcome. Logout returns to the credential form.

Operational records use `sessionStorage` key `centerpro-ui-preview-v4`, storage version `4`. Remembered sessions use `centerpro-ui-preview-remembered-v2`, and their durable records use `centerpro-ui-preview-data-v2`. The cleanup policy still removes old session v1/v2/v3 and remembered/data v1 stores rather than migrating them. Current version-4 records survive reload and valid remembered-session restoration.

Credential records are separate in `localStorage` under `centerpro-local-auth-v1`: a unique 16-byte random salt and a 32-byte PBKDF2-SHA-256 hash derived with 150,000 iterations, plus credential version and update time. The system credential also stores the chosen username; employee credentials are keyed by employee ID. Plaintext passwords do not enter saved application records or audit events. Sessions carry `authVersion` matching the current credential version; older passwordless sessions and sessions invalidated by a password reset are rejected.

Settings reset clears operational records and employee credentials while preserving the configured system-administrator username and password hash. Logout clears remembered sign-in without deleting credentials or retained records. If local storage or browser cryptography is unavailable, credential operations fail instead of pretending to save or replacing an existing owner. These credentials and records are local to this browser and origin; there is no cross-device account store or Neon connection.

## Revised workflows

- Official CenterPro logo, Arabic RTL, Latin digits, Baghdad dates/times, locally bundled Noto Sans Arabic and Inter. Light is default, with a user-controlled saved Light/Dark toggle; the app does not follow the OS theme automatically.
- No pre-login welcome. A successful explicit login shows a centered three-second welcome with **اهلاً بيك** / **موظفنا الـ مو عادي**. Refresh, normal navigation and remembered-session restore do not replay it. Reduced motion keeps the timing and simplifies animation. The welcome always uses a white background, dark text and `/brand/logo.svg`; completing it returns to the selected application theme.
- Guided empty states, prerequisite checks and setup links. Employee creation requires a department; financial adjustments require an employee.
- Salary type labels are only **قطعي** (`FIXED`) and **غير قطعي** (`TIERED`). Department configuration uses **قوانين القسم**, **إضافة قانون** and **القانون 1**. Stable internal domain names remain unchanged.
- Employee create/edit, profile, employment/account details, photo preview, activation and salary overrides. Authorized administrators can change a password from **تعديل الملف → حساب الدخول → كلمة المرور الجديدة**; leaving it blank preserves the existing password, and saving a new password invalidates prior sessions. Both phones require fixed `07` plus nine editable digits; Telegram uses a fixed `@`. Email and editable employment end date are removed. Deactivation sets the end date; reactivation clears it.
- One **الحضور** navigation item. `/attendance` lists days; `/attendance/[id]` contains day settings, employees, exceptions, attendance review and closing/reopening actions.
- **At most one OPEN attendance day across the entire system.** Opening or reopening another day is rejected until the current day is closed. The shared preview mutation boundary also enforces this rule.
- Unresolved employees block closing and are never automatically marked absent. Seconds precision, absence rules and audits remain intact. Attendance-record notes are optional; removal still requires confirmation. Day-setting and archive/reopen reasons retain their existing requirements.
- `/workdays` safely redirects to `/attendance`; its former create shortcut forwards to `/attendance?open=new`.
- Standalone `/attendance-display` uses the single open day. Camera decoding and rotating QR remain preview-only simulations.
- Payroll salary laws now use required days (present, excused/unexcused absence and unresolved required days), followed by deductions and bonuses. EXEMPT days do not count. Partial fixed salary uses required days × daily rate up to the fixed salary; full-month fixed salary is unchanged. Archived financial snapshots and payment history stay frozen until explicit authorized recalculation.
- Seven report views, genuine structured XLSX downloads and branded browser print-to-PDF. Reports identify their preview status.
- Exam and cycle evaluation leaderboards, auditor multiselect, automatic save, read-only corrector views, frozen archives and score = papers − correction errors × 5 − behavior errors × 3. Exam count is informational. Open-exam results stay hidden from correctors until Admin closes the exam.
- Evaluation seasons aggregate multiple cycles independently of payroll months. Seasonal ranks progress Bronze → Silver → Gold → Platinum → Diamond → Emerald → Master → Grandmaster (12,000+). Rank badges use 22 supplied transparent faceted PNGs, without CSS shadows or a separate tile, and shine clipped by the same vector silhouette as the image, with a thin matching vector edge; seasonal attendance days and papers/day are informational only.
- A three-card audit hub leads to separate seasons, cycles and exams pages. Historical season/cycle/exam navigation preserves context. Admin corrector profiles show live rank and progress; correctors see published seasonal results only.
- Larger, clearer typography, controls and cards across all workspaces, with responsive layouts and authored light/dark colors. Rank summaries show one label and no seasonal motivational phrase. User-entered department descriptions and compact print layouts remain available. Redundant shared header descriptions and summary hints are removed; notifications dismiss automatically after 3.2 seconds and restart for new messages.
- Standalone calculator for all accounts, including both administrator roles, with touch/keyboard operation, readable long results, inherited theme and a safe in-app return control. It does not alter business records.
- Administrator greeting **مرحباً**, complete approved artwork in the three-second welcome, login slogan **CenterPro معك بكل خطوة.** and **Kal-EL VISIONS © 2026** footer.
- Audit history, before/after details, settings and role restrictions.
- PWA manifest/icons and public offline fallback. The service worker does not cache financial pages or business/API data.

## Stack

Next.js 16 App Router · React 19 · TypeScript strict · Tailwind CSS 4 + shared design tokens · Radix accessible dialogs · Lucide · Zod · Vitest · Playwright · ExcelJS.

Neon PostgreSQL and Drizzle are reserved for Phase 2. There are no database migrations, database connections, server-backed sessions or production data seeds in this frontend.

## Local development

Node.js **24.x** and npm are required.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:3000. A fresh browser context starts with empty operational collections and the initial local system-administrator setup. The version-4 cleanup discards historical preview stores; newly created records remain intact until an explicit reset.

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

Broad populated regression scenarios remain in `tests/fixtures/populated-data.ts`. The seven-account factory is used by automated tests only and is not exposed through the application UI. The normal startup remains empty. Tests explicitly opt into fixture data through helpers. Shared browser helpers advance the real three-second post-login welcome with Playwright's clock; the application has no test-only splash bypass.

Responsive coverage targets 360×800, 390×844, 430×932, 768×1024, 1024×1366, 1366×768, 1440×900 and 1920×1080. Generated test screenshots, PDFs and test reports remain ignored verification artifacts; selected live Preview screenshots accompany the committed handoff. The current release passes 214 unit/domain tests and 150 browser scenarios; see [EMPLOYEE_PASSWORD_EDIT_ACCEPTANCE.md](docs/EMPLOYEE_PASSWORD_EDIT_ACCEPTANCE.md) for exact-commit CI and Production evidence. The new tests exercise real local password verification and reject legacy passwordless sessions. Coverage includes seasons, rank thresholds, archived snapshots, legacy-data cleanup and preservation of new version-4 records, explicit theme/session persistence, result publication/reopening, anchored keyboard filtering, eight responsive widths, light/dark accessibility checks, all 22 supplied rank images, notification replacement timing and the standalone calculator across roles, themes, inputs and viewport sizes.

## Vercel Production

- Framework: **Next.js**.
- Node.js: **24.x**.
- Install: `npm ci`.
- Build: `npm run build`.
- Root directory: repository root.
- Deploy branch **`main`** to **Production**, as explicitly authorized by the owner on October 11, 2026.
- No environment variables or database credentials are required for Phase 1.

Camera access requires HTTPS and explicit user permission. Preview QR payloads are unsigned and cannot authorize real attendance. The requested patch removes the Production holding screen. The username/password patch verifies locally stored password hashes; account data, session validation and QR handling still run in the browser, with no backend integration.

## Environment variables after UI approval

`.env.example` contains commented placeholders only. Do not add production credentials to this frontend preview.

| Variable | Phase 2 purpose |
| --- | --- |
| `DATABASE_URL` | Neon PostgreSQL connection; server-only |
| `SESSION_SECRET` | Strong random server-side session secret |
| `APP_TIMEZONE` | `Asia/Baghdad` |
| `BLOB_READ_WRITE_TOKEN` | Object storage for employee photos |

Phase 2 will add normalized Drizzle migrations, server-side Super Admin bootstrap and password hashing, database-backed sessions, server permission validation, transactions, authenticated object storage and signed QR verification. The approved frontend design will remain intact.

## Architecture

- `src/app`: final application routes, unified attendance hub/details, employee workspace and standalone attendance display.
- `src/components/ui.tsx`: shared accessible primitives.
- `src/components/demo-provider.tsx`: browser-only preview repository/session adapter and shared state guard.
- `src/components/welcome-provider.tsx`: post-login-only three-second welcome lifecycle.
- `src/components/theme-provider.tsx`: explicit saved Light/Dark theme choice.
- `src/lib/preview-config.ts`: versioned operational storage and separate system administrator identity.
- `src/lib/local-auth.ts`: browser-local credential hashing, verification, versioning and password updates.
- `src/lib/mock-data.ts`: empty installation factory, preview constants and explicit seven-account test-data factory.
- `src/lib/types.ts`: shared domain contracts.
- `src/lib/payroll.ts`, `attendance.ts`, `evaluations.ts`, `permissions.ts`: independently testable preview rules.
- `tests/fixtures/populated-data.ts`: test-only populated scenarios.
- `tests/e2e/helpers/preview.ts`: explicit fixture seeding and splash-aware browser helpers.
- `docs/MASTER_SPECIFICATION.txt`: original supplied specification, preserved verbatim.
- `docs/PHASE1_REVISION_REQUEST.md`: later supplied change request, preserved verbatim.
- `docs/UI_CONTRACT.md`: current frontend contracts and revision invariants.
- `docs/BRAND.md`: identity provenance and asset constraints.
- `docs/EVALUATION_PATCH_ACCEPTANCE.md`: previous evaluation patch delivery and verification evidence.
- `docs/SEASON_RANK_UI_REVISION.md`: latest season, rank, publication, theme, session and UI rules.
- `docs/PATCH_ACCEPTANCE.md`: prior required-days patch delivery and verification evidence.
- `docs/PHASE1_ACCEPTANCE.md`: preceding Phase 1 revision and historical evidence.

## Security and data boundary

Username/password forms verify PBKDF2 password hashes in the current browser. Employee creation and authorized password reset save hashed credentials; audit events contain only sanitized reset metadata. The system administrator is configured once per browser/origin, and clearing browser storage removes that local setup. This is not centralized authentication: browser-side roles and attendance/payment checks remain frontend controls rather than server-enforced authorization. Photo previews are temporary client data, not production object storage.

There is no production database to migrate, seed or back up in Phase 1. Production hosting of the current frontend is authorized; backend integration remains deferred until explicit UI/UX approval.
