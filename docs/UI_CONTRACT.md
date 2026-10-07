# Shared frontend contract — revised Phase 1

## Authoritative revision

`MASTER_SPECIFICATION.txt` remains the unchanged original specification. `PHASE1_REVISION_REQUEST.md` is the later owner-approved addendum and takes precedence for startup data, preview administrator, salary terminology, attendance architecture and the single-open-day rule. The later owner-supplied `patches/required-days_employee-form_attendance.patch` overrides salary-basis, employee-form and attendance-note requirements as described below. The October 3 `patches/audit-evaluation-testdata.patch` adds evaluation workflows, explicit preview test data and name-based preview login. `SEASON_RANK_UI_REVISION.md` overrides older welcome, theme, test-account-count and evaluation-publication presentation rules. The subsequent `patches/rank-assets-audit-hub-ui-cleanup.patch` replaces rank assets, splits audit administration pages and updates profile/login presentation. The October 5 `patches/native-ranks-ui-clarity.patch` supersedes its displayed rank assets and typography as described below. The October 7 `patches/ui-clarity-rank-assets.patch` supersedes the October 5 rank renderer and further simplifies the shared UI. No Phase 2 work is authorized.

## Preview state and identity

Use domain types from `src/lib/types.ts`.

`createInitialData()` in `src/lib/mock-data.ts` returns empty `employees`, `departments`, `workdays`, `attendance`, `deductions`, `bonuses`, `months`, `payments`, `audit`, `evaluationSeasons`, `evaluationCycles`, `evaluationExams` and `examEvaluations` arrays. Only application settings and preview date constants remain. Do not import test fixtures into runtime modules or auto-create records for role switching, empty states or payroll archives.

`src/lib/preview-config.ts` exports `PREVIEW_STORAGE_KEY='centerpro-ui-preview-v3'`, `PREVIEW_STORAGE_VERSION=3` and the preview-only system administrator. Its session has `kind: 'SYSTEM'`, `role: 'SUPER_ADMIN'`, name `مدير النظام` and no `employeeId`. It must never contribute to employee counts, department membership, payroll or attendance.

Employee-backed sessions have `kind: 'EMPLOYEE'` and an existing active employee ID. Admin/Employee login must fail when a suitable account does not exist. A fresh installation must not fabricate those roles. Valid v2 owner data migrates to v3 with empty evaluation collections and preserves its original v2 key. v1 fixture storage is removed/ignored; Settings resets to the new empty dataset and the system administrator session.

`useDemo()` from `@/components/demo-provider` exposes:

- `data`, `session`, `ready`
- `login(role: Role, employeeId?: string, remember?: boolean): boolean`
- `logout()`, `resetDemo()`, `loadTestData(): boolean`
- `updateData(updater: (draft: DemoData, currentSession: DemoSession | null) => void, audit?: AuditInput | ((before: DemoData, after: DemoData) => AuditInput | undefined))`

The updater receives a cloned draft. Mutate that draft directly; the provider validates the global single-open-day and evaluation mutation invariants before persisting it. Passwords never enter state. `useToast()` returns a `(message: string) => void` notification function. State uses session storage by default. Opting into **ابقني مسجلاً** stores a separate local data copy (`centerpro-ui-preview-data-v1`) and remembered sign-in (`centerpro-ui-preview-remembered-v1`). Logout clears remembered sign-in across tabs while preserving owner data for the next explicit login; reset clears the operational data too. Malformed or blocked storage must not erase another valid stored copy. This is browser-only preview storage, not production persistence.

Loading test data does not sign in automatically. `/login?switch=1` explicitly opens account selection even when a remembered session exists. Older cycles without a season retain their original IDs and snapshots, remain reviewable/closable, and appear under **دورات سابقة بلا موسم**; do not invent historical seasons.

## Evaluation and explicit test data

The account selector at `/login` enters the chosen preview identity directly, without username/password fields. The owner may use the independent system administrator or explicitly load seven test employee accounts when all operational collections are empty. The loader also enforces that precondition at the shared provider boundary and preserves application settings. It creates four correction employees and three auditors with the patch’s attendance records, no exams and no evaluations. It never auto-loads on navigation, role switching or reset.

Evaluation cycles are independent from payroll months. Admin and Super Admin may create one open cycle, create/reopen/close exams, and archive the cycle. Archiving freezes cycle and exam leaderboards and closes its exams atomically. A new cycle starts at zero. Archived counts, names, scores and exam metadata do not follow later employee or record changes.

Employees in `التدقيق` can edit active `التصحيح` employees on open exams in the open cycle. The corrector multiselect and exam selector appear in one toolbar. Error steppers place minus on the left and plus on the right; buttons save immediately, typed values save after a short debounce or on blur/navigation. Saves retain the exam, employee and actor identity, reject closed/archived targets and record actual before/after values in the audit log. There is no save button.

Score is `papers − correctionErrors × 5 − behaviorErrors × 3`. Negative scores are allowed. Accuracy is `100 − (correctionErrors + behaviorErrors) / papers × 100`, clamped to 0–100 and shown as unavailable when papers are zero. Exam count is informational and never multiplies the score. Active correctors with no entries remain visible at zero. Ranking uses score descending, then papers descending, then Arabic name.

