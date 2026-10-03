# Shared frontend contract — revised Phase 1

## Authoritative revision

`MASTER_SPECIFICATION.txt` remains the unchanged original specification. `PHASE1_REVISION_REQUEST.md` is the later owner-approved addendum and takes precedence for startup data, preview administrator, salary terminology, attendance architecture, the single-open-day rule and the five-second welcome. The later owner-supplied `patches/required-days_employee-form_attendance.patch` overrides salary-basis, employee-form and attendance-note requirements as described below. The October 3 `patches/audit-evaluation-testdata.patch` adds evaluation workflows, explicit preview test data and name-based preview login. No Phase 2 work is authorized.

## Preview state and identity

Use domain types from `src/lib/types.ts`.

`createInitialData()` in `src/lib/mock-data.ts` returns empty `employees`, `departments`, `workdays`, `attendance`, `deductions`, `bonuses`, `months`, `payments`, `audit`, `evaluationCycles`, `evaluationExams` and `examEvaluations` arrays. Only application settings and preview date constants remain. Do not import test fixtures into runtime modules or auto-create records for role switching, empty states or payroll archives.

`src/lib/preview-config.ts` exports `PREVIEW_STORAGE_KEY='centerpro-ui-preview-v3'`, `PREVIEW_STORAGE_VERSION=3` and the preview-only system administrator. Its session has `kind: 'SYSTEM'`, `role: 'SUPER_ADMIN'`, name `مدير النظام` and no `employeeId`. It must never contribute to employee counts, department membership, payroll or attendance.

Employee-backed sessions have `kind: 'EMPLOYEE'` and an existing active employee ID. Admin/Employee login must fail when a suitable account does not exist. A fresh installation must not fabricate those roles. Valid v2 owner data migrates to v3 with empty evaluation collections and preserves its original v2 key. v1 fixture storage is removed/ignored; Settings resets to the new empty dataset and the system administrator session.

`useDemo()` from `@/components/demo-provider` exposes:

- `data`, `session`, `ready`
- `login(role: Role, employeeId?: string): boolean`
- `logout()`, `resetDemo()`, `loadTestData(): boolean`
- `updateData(updater: (draft: DemoData, currentSession: DemoSession | null) => void, audit?: AuditInput | ((before: DemoData, after: DemoData) => AuditInput | undefined))`

The updater receives a cloned draft. Mutate that draft directly; the provider validates the global single-open-day and evaluation mutation invariants before persisting it. Passwords never enter state. `useToast()` returns a `(message: string) => void` notification function. State is local to the browser tab and is not production persistence.

## Evaluation and explicit test data

The account selector at `/login` enters the chosen preview identity directly, without username/password fields. The owner may use the independent system administrator or explicitly load six test employee accounts when all operational collections are empty. The loader also enforces that precondition at the shared provider boundary and preserves application settings. It creates four correction employees and two auditors with the patch’s attendance records, no exams and no evaluations. It never auto-loads on navigation, role switching or reset.

Evaluation cycles are independent from payroll months. Admin and Super Admin may create one open cycle, create/reopen/close exams, and archive the cycle. Archiving freezes cycle and exam leaderboards and closes its exams atomically. A new cycle starts at zero. Archived counts, names, scores and exam metadata do not follow later employee or record changes.

Employees in `التدقيق` can edit active `التصحيح` employees on open exams in the open cycle. The corrector multiselect and exam selector appear in one toolbar. Error steppers place minus on the left and plus on the right; buttons save immediately, typed values save after a short debounce or on blur/navigation. Saves retain the exam, employee and actor identity, reject closed/archived targets and record actual before/after values in the audit log. There is no save button.

Score is `papers − correctionErrors × 5 − behaviorErrors × 3`. Negative scores are allowed. Accuracy is `100 − (correctionErrors + behaviorErrors) / papers × 100`, clamped to 0–100 and shown as unavailable when papers are zero. Exam count is informational and never multiplies the score. Active correctors with no entries remain visible at zero. Ranking uses score descending, then papers descending, then Arabic name.

Correctors can view their own breakdown and full read-only cycle/exam leaderboards. Other employee departments cannot open the auditor or corrector views. Required salary-number inputs start blank for new forms; explicit zero is valid and blank required values are rejected. Optional inherited daily rates remain optional.

## Welcome lifecycle

`WelcomeProvider` wraps the application once. `useWelcome()` exposes `active` and `showWelcome(): Promise<void>`. `WELCOME_DURATION_MS` is `5000`.

