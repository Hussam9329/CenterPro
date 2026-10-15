# Shared frontend contract

## Current server integration

The owner's October 12, 2026 instruction to connect the supplied Neon database authorizes the backend integration described in [NEON_BACKEND.md](NEON_BACKEND.md). It supersedes the earlier backend deferral below. The approved design and later salary, attendance and evaluation rules remain authoritative. Vercel uses server sessions, authorized database operations and signed QR; the local adapter remains only for isolated local development/regression tests. Browser-local setup/reset instructions below do not apply to the server deployment. The owner's backup was imported on October 12; updates must preserve the installation without repeating that import, exposing public owner bootstrap or inventing accounts. Existing browser storage remains untouched.

The October 15 account-permissions patch supersedes department-based auditor access and adds owner evaluation editing and attendance date formatting as described below. [ACCOUNT_PERMISSIONS_PATCH.md](ACCOUNT_PERMISSIONS_PATCH.md) records the current setup and limits. No automatic grants, new environment variables or SQL migration are required.

## Authoritative revision

`MASTER_SPECIFICATION.txt` remains the unchanged original specification. `PHASE1_REVISION_REQUEST.md` is the later owner-approved addendum and takes precedence for startup data, preview administrator, salary terminology, attendance architecture and the single-open-day rule. The later owner-supplied `patches/required-days_employee-form_attendance.patch` overrides salary-basis, employee-form and attendance-note requirements as described below. The October 3 `patches/audit-evaluation-testdata.patch` adds evaluation workflows, explicit preview test data and name-based preview login. `SEASON_RANK_UI_REVISION.md` overrides older welcome, theme, test-account-count and evaluation-publication presentation rules. The subsequent `patches/rank-assets-audit-hub-ui-cleanup.patch` replaces rank assets, splits audit administration pages and updates profile/login presentation. The October 5 `patches/native-ranks-ui-clarity.patch` supersedes its displayed rank assets and typography as described below. The October 7 `patches/ui-clarity-rank-assets.patch` supersedes the October 5 rank renderer and further simplifies the shared UI. The October 11 `patches/final-ui-calculator-rank-fix.patch` replaces the rank images, adds the standalone calculator for every role, strengthens crimson accents and fixes the welcome logo. The later October 11 `patches/rank-edge-final-fix.patch` clips rank artwork and shine to aligned vector silhouettes and overlays a thin tier-colored vector edge; its four SVG dependencies are supplied alongside the implementation. The later `patches/production-cleanup-dark-welcome.patch` supersedes legacy-store migration and fixture-loading behavior: start a clean version-4 store, remove the fixture loader and preview strip, render the frontend in all deployment environments, and use a white welcome with the colored logo in both themes. The latest owner-supplied `patches/username-password-login.patch` supersedes name-based account selection and simulated password operations with browser-local username/password verification and administrator setup. It does not add Neon or centralized/server authentication.

The owner's October 11 instruction selected `main` and Vercel Production instead of Preview-only hosting. Its frontend-only scope and the local login patch were subsequently superseded by the October 12 server-integration authorization above. The following preview-state and local-login sections describe the isolated local adapter, not Production authentication or storage.

## Preview state and identity

Use domain types from `src/lib/types.ts`.

`createInitialData()` in `src/lib/mock-data.ts` returns empty `employees`, `departments`, `workdays`, `attendance`, `deductions`, `bonuses`, `months`, `payments`, `audit`, `evaluationSeasons`, `evaluationCycles`, `evaluationExams` and `examEvaluations` arrays. Only application settings and preview date constants remain. Do not import test fixtures into runtime modules or auto-create records for role switching, empty states or payroll archives.

`src/lib/preview-config.ts` exports `PREVIEW_STORAGE_KEY='centerpro-ui-preview-v4'`, `PREVIEW_STORAGE_VERSION=4` and the preview-only system administrator. After setup and password verification, its session has `kind: 'SYSTEM'`, `role: 'SUPER_ADMIN'`, name `مدير النظام`, the current credential `authVersion` and no `employeeId`. It must never contribute to employee counts, department membership, payroll or attendance.