Correctors can view their own breakdown and full read-only cycle/exam leaderboards. While an exam is `OPEN`, its errors, score and leaderboard are private to Admin/auditors; correctors see only `قيد التدقيق`. Corrector-visible cycle/season totals include only `CLOSED` exams so an open result cannot leak indirectly. Other employee departments cannot open the auditor or corrector views. Required salary-number inputs start blank for new forms; explicit zero is valid and blank required values are rejected. Optional inherited daily rates remain optional.

Evaluation seasons sit above cycles and are independent from payroll months. Only one season may be open. Admin opens a season, opens/archives cycles inside it, then archives the season only when no cycle remains open. The season snapshot freezes its final rows and cycle IDs. Admin/auditor totals are live; corrector-visible totals publish closed exams only. Seasonal attendance is the count of `PRESENT` dates within the season; average papers/day is season papers divided by those days (or unavailable at zero days). Both are informational only.

Season rank is based only on seasonal score: Bronze 1/2/3 at 0/500/1000; Silver at 1500/2000/2500; Gold at 3000/3500/4000; Platinum at 4500/5000/5500; Diamond at 6000/6500/7000; Emerald at 7500/8000/8500; Master at 9000/10000/11000; Grandmaster at 12000+. The October 7 owner-supplied `patches/ui-clarity-rank-assets.patch` supersedes the October 5 SVG renderer with the supplied 22 faceted PNG assets based on the Hassan Falah mark. Preserve those 512×512 transparent images unchanged. Render them with contain sizing, without CSS shadows or a separate tile. Optional shine uses the same asset as its alpha mask, with matching size and position; reduced motion disables shine without hiding the image.

The same October 5 patch enlarges typography, controls and spacing across administration and employee workspaces, with explicit light/dark colors. Avoid duplicated rank labels in profile/home summaries and remove the seasonal motivational phrase. Hide redundant helper descriptions while preserving entered department descriptions, validation/operational warnings and functional controls. Screen typography must not override compact report print styles. The October 7 patch removes shared page/card header descriptions and redundant dashboard/employee/attendance hints. Notifications have no close button and automatically dismiss after 3200ms; each new notification restarts its full lifecycle, including repeated messages. Preserve mobile navigation offsets when overriding desktop dimensions.

Admin corrector profiles show live seasonal rank, progress, totals and a link to the current or specific archived season. Corrector home totals remain limited to published exams. Auditors do not receive corrector rank cards, and a person absent from an archived snapshot must not receive an invented zero-point rank. The login slogan is **CenterPro معك بكل خطوة.** and login/app copyright is **Kal-EL VISIONS © 2026**.

## Welcome lifecycle

`WelcomeProvider` wraps the application once. `useWelcome()` exposes `active` and `showWelcome(): Promise<void>`. `WELCOME_DURATION_MS` is `3000`.

There is no splash before login. Only an explicit successful login awaits `showWelcome()` before navigation. The centered message is exactly two lines: `اهلاً بيك` and `موظفنا الـ مو عادي`. Refresh, ordinary navigation and restoration through **ابقني مسجلاً** do not replay it. Reduced motion changes animation, not duration/content.

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

Archived monetary snapshots remain unchanged. Older v2 snapshots without `requiredDays` derive only that display metric from their frozen attendance/absence/unresolved counts. Do not reprice archives or reset saved preview data during migration. Payroll ignores records outside employment start/end dates without deleting operational history.

Both employee phone fields are required: fixed visible `07` plus exactly nine editable digits. Store full eleven-digit numbers, including valid suffixes that themselves begin `07`. Telegram has a fixed visible `@`, stores the username without `@`, and accepts English letters, digits and underscore. Email is removed from employee forms/types/views. Notes remain optional. Creation/editing does not expose employment end date; deactivation sets it to `DEMO_TODAY`, activation clears it, and ordinary editing preserves it.

Attendance-record `ملاحظة / سبب` is optional for changing status and removing attendance. Removal still requires explicit confirmation, and changes still produce audit events. Day settings, archive and reopen reasons retain their existing requirements.

## Shared UI

Use `@/components/ui`: `Button` (primary/secondary/ghost/danger, loading and native button props); `Badge` (neutral/brand/success/warning/danger); `PageHeader`; `Card`; `StatCard`; `Field`; native-prop `Input`, `Select`, `Textarea`; accessible `Dialog`; `ConfirmDialog`; `EmptyState`; `Avatar`; `SearchInput`; `Pagination`; `Skeleton`; `Tabs`.

Common classes: `page-stack`, `grid-2`, `grid-3`, `stats-grid`, `form-grid`, `form-section`, `form-actions`, `field-span-2`, `toolbar`, `filter-row`, `data-table`, `table-wrap`, `mobile-cards`, `desktop-table`, `list-row`, `muted`, `amount`, `text-brand`, `text-danger`, `inline`, `stack`, `notice`, `notice-warning`, `detail-grid`, `detail-item`, `button-link`.

