# Audit, evaluation and test-data patch

Date: 2026-10-03. Phase 1 frontend approval Preview.

Historical handoff. The current published revision and verification evidence are in [SEASONS_PATCH_ACCEPTANCE.md](SEASONS_PATCH_ACCEPTANCE.md).

## Source

The supplied `CenterPro_audit_evaluation_testdata(1).patch` applied cleanly to `90f9a2f01f4f03a9627add8440a2d6e338b08f3d`. Its exact 1,472 lines are preserved in [patches/audit-evaluation-testdata.patch](patches/audit-evaluation-testdata.patch).

SHA-256: `9064a0f71ed3d61fd5649909a1fde7db2f7314ff9c7871b0cf2fe4e2c49c625b`.

## Implemented

- Admin manages evaluation cycles and exams, closes/reopens exams and archives cycle rankings independently from payroll months.
- Auditors select an exam and multiple correctors together, enter paper counts and adjust correction/behavior errors with keyboard or plus/minus controls. Every edit saves automatically and records the acting auditor.
- Correctors see their own exam breakdown, cycle score and full read-only leaderboards. Score is papers minus five points per correction error and three per behavior error; exam count does not affect the score. Accuracy is informational.
- All active correctors appear at zero before input. Archived cycle and exam rankings retain the original names and figures. New cycles start at zero.
- Login selects an existing name directly, with no username/password entry. A fresh installation remains empty; an explicit **تحميل بيانات الاختبار** button creates the six requested accounts and attendance records, with no exams or evaluations.
- Required salary-number fields start blank in new forms. Blank required values are rejected; explicitly entered zero is accepted. Optional inherited daily rates remain optional.

## Preview accounts

| Department | Name | Present | Excused | Unexcused |
| --- | --- | ---: | ---: | ---: |
| التصحيح | ابرار حقي | 16 | 0 | 0 |
| التصحيح | هبة محمد | 7 | 2 | 0 |
| التصحيح | فاطمة فراس | 16 | 1 | 1 |
| التصحيح | مريم عصام | 18 | 0 | 0 |
| التدقيق | جعفر علي | 17 | 0 | 0 |
| التدقيق | مريم فهد | 4 | 2 | 0 |

The independent **مدير النظام — Super Admin** account is not an employee. Click **تحميل بيانات الاختبار** once, then select a name and **تسجيل الدخول**. Attendance uses the supplied September preview dates. Create a cycle/exam as the system administrator, then use either auditor account to enter evaluations and a corrector account to review them.

## Integration corrections

- Valid v2 owner data migrates to v3 with empty evaluation arrays; the previous v2 copy is retained. The supplied patch would otherwise delete it.
- Test data cannot overwrite an existing operational collection, including department-only or inactive-employee installations. Loading preserves application settings.
- Autosave isolates exam, employee and actor identities; combines pending field edits; saves on blur, exam/filter/route change and reload; and rejects writes after logout or closure.
- Audit events use the actual saved record ID and current before/after values. The shared mutation boundary checks roles, one open cycle, unique entries, numeric validity and frozen archives.
- Archiving snapshots the latest store atomically. Archived reads clone frozen results instead of recalculating from current employee details.
- Accessible input labels, responsive controls, text contrast and the fixed-department hidden-field validation were corrected during integration.

## Scope

This is the browser-only Phase 1 Preview. No additional Vercel environment variables are required. Production authentication, database integration and secure QR verification await the owner's explicit UI approval.

## Local validation

- ESLint, strict typecheck and optimized production build all passed after the final source change; 26 static pages generated.
- Vitest: 173 tests passed across seven files. This includes exact score/accuracy calculations, permissions, stale writes, immutable archive snapshots and the six-account payroll total of 2,150,000 IQD.
- Initial full browser run: 91 of 92 passed. The responsive test identified clipped auditor controls, then exposed a cramped corrector summary at 1024px. Both layouts were fixed to use available container width; test assertions were retained.
- Final focused browser run: all ten evaluation responsive/accessibility tests passed, covering eight screen sizes from 360px to 1920px and two axe audits. GitHub CI runs the complete suite again on the published application commit.
- Autosave, logout, exam closure, archive/reset, explicit test loading, existing-data preservation, required blank numbers and existing attendance/payroll/export flows passed their browser checks.
- Supplied patch preserved byte-for-byte; credential marker scan found no credentials in repository files.

## Published Preview

- Application commit: `a5f4f439dc01a4cfc7e040a948b6c13b56e2f41e`, pushed to `main` and `preview/ui-approval`.
- Verified login URL: https://centerpro-lmiza9hde-hussam9329s-projects.vercel.app/login
- Vercel deployment: `dpl_9hs5XtMttH3ywJ7YzQAx5ckBmMqB`, READY, Preview (`target: null`).
- Independent live browser verification: explicit six-account loading, direct system-admin entry, empty evaluation startup, cycle/exam creation, switching to جعفر علي and immediate autosave. Entering 100 papers, two correction errors and one behavior error produced 87 points and accuracy 97.00 / 100, with جعفر علي shown as the actor.
- [Verified deployed auditor workspace](evaluation-preview.jpg). These verification records exist only in the browser's local preview session.
- GitHub CI: https://github.com/Hussam9329/CenterPro/actions/runs/37151045613 — completed successfully. All quality steps passed: lint, strict typecheck, 173 unit tests, production build and the full 92-test browser suite. CI uploaded the browser report and verification artifacts.

The final handoff commit contains documentation and the verified screenshot only. The published application remains tied to the application commit above. Real-device UI approval remains with the owner.