Employee-backed sessions have `kind: 'EMPLOYEE'`, an existing active employee ID and `authVersion` matching the employee's saved credential version. Admin/Employee login must fail when a suitable account does not exist. A fresh installation must not fabricate those roles. The latest cleanup explicitly removes session v1/v2/v3 stores and remembered/data v1 stores instead of migrating them. Version-4 data and credential-version-valid sessions survive subsequent reloads. Old passwordless sessions, missing credentials and stale `authVersion` values cannot restore a signed-in session; invalidating a session must preserve its operational records. Settings resets to the new empty dataset, clears employee credentials and retains the configured system administrator and its session.

`useDemo()` from `@/components/demo-provider` exposes:

- `data`, `session`, `ready`, `remembered`, `systemConfigured`, `systemUsername`
- `login(username: string, password: string, remember?: boolean): Promise<boolean>`
- `setupSystemAdmin(username: string, password: string, remember?: boolean): Promise<boolean>`
- `setEmployeePassword(employeeId: string, password: string, onChanged?: () => void): Promise<void>`
- `logout()`, `resetDemo()`
- `updateData(updater: (draft: DemoData, currentSession: DemoSession | null) => void, audit?: AuditInput | ((before: DemoData, after: DemoData) => AuditInput | undefined))`

The updater receives a cloned draft. Mutate that draft directly; the provider validates the global single-open-day and evaluation mutation invariants before persisting it. Plaintext passwords never enter persisted domain state or audit events; only salted credential hashes are retained in the separate auth store. `useToast()` returns a `(message: string) => void` notification function. State uses session storage by default. Opting into **ابقني مسجلاً** stores a separate local data copy (`centerpro-ui-preview-data-v2`) and remembered sign-in (`centerpro-ui-preview-remembered-v2`). Logout clears remembered sign-in across tabs while preserving owner data for the next explicit login; reset clears operational data and employee credentials while preserving the system-administrator credential. Malformed or blocked storage must not erase another valid stored copy. This is browser-only preview storage, not production persistence.

The fixture loader is removed. `/login?switch=1` explicitly opens the username/password form even when a remembered session exists. Older cycles without a season retain their original IDs and snapshots, remain reviewable/closable, and appear under **دورات سابقة بلا موسم**; do not invent historical seasons.

## Local username/password login

There is no account selector or default password. A fresh browser with no configured system credential shows **تهيئة مدير النظام**, with `centerpro-owner` as the editable suggested username. The owner chooses a unique username, enters a password of at least six characters and confirms it. Successful setup signs in the separate system administrator; it must not fabricate an employee. Later sign-ins require **اسم المستخدم** and **كلمة المرور**. Trim usernames and compare them case-insensitively. Inactive or missing employee accounts, wrong passwords and employees without configured credentials cannot sign in.

`src/lib/local-auth.ts` stores schema version 1 at `localStorage['centerpro-local-auth-v1']`. Each credential contains a unique 16-byte random salt, a 32-byte PBKDF2-SHA-256 hash using 150,000 iterations, its version and update time. Store the configured system username with its credential; key employee credentials by employee ID. Password changes increment credential versions so existing stale sessions cannot be restored. Remembered sign-in retains the verified session and matching `authVersion`, never a plaintext password.

Employee creation persists the supplied password hash. Existing employees from older versions have no usable password until an authorized administrator sets one through **تغيير كلمة المرور**; do not invent or recover a password from previous simulated forms. Password reset remains subject to existing account-management roles and writes sanitized audit metadata only. System reset clears employee credentials and all operational records while preserving the system credential.

The owner's October 11 follow-up also permits password changes directly in **تعديل بيانات الموظف → حساب الدخول**. The optional **كلمة المرور الجديدة** field leaves the current credential unchanged when blank; a nonempty password must have at least six characters and is applied only on saving the form. Retain its draft across form steps only in memory, and discard it on cancel. ADMIN can manage EMPLOYEE accounts; SUPER_ADMIN can manage all employee-backed accounts, following existing permissions. A failed credential write leaves profile data and audit unchanged. The combined profile audit records `passwordChanged` and `sessionsInvalidated` flags, never passwords or credential hashes. The optional synchronous `onChanged` callback commits this audit before invalidating the actor's own session when a super-admin edits their own employee-backed account.

Credential setup and updates must fail if local storage or Web Crypto is unavailable. Malformed or inaccessible saved credentials must not be silently overwritten as a new owner setup, and failed persistence must not report success. Browser-local records and credentials are scoped to the current origin and browser; no Neon connection, server authentication or cross-device account synchronization is implemented by this patch.