The initial full page load is covered before its destination appears. After successful preview login, await `showWelcome()` before navigation. Ordinary internal navigation must not replay the overlay. Full reloads must replay it. Display the official logo and exact message `مرحباً بك موظفنا المميز`. Reduced motion changes animation, not duration or content.

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

Preserve the approved design system: Crimson `#A51C30`, white, ink `#111318`, locally bundled Noto Sans Arabic and Inter, light-only Arabic RTL, Latin digits, Lucide icons. Financial values use LTR isolation so negative signs remain leading. Use mobile cards and contained table scrolling, with no body-level overflow.

Every zero-data screen provides a useful explanation and next step. No departments means employee creation routes to a department prerequisite. No eligible employees means attendance creation explains the prerequisite. No employees means adjustment forms stay closed. Zero payroll must not generate empty archive records.

## Dates and domain services

`lib/format`: `money(number)`, `number(number)`, `date(string)`, `time(string)`, `monthLabel(string)`, `duration(seconds)`. Operational display timezone is `Asia/Baghdad`. `DEMO_TODAY='2026-09-28'` and `DEMO_MONTH='2026-09'` remain preview constants, not fixture records or a production clock.

`lib/payroll`: `getEmployeePayroll`, `getMonthPayroll`, `calculateTieredSalary`, `calculateFixedSalary`, `recalculateReopenedPayroll`. Keep financial calculations in the domain layer. Archived snapshots remain frozen; explicit Super Admin recalculation uses historical salary configuration and preserves historical employee/department context.

`lib/attendance`: `isExpected`, `getLatenessSeconds`, `statusLabel`, `assertSingleOpenWorkday`, `getOpenWorkday`, `assertCanOpenWorkday`, `assertUniqueWorkdayDate`.

At most one `OPEN` attendance day may exist system-wide, including across dates/months and reopen paths. Keep unique dates as an additional invariant. Unresolved expected employees block closing; never silently convert them to absence. Check-in seconds precision, no grace period, no automatic lateness deduction, absence formulas, inclusion/exclusion precedence, day-setting/archive reasons and audits remain intact; attendance-record notes follow the optional-note rule above.

## Routes and navigation

Admin routes: `/dashboard`, `/employees`, `/employees/[id]`, `/departments`, `/attendance`, `/attendance/[id]`, `/payroll`, `/deductions`, `/bonuses`, `/reports`, `/audit`, `/settings`, `/evaluations`, `/evaluations/[id]`.

There is one attendance navigation concept, **الحضور**. `/attendance` is the days hub; `/attendance?open=new` opens the creation flow or the current-open-day explanation. `/attendance/[id]` handles all settings and review for one day. `/workdays` redirects to `/attendance`; its legacy create query forwards safely. It is not a second management UI or navigation item.

`/attendance-display` is standalone and uses the single currently open day. It returns to **الحضور** when none exists. QR remains unsigned preview data.

Employee routes: `/employee`, `/employee/attendance`, `/employee/salary`, `/employee/profile`, `/employee/scan`, `/employee/audit`, `/employee/evaluation`. Personal records derive identity from the session; evaluation leaderboards show the shared correction rankings as requested.

Use Next.js `useSearchParams()` under Suspense for query-driven actions. Do not read `window.location` in initializers to drive links such as `?add=1`; it can be stale during client navigation.

## Permissions and confirmations

Employees cannot enter admin pages or edit their own profile, credentials, attendance or financial records. Admin cannot change protected salary/role settings, manage Admin accounts, view audit/settings or reopen archived payroll. All permission checks are preview UX, not production security.

Mutations update linked views, show clear feedback and preserve audit behavior. Strong confirmation is required for deactivation, removing attendance, deleting adjustments, salary setting changes and archive/reopen. Employee password reset remains a simple form without unnecessary confirmation; passwords are never retained.

## Test isolation

Broad regression fixtures remain in `tests/fixtures/populated-data.ts`. The six owner-requested preview accounts live in `createTestData()` and load only through the explicit preview action. Tests opt in explicitly; onboarding tests remain empty. `tests/e2e/helpers/preview.ts` supplies test/expect, fixture seeding, splash-aware login/navigation and preview data reads. Its clock advances the actual welcome timer; no app flag disables the splash.

Final acceptance requires lint, strict typecheck, domain tests, production build, browser workflows, responsive review and a new Vercel Preview. Current patch evidence is tracked in `EVALUATION_PATCH_ACCEPTANCE.md`; the previous required-days patch is tracked in `PATCH_ACCEPTANCE.md`; the preceding revision is documented in `PHASE1_ACCEPTANCE.md`; do not copy historical gate counts into a new delivery claim.
