# Shared frontend contract — revised Phase 1

## Authoritative revision

`MASTER_SPECIFICATION.txt` remains the unchanged original specification. `PHASE1_REVISION_REQUEST.md` is the later owner-approved addendum and takes precedence for startup data, preview administrator, salary terminology, attendance architecture, the single-open-day rule and the five-second welcome. Other payroll and attendance rules remain unchanged. No Phase 2 work is authorized.

## Preview state and identity

Use domain types from `src/lib/types.ts`.

`createInitialData()` in `src/lib/mock-data.ts` returns empty `employees`, `departments`, `workdays`, `attendance`, `deductions`, `bonuses`, `months`, `payments` and `audit` arrays. Only application settings and preview date constants remain. Do not import test fixtures into runtime modules or auto-create records for role switching, empty states or payroll archives.

`src/lib/preview-config.ts` exports `PREVIEW_STORAGE_KEY='centerpro-ui-preview-v2'`, `PREVIEW_STORAGE_VERSION=2` and the preview-only system administrator. Its session has `kind: 'SYSTEM'`, `role: 'SUPER_ADMIN'`, name `مدير النظام` and no `employeeId`. It must never contribute to employee counts, department membership, payroll or attendance.

Employee-backed sessions have `kind: 'EMPLOYEE'` and an existing active employee ID. Admin/Employee login must fail when a suitable account does not exist. A fresh installation must not fabricate those roles. v1 fixture storage is removed/ignored; Settings resets to the new empty dataset and the system administrator session.

`useDemo()` from `@/components/demo-provider` exposes:

- `data`, `session`, `ready`
- `login(role: Role, employeeId?: string): boolean`
- `logout()`, `resetDemo()`
- `updateData(updater: (draft: DemoData) => void, audit?: AuditInput)`

The updater receives a cloned draft. Mutate that draft directly; the provider validates the global single-open-day invariant before persisting it. Passwords never enter state. `useToast()` returns a `(message: string) => void` notification function. State is local to the browser tab and is not production persistence.

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

All visible validation errors, badges, filters, profiles and reports follow these labels. Internal names such as `SalaryTier`, `tiers` and `calculateTieredSalary()` stay stable. Do not change financial formulas for terminology work.

## Shared UI

Use `@/components/ui`: `Button` (primary/secondary/ghost/danger, loading and native button props); `Badge` (neutral/brand/success/warning/danger); `PageHeader`; `Card`; `StatCard`; `Field`; native-prop `Input`, `Select`, `Textarea`; accessible `Dialog`; `ConfirmDialog`; `EmptyState`; `Avatar`; `SearchInput`; `Pagination`; `Skeleton`; `Tabs`.

Common classes: `page-stack`, `grid-2`, `grid-3`, `stats-grid`, `form-grid`, `form-section`, `form-actions`, `field-span-2`, `toolbar`, `filter-row`, `data-table`, `table-wrap`, `mobile-cards`, `desktop-table`, `list-row`, `muted`, `amount`, `text-brand`, `text-danger`, `inline`, `stack`, `notice`, `notice-warning`, `detail-grid`, `detail-item`, `button-link`.

Preserve the approved design system: Crimson `#A51C30`, white, ink `#111318`, locally bundled Noto Sans Arabic and Inter, light-only Arabic RTL, Latin digits, Lucide icons. Financial values use LTR isolation so negative signs remain leading. Use mobile cards and contained table scrolling, with no body-level overflow.

Every zero-data screen provides a useful explanation and next step. No departments means employee creation routes to a department prerequisite. No eligible employees means attendance creation explains the prerequisite. No employees means adjustment forms stay closed. Zero payroll must not generate empty archive records.

## Dates and domain services

`lib/format`: `money(number)`, `number(number)`, `date(string)`, `time(string)`, `monthLabel(string)`, `duration(seconds)`. Operational display timezone is `Asia/Baghdad`. `DEMO_TODAY='2026-09-28'` and `DEMO_MONTH='2026-09'` remain preview constants, not fixture records or a production clock.

`lib/payroll`: `getEmployeePayroll`, `getMonthPayroll`, `calculateTieredSalary`, `calculateFixedSalary`, `recalculateReopenedPayroll`. Keep financial calculations in the domain layer. Archived snapshots remain frozen; explicit Super Admin recalculation uses historical salary configuration and preserves historical employee/department context.

`lib/attendance`: `isExpected`, `getLatenessSeconds`, `statusLabel`, `assertSingleOpenWorkday`, `getOpenWorkday`, `assertCanOpenWorkday`, `assertUniqueWorkdayDate`.

At most one `OPEN` attendance day may exist system-wide, including across dates/months and reopen paths. Keep unique dates as an additional invariant. Unresolved expected employees block closing; never silently convert them to absence. Check-in seconds precision, no grace period, no automatic lateness deduction, absence formulas, inclusion/exclusion precedence, historical edit reasons and audits remain intact.

## Routes and navigation

Admin routes: `/dashboard`, `/employees`, `/employees/[id]`, `/departments`, `/attendance`, `/attendance/[id]`, `/payroll`, `/deductions`, `/bonuses`, `/reports`, `/audit`, `/settings`.

There is one attendance navigation concept, **الحضور**. `/attendance` is the days hub; `/attendance?open=new` opens the creation flow or the current-open-day explanation. `/attendance/[id]` handles all settings and review for one day. `/workdays` redirects to `/attendance`; its legacy create query forwards safely. It is not a second management UI or navigation item.

`/attendance-display` is standalone and uses the single currently open day. It returns to **الحضور** when none exists. QR remains unsigned preview data.

Employee routes: `/employee`, `/employee/attendance`, `/employee/salary`, `/employee/profile`, `/employee/scan`. Employee pages derive identity from the session and show only that account's records.

Use Next.js `useSearchParams()` under Suspense for query-driven actions. Do not read `window.location` in initializers to drive links such as `?add=1`; it can be stale during client navigation.

## Permissions and confirmations

Employees cannot enter admin pages or edit their own profile, credentials, attendance or financial records. Admin cannot change protected salary/role settings, manage Admin accounts, view audit/settings or reopen archived payroll. All permission checks are preview UX, not production security.

Mutations update linked views, show clear feedback and preserve audit behavior. Strong confirmation is required for deactivation, removing attendance, deleting adjustments, salary setting changes and archive/reopen. Employee password reset remains a simple form without unnecessary confirmation; passwords are never retained.

## Test isolation

Populated data lives exclusively in `tests/fixtures/populated-data.ts`. Tests opt in explicitly; onboarding tests remain empty. `tests/e2e/helpers/preview.ts` supplies test/expect, fixture seeding, splash-aware login/navigation and preview data reads. Its clock advances the actual welcome timer; no app flag disables the splash.

Final acceptance requires lint, strict typecheck, domain tests, production build, browser workflows, responsive review and a new Vercel Preview. Current revision evidence is tracked in `PHASE1_ACCEPTANCE.md`; do not copy historical gate counts into a new delivery claim.