## Evaluation and test fixtures

In the local test adapter, the independent system administrator is the only account that can be configured in a clean installation; the owner creates employee accounts through the UI. A fresh server installation instead remains locked pending its reviewed import. The seven-account factory remains available to automated tests only. No application control or provider method loads test employees.

Evaluation cycles are independent from payroll months. Admin and Super Admin may create one open cycle, create/reopen/close exams, and archive the cycle. Archiving freezes cycle and exam leaderboards and closes its exams atomically. A new cycle starts at zero. Archived counts, names, scores and exam metadata do not follow later employee or record changes.

Auditor access requires an active EMPLOYEE account with explicit `AUDIT_REVIEW.view`; department membership grants no access. The correction roster accepts normalized exact names `التصحيح` and `قسم التصحيح`. Creating a missing evaluation requires `create`, editing an existing one requires `edit`, and deletion requires its independent `delete` grant plus the reasoned confirmation flow. A view-and-delete account can delete an eligible row while its numeric inputs remain disabled.

SUPER_ADMIN can enter or edit numeric evaluations directly on exam details. Numeric editing requires an OPEN exam in an OPEN cycle and, when present, an OPEN season; CLOSED numeric values remain locked. SUPER_ADMIN can edit an OPEN or CLOSED exam's name, date and note within an OPEN cycle. ADMIN retains lifecycle controls without gaining direct numeric entry or exam-metadata editing. Archived cycle/season locks and existing safe-deletion restrictions remain in force for every role.

The corrector multiselect and exam selector appear in one toolbar. Error steppers place minus on the left and plus on the right; buttons save immediately, typed values save after a short debounce or on blur/navigation. Numeric saves retain the exam, employee and actor identity, reject closed/archived targets and record actual before/after values in the audit log. Numeric inputs have no save button; the exam-metadata dialog has its own save action.

Score is `papers − correctionErrors × 5 − behaviorErrors × 3`. Negative scores are allowed. Accuracy is `100 − (correctionErrors + behaviorErrors) / papers × 100`, clamped to 0–100 and shown as unavailable when papers are zero. Exam count is informational and never multiplies the score. Active correctors with no entries remain visible at zero. Ranking uses score descending, then papers descending, then Arabic name.

Correctors can view their own breakdown and full read-only cycle/exam leaderboards. Without an explicit audit-review grant, correctors see only `قيد التدقيق` for OPEN exams and receive cycle/season totals from CLOSED exams only. An employee from any department can open the auditor workspace when explicitly granted access; personal corrector views still require correction-roster eligibility. Required salary-number inputs start blank for new forms; explicit zero is valid and blank required values are rejected. Optional inherited daily rates remain optional.

Evaluation seasons sit above cycles and are independent from payroll months. Only one season may be open. Admin opens a season, opens/archives cycles inside it, then archives the season only when no cycle remains open. The season snapshot freezes its final rows and cycle IDs. Admin/auditor totals are live; corrector-visible totals publish closed exams only. Seasonal attendance is the count of `PRESENT` dates within the season; average papers/day is season papers divided by those days (or unavailable at zero days). Both are informational only.

Season rank is based only on seasonal score: Bronze 1/2/3 at 0/500/1000; Silver at 1500/2000/2500; Gold at 3000/3500/4000; Platinum at 4500/5000/5500; Diamond at 6000/6500/7000; Emerald at 7500/8000/8500; Master at 9000/10000/11000; Grandmaster at 12000+. The October 7 owner-supplied `patches/ui-clarity-rank-assets.patch` supersedes the October 5 SVG renderer with the supplied 22 faceted PNG assets based on the Hassan Falah mark. The October 11 patch replaces those images with its 22 supplied 1024×1024 transparent assets. Preserve the latest supplied images unchanged. Render them with contain sizing, without CSS shadows or a separate tile. The later October 11 edge fix uses a shared vector silhouette for Bronze through Master and a separate Grandmaster silhouette, with matching vector outline masks. Keep image, outline and optional shine aligned with contain sizing and centered positioning. The thin outline uses the tier color; no background tile or shadow is added. Reduced motion disables shine without hiding the image or outline. Keep all four SVG mask files present and decodable; a missing mask can hide the emblem.