Preserve the approved design system: Crimson `#A51C30`, white, ink `#111318`, locally bundled Noto Sans Arabic and Inter, Arabic RTL, Latin digits and Lucide icons. Light remains default; an explicit saved Light/Dark toggle is supported and never follows the OS theme automatically. Financial values use LTR isolation so negative signs remain leading. Use mobile cards and contained table scrolling, with no body-level overflow.

Every zero-data screen provides a useful explanation and next step. No departments means employee creation routes to a department prerequisite. No eligible employees means attendance creation explains the prerequisite. No employees means adjustment forms stay closed. Zero payroll must not generate empty archive records.

## Dates and domain services

`lib/format`: `money(number)`, `number(number)`, `date(string)`, `time(string)`, `monthLabel(string)`, `duration(seconds)`. Operational display timezone is `Asia/Baghdad`. `DEMO_TODAY='2026-09-28'` and `DEMO_MONTH='2026-09'` remain preview constants, not fixture records or a production clock.

`lib/payroll`: `getEmployeePayroll`, `getMonthPayroll`, `calculateTieredSalary`, `calculateFixedSalary`, `recalculateReopenedPayroll`. Keep financial calculations in the domain layer. Archived snapshots remain frozen; explicit Super Admin recalculation uses historical salary configuration and preserves historical employee/department context.

`lib/attendance`: `isExpected`, `getLatenessSeconds`, `statusLabel`, `assertSingleOpenWorkday`, `getOpenWorkday`, `assertCanOpenWorkday`, `assertUniqueWorkdayDate`.

At most one `OPEN` attendance day may exist system-wide, including across dates/months and reopen paths. Keep unique dates as an additional invariant. Unresolved expected employees block closing; never silently convert them to absence. Check-in seconds precision, no grace period, no automatic lateness deduction, absence formulas, inclusion/exclusion precedence, day-setting/archive reasons and audits remain intact; attendance-record notes follow the optional-note rule above.

## Routes and navigation

Admin routes: `/dashboard`, `/employees`, `/employees/[id]`, `/departments`, `/attendance`, `/attendance/[id]`, `/payroll`, `/deductions`, `/bonuses`, `/reports`, `/audit`, `/settings`, `/evaluations`, `/evaluations/seasons`, `/evaluations/cycles`, `/evaluations/exams`, `/evaluations/[id]`.

`/evaluations` is the three-card administration hub. Seasons, cycles and exams have dedicated management pages. Historical season → cycle → exam navigation retains its context through query parameters; archived lists use frozen snapshots. Legacy seasonless cycles remain visible, reviewable and closable without inventing a season. Season closure sets its Baghdad end date before calculating the frozen snapshot.

There is one attendance navigation concept, **الحضور**. `/attendance` is the days hub; `/attendance?open=new` opens the creation flow or the current-open-day explanation. `/attendance/[id]` handles all settings and review for one day. `/workdays` redirects to `/attendance`; its legacy create query forwards safely. It is not a second management UI or navigation item.

`/attendance-display` is standalone and uses the single currently open day. It returns to **الحضور** when none exists. QR remains unsigned preview data.

Employee routes: `/employee`, `/employee/attendance`, `/employee/salary`, `/employee/profile`, `/employee/scan`, `/employee/audit`, `/employee/evaluation`. Personal records derive identity from the session; evaluation leaderboards show the shared correction rankings as requested.

Use Next.js `useSearchParams()` under Suspense for query-driven actions. Do not read `window.location` in initializers to drive links such as `?add=1`; it can be stale during client navigation.

## Permissions and confirmations

Employees cannot enter admin pages or edit their own profile, credentials, attendance or financial records. Admin cannot change protected salary/role settings, manage Admin accounts, view audit/settings or reopen archived payroll. All permission checks are preview UX, not production security.

Mutations update linked views, show clear feedback and preserve audit behavior. Strong confirmation is required for deactivation, removing attendance, deleting adjustments, salary setting changes and archive/reopen. Employee password reset remains a simple form without unnecessary confirmation; passwords are never retained.

## Test isolation

Broad regression fixtures remain in `tests/fixtures/populated-data.ts`. The seven owner-requested preview accounts live in `createTestData()` and load only through the explicit preview action. Tests opt in explicitly; onboarding tests remain empty. `tests/e2e/helpers/preview.ts` supplies test/expect, fixture seeding, splash-aware login/navigation and preview data reads. Its clock advances the actual post-login welcome timer; no app flag disables the splash.

Final acceptance requires lint, strict typecheck, domain tests, production build, browser workflows, responsive review and a new Vercel Preview. Current patch evidence is tracked in `SEASONS_PATCH_ACCEPTANCE.md`. The previous audit/evaluation patch is in `EVALUATION_PATCH_ACCEPTANCE.md`, the required-days patch in `PATCH_ACCEPTANCE.md`, and the preceding revision in `PHASE1_ACCEPTANCE.md`; do not copy historical gate counts into a new delivery claim.
