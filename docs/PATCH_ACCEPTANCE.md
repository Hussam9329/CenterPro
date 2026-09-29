# Required-days, employee-form and attendance patch

Date: 2026-09-29. Scope: Phase 1 frontend approval preview only.

## Source

The owner supplied `CenterPro_required-days_employee-form_attendance(1).patch`. It applied cleanly to `b56c3b8e270dc933b3e9330ea8ddf261d96112ae`. The exact 643-line patch is preserved in [patches/required-days_employee-form_attendance.patch](patches/required-days_employee-form_attendance.patch).

SHA-256: `6cf110924b99662c2843ca3f998f251d04a280575e42d373d03d68bd7a341bda`.

## Implemented changes

- Required days now choose non-fixed salary laws and partial-month fixed salary, before absence deductions and other adjustments. Exempt days are excluded. Full-month fixed salary is unchanged.
- Required-day counts appear in admin and employee attendance/payroll views, salary details and payroll reports, including numeric Excel columns and printable PDF output.
- Both employee phones require a fixed `07` plus nine editable digits. Telegram displays one fixed `@` and stores the username alone. Email and editable employment end date are removed. Administrative notes stay optional.
- Deactivation records the preview end date; reactivation clears it. Ordinary employee edits retain existing end dates.
- Attendance-record notes are optional. Removing attendance still requires confirmation and records an audit event. Day-setting and archive/reopen reasons keep their existing requirements.

## Integration fixes

- Corrected phone normalization so a valid nine-digit suffix beginning `07` is not stripped again.
- Existing v2 employee edits discard the removed legacy email field. Existing saved preview data is not reset.
- Archived snapshots without the new required-days field receive only a display-count fallback from their frozen status totals. No archived money or source records are changed.
- Payroll ignores stored attendance outside employment start/end dates without deleting operational history, including future unresolved records after deactivation.
- Corrected the full-month fixed-salary explanation and updated onboarding, report and reactivation test expectations to match the patch.

## Boundary

The installation remains empty on first use, with the independent preview system administrator. No Neon connection, production authentication, persistent payroll, secure QR validation or Production deployment was added. No Vercel environment variables are needed for this phase.

## Local validation

- ESLint: passed, no warnings.
- Strict typecheck: passed.
- Vitest: 114 tests passed across 5 files.
- Optimized production build: passed, 23 routes generated. A corrupt local Turbopack cache was removed before the successful clean build.
- Browser suite: 68 of 69 passed on the full run; the remaining failure was an assertion expecting an undefined property that JSON omits. After correcting the assertion, all 6 people workflows passed on the focused rerun. The complete suite also runs on GitHub CI for the pushed application commit.
- Coverage includes eight responsive sizes, empty and populated workflows, accessibility, PWA, attendance audit/confirmation behavior, numeric XLSX cells and an actual one-page branded PDF.
- Temporary Chromium had to be restored in the local execution environment; no browser package was added to the application dependencies.