The same October 5 patch enlarges typography, controls and spacing across administration and employee workspaces, with explicit light/dark colors. Avoid duplicated rank labels in profile/home summaries and remove the seasonal motivational phrase. Hide redundant helper descriptions while preserving entered department descriptions, validation/operational warnings and functional controls. Screen typography must not override compact report print styles. The October 7 patch removes shared page/card header descriptions and redundant dashboard/employee/attendance hints. Notifications have no close button and automatically dismiss after 3200ms; each new notification restarts its full lifecycle, including repeated messages. Preserve mobile navigation offsets when overriding desktop dimensions.

Admin corrector profiles show live seasonal rank, progress, totals and a link to the current or specific archived season. Corrector home totals remain limited to published exams. Audit-review permission does not itself confer or remove correction-roster eligibility or rank cards; a person absent from an archived snapshot must not receive an invented zero-point rank. The login slogan is **CenterPro معك بكل خطوة.** and login/app copyright is **Kal-EL VISIONS © 2026**.

## Welcome lifecycle

`WelcomeProvider` wraps the application once. `useWelcome()` exposes `active` and `showWelcome(): Promise<void>`. `WELCOME_DURATION_MS` is `3000`.

There is no splash before login. Only an explicit successful login awaits `showWelcome()` before navigation. The centered message is exactly two lines: `اهلاً بيك` and `موظفنا الـ مو عادي`. Refresh, ordinary navigation and restoration through **ابقني مسجلاً** do not replay it. Reduced motion changes animation, not duration/content. The latest October 11 cleanup uses the exact approved colored `/brand/logo.svg` directly in both themes, always on white with fixed dark text so the CP symbol remains complete. It must not change the saved application theme; dark mode resumes when the welcome ends. The administrator dashboard greeting is `مرحباً` instead of `صباح الخير`.

## Standalone calculator

The October 11 patch adds `/calculator` for signed-in administrators and employees. It is linked from their navigation; the later dedicated QR Display account remains restricted to the attendance screen. The page shows only the calculator and a return control, inherits the selected theme and keeps the numeric keypad left-to-right within the Arabic application.

Support the supplied immediate-execution arithmetic, decimals, sign toggle, percentage as division by 100, entry/all clear and keyboard input. Division by zero displays `خطأ` and permits recovery. The calculator has no effect on payroll, attendance or evaluation data. Returning from a menu visit stays inside the app; direct entry falls back to the role's home. Maintain usable touch controls, keyboard navigation and visible long results on phone, tablet and desktop.

## Salary terminology

| Internal concept | User-visible wording |
| --- | --- |
| `FIXED` | قطعي |
| `TIERED` | غير قطعي |
| Salary type label | نوع الراتب |
| Salary filter all-option | جميع الأنواع |
| Department salary rules | قوانين القسم |
| Add salary rule | إضافة قانون |
| Numbered rule | القانون 1، القانون 2… |

All visible validation errors, badges, filters, profiles and reports follow these labels. Internal names such as `SalaryTier`, `tiers` and `calculateTieredSalary()` stay stable. Do not change financial formulas for terminology-only work; the required-days formula below is explicitly authorized by the later patch.

## Required-days patch

`PayrollResult.requiredDays` counts PRESENT, EXCUSED, UNEXCUSED and UNRESOLVED records plus missing expected records in the employee’s monthly employment window. EXEMPT records never count. Non-fixed salary laws use required days, then subtract excused and unexcused deductions and other deductions, and add bonuses. Partial-month fixed salaries use `min(requiredDays × dailyRate, fixedSalary)`; full-month fixed salaries remain fixed.

Archived monetary snapshots remain unchanged. Older v2 snapshots without `requiredDays` derive only that display metric from their frozen attendance/absence/unresolved counts. Do not reprice stored version-4 archives. The latest cleanup explicitly discards older browser stores; subsequent version-4 hydration preserves saved records. Payroll ignores records outside employment start/end dates without deleting operational history.

Both employee phone fields are required: fixed visible `07` plus exactly nine editable digits. Store full eleven-digit numbers, including valid suffixes that themselves begin `07`. Telegram has a fixed visible `@`, stores the username without `@`, and accepts English letters, digits and underscore. Email is removed from employee forms/types/views. Notes remain optional. Creation/editing does not expose employment end date; deactivation sets it to `DEMO_TODAY`, activation clears it, and ordinary editing preserves it.

Attendance-record `ملاحظة / سبب` is optional for changing status and removing attendance. Removal still requires explicit confirmation, and changes still produce audit events. Day settings, archive and reopen reasons retain their existing requirements.

## Shared UI

Use `@/components/ui`: `Button` (primary/secondary/ghost/danger, loading and native button props); `Badge` (neutral/brand/success/warning/danger); `PageHeader`; `Card`; `StatCard`; `Field`; native-prop `Input`, `Select`, `Textarea`; accessible `Dialog`; `ConfirmDialog`; `EmptyState`; `Avatar`; `SearchInput`; `Pagination`; `Skeleton`; `Tabs`.

Common classes: `page-stack`, `grid-2`, `grid-3`, `stats-grid`, `form-grid`, `form-section`, `form-actions`, `field-span-2`, `toolbar`, `filter-row`, `data-table`, `table-wrap`, `mobile-cards`, `desktop-table`, `list-row`, `muted`, `amount`, `text-brand`, `text-danger`, `inline`, `stack`, `notice`, `notice-warning`, `detail-grid`, `detail-item`, `button-link`.

Preserve the approved design system: Crimson `#A51C30`, white, ink `#111318`, locally bundled Noto Sans Arabic and Inter, Arabic RTL, Latin digits and Lucide icons. Light remains default; an explicit saved Light/Dark toggle is supported and never follows the OS theme automatically. Financial values use LTR isolation so negative signs remain leading. Use mobile cards and contained table scrolling, with no body-level overflow.

Every zero-data screen provides a useful explanation and next step. No departments means employee creation routes to a department prerequisite. No eligible employees means attendance creation explains the prerequisite. No employees means adjustment forms stay closed. Zero payroll must not generate empty archive records.

## Dates and domain services

`lib/format`: `money(number)`, `number(number)`, `date(string)`, `time(string)`, `monthLabel(string)`, `duration(seconds)`, `attendanceDateLabel(string)` and `englishMonthName(string)`. Administrative attendance dates show the Arabic weekday and English month, for example `الخميس — 15 October 2026`; attendance month headings use English month names. This changes display only, not stored dates or attendance rules. Operational display timezone is `Asia/Baghdad`. `DEMO_TODAY='2026-09-28'` and `DEMO_MONTH='2026-09'` remain preview constants, not fixture records or a production clock.

`lib/payroll`: `getEmployeePayroll`, `getMonthPayroll`, `calculateTieredSalary`, `calculateFixedSalary`, `recalculateReopenedPayroll`. Keep financial calculations in the domain layer. Archived snapshots remain frozen; explicit Super Admin recalculation uses historical salary configuration and preserves historical employee/department context.

`lib/attendance`: `isExpected`, `getLatenessSeconds`, `statusLabel`, `assertSingleOpenWorkday`, `getOpenWorkday`, `assertCanOpenWorkday`, `assertUniqueWorkdayDate`.

At most one `OPEN` attendance day may exist system-wide, including across dates/months and reopen paths. Keep unique dates as an additional invariant. Unresolved expected employees block closing; never silently convert them to absence. Check-in seconds precision, no grace period, no automatic lateness deduction, absence formulas, inclusion/exclusion precedence, day-setting/archive reasons and audits remain intact; attendance-record notes follow the optional-note rule above.

## Routes and navigation

Admin routes: `/dashboard`, `/employees`, `/employees/[id]`, `/departments`, `/attendance`, `/attendance/[id]`, `/payroll`, `/deductions`, `/bonuses`, `/reports`, `/audit`, `/settings`, `/permissions`, `/evaluations`, `/evaluations/seasons`, `/evaluations/cycles`, `/evaluations/exams`, `/evaluations/[id]`. `/permissions` is SUPER_ADMIN-only.

`/evaluations` is the three-card administration hub. Seasons, cycles and exams have dedicated management pages. Historical season → cycle → exam navigation retains its context through query parameters; archived lists use frozen snapshots. Legacy seasonless cycles remain visible, reviewable and closable without inventing a season. Season closure sets its Baghdad end date before calculating the frozen snapshot.

There is one attendance navigation concept, **الحضور**. `/attendance` is the days hub; `/attendance?open=new` opens the creation flow or the current-open-day explanation. `/attendance/[id]` handles all settings and review for one day. `/workdays` redirects to `/attendance`; its legacy create query forwards safely. It is not a second management UI or navigation item.

`/attendance-display` is standalone and uses the single currently open day. Administrative navigation returns to **الحضور** when none exists; the dedicated QR Display account remains on its restricted display. Production QR tokens are signed by the server. Unsigned QR data exists only in the isolated local adapter.

Employee routes: `/employee`, `/employee/attendance`, `/employee/salary`, `/employee/profile`, `/employee/scan`, `/employee/audit`, `/employee/evaluation`, `/employee/deductions`, `/employee/bonuses`. Audit, deductions and bonuses navigation requires that feature's explicit view permission. Personal records derive identity from the session; evaluation leaderboards show the shared correction rankings as requested.

Use Next.js `useSearchParams()` under Suspense for query-driven actions. Do not read `window.location` in initializers to drive links such as `?add=1`; it can be stale during client navigation.

## Permissions and confirmations

Employees cannot enter admin pages or edit their own profile, credentials or attendance through generic record mutations. SUPER_ADMIN may grant active EMPLOYEE accounts separate view/create/edit/delete permissions for deductions, bonuses and audit review, through **الصلاحيات** or the employee account editor. Missing grants deny access; there are no defaults based on role history or department. Each action requires view, and disabling view clears the action grants. ADMIN cannot manage these permissions, change protected salary/role settings, manage Admin accounts, view audit/settings or reopen archived payroll.

Delegated financial screens expose only the granted collection and minimal employee descriptors; they do not grant colleagues' private profiles, attendance, payments or payroll snapshots. Existing personal salary access remains available without delegated grants. Each create/edit/delete action is separately authorized and retains month/archive locks. The permission editor preserves unsaved drafts, provides explicit save/cancel controls and reports conflicts rather than silently overwriting newer grants. Saved permission changes revoke the affected account's server sessions without changing its password. Production checks use canonical server data and filtered responses; hidden controls alone are not authorization.

Mutations update linked views, show clear feedback and preserve audit behavior. Strong confirmation is required for deactivation, removing attendance, deleting adjustments, salary setting changes and archive/reopen. Employee password reset remains a simple form without unnecessary confirmation; save a salted password hash and sanitized audit event, never the plaintext password.

## Complete local backup

An active SUPER_ADMIN can download **تحميل نسخة احتياطية كاملة** from Settings. `prepareSystemBackup(theme)` validates the current session before and after snapshot preparation. It includes the entire live saved data object and all current password hash records with their derivation parameters. The JSON file is versioned and carries a SHA-256 integrity checksum. Browser sessions and unrelated storage are excluded. It does not upload, clear, migrate or recalculate data; current storage keys and version remain unchanged. See `SYSTEM_BACKUP.md` for the portable file contract and verification evidence.

## Test isolation

Broad regression fixtures remain in `tests/fixtures/populated-data.ts`. The seven owner-requested test accounts remain in `createTestData()` for automated tests only; the cleanup patch removed the application fixture-loading action. Tests opt in explicitly; onboarding tests remain empty. `tests/e2e/helpers/preview.ts` supplies test/expect, fixture seeding, splash-aware login/navigation and preview data reads. Populated fixtures explicitly seed matching test credential hashes; login helpers submit the real username/password form. Its clock advances the actual post-login welcome timer; no app flag disables the splash.

Final acceptance requires lint, strict typecheck, domain tests, production build, browser workflows, responsive review and verification of the authorized Vercel deployment target. The October 11 owner instruction selects Production from `main`. Current complete system backup verification and deployment evidence is recorded in `SYSTEM_BACKUP.md`. The preceding inline employee password edit is recorded in `EMPLOYEE_PASSWORD_EDIT_ACCEPTANCE.md`. `USERNAME_PASSWORD_ACCEPTANCE.md` records the preceding username/password login revision. `PRODUCTION_CLEANUP_ACCEPTANCE.md` records the previous verified Production revision at https://centerpro-sigma.vercel.app/login; it does not certify the new login revision. The previous season/rank patch is in `SEASONS_PATCH_ACCEPTANCE.md`, the audit/evaluation patch in `EVALUATION_PATCH_ACCEPTANCE.md`, the required-days patch in `PATCH_ACCEPTANCE.md`, and the preceding revision in `PHASE1_ACCEPTANCE.md`; do not copy historical gate counts into a new delivery claim.
